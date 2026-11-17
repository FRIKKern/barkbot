// The conversation's server functions. Their bodies run on the server only (TanStack Start
// strips them from the browser bundle), so they may use server/barkpark.
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {createServerFn} from '@tanstack/react-start'
import {bp, conf, BarkparkError, READ_MS} from '../server/barkpark'
import {CREATE_UNSURE} from './create-unsure'
import {addId, botFolder, dropBot, freshId, legacyName, listIds, mainBotId, NO_MESSAGES, oneAtATime, putBot, READ_CAP, readBot, readBots, readListed, removeId, sessionOf, setBotField, trusted, validColour, validName, validShape, write, type Bot, type OwnSession, type SessionCheck} from '../server/bots'

export type Host = {id: string; name: string; online: boolean}
/** A bot as the page gets it: its id, its name, and `main` on the Main Bot (its id is made from its
 *  computer's, mainBotId), which the rail draws alone in the main slot with the Main Bot badge, as the
 *  gate scenes and Grok's rail do (task-b04631fa0d533e9a). The record's pointers stay on the server. */
export type ChatBot = {id: string; name: string; main?: boolean}
/** The bots in rail order, the open one (`botId`, `bot` its name), its computer and its conversation,
 *  a plain line when a preference could not be read or saved (`notice`), and each bot's conversation
 *  by bot id (`sessions`: only sessions checked as the caller's own, for Working and Unread per tile). */
export type Chat = {bots: ChatBot[]; botId: string; bot: string; host: Host | null; sessionId: string | null; startedAt: string | null; notice: string | null; sessions: Record<string, string>}

type RawHost = {id: string; name: string; online: boolean; enrolled: boolean; revoked: boolean}
type RawSession = {id: string; execution_target: string; execution_host_id?: string | null; inserted_at: string; status: string}

// Phase 1 has one bot, on one computer: the host enrolled under this name (npm run host:enroll).
const HOST_NAME = () => process.env.BARKBOT_HOST_NAME || 'BarkBot Mac'
const BOT_NAME = () => process.env.BARKBOT_NAME || 'BarkBot'

async function findHost(): Promise<Host | null> {
  const {hosts} = await bp<{hosts: RawHost[]}>(`/w/${conf().workspace}/v1/chat-hosts`)
  const h = hosts.find((x) => x.name === HOST_NAME() && x.enrolled && !x.revoked)
  return h ? {id: h.id, name: h.name, online: h.online} : null
}

// Whether a conversation has a bot folder, as a read that worked showed it. Barkpark sets the folder
// only when it makes the conversation, so the answer never changes: it is kept for the life of this
// server and not asked again (with no bot list and the saved name unreadable, every load picks the
// Main Bot's conversation anew). A read that failed is never kept. The oldest goes first past 500.
const folderKnown = new Map<string, boolean>()
const remember = (id: string, has: boolean) => {
  folderKnown.delete(id)
  folderKnown.set(id, has)
  if (folderKnown.size > 500) folderKnown.delete(folderKnown.keys().next().value as string)
}

/** Today's conversation for the Main Bot: the newest of `onHost` that no listed bot names (`taken`)
 *  and that Barkpark shows with no bot folder. A conversation with a folder is a made bot's, whose
 *  record may never have saved it, and the Main Bot works in the computer's shared root, never in a
 *  bot's folder. Barkpark's list carries no bot_folder, so each one is read on its own, newest
 *  first, unless an earlier read already showed it (folderKnown). One that is gone (404) is passed
 *  over; a read that fails, or does not answer within READ_MS, is not "no folder", so none is picked. */
async function folderless<S extends {id: string}>(onHost: S[], taken: Set<string | null>): Promise<S | undefined> {
  for (const s of onHost) {
    if (taken.has(s.id)) continue
    const known = folderKnown.get(s.id)
    if (known === false) return s
    if (known === true) continue
    try {
      const shown = await bp<{bot_folder?: unknown}>(`/v1/chat/sessions/${encodeURIComponent(s.id)}?since=${NO_MESSAGES}`)
      const has = !(shown.bot_folder === null || shown.bot_folder === undefined)
      remember(s.id, has)
      if (!has) return s
    } catch (e) {
      if (e instanceof BarkparkError && e.status === 404) continue
      console.warn(`barkbot: could not read a conversation for the Main Bot (${(e as Error).message})`)
      return undefined
    }
  }
  return undefined
}

// The caller's own computers and sessions, as Barkpark lists them to the caller: what a stored
// bot record is checked against (server/bots.ts trusted).
async function ownHosts(): Promise<Host[]> {
  const {hosts} = await bp<{hosts: RawHost[]}>(`/w/${conf().workspace}/v1/chat-hosts`)
  return hosts.filter((x) => x.enrolled && !x.revoked).map((h) => ({id: h.id, name: h.name, online: h.online}))
}
async function ownSessions(): Promise<OwnSession[]> {
  const {sessions} = await bp<{sessions: RawSession[]}>('/v1/chat/sessions')
  return sessions.filter((s) => s.execution_target === 'registered_host')
}

// A preference that could not be read or saved is said in one plain line; the page goes on.
const NOT_READ = 'Some of your bots could not be read from Barkpark, so this may not be all of them. Reload to try again.'
const NOT_SAVED = 'Your bot could not be saved to Barkpark, so a new name or conversation may not be kept. Reload to try again.'
const got = <T,>(p: Promise<T>, what: string): Promise<{ok: true; v: T} | {ok: false}> =>
  p.then(
    (v) => ({ok: true as const, v}),
    (e) => {
      console.warn(`barkbot: could not ${what} (${(e as Error).message})`)
      return {ok: false as const}
    },
  )

/** The bots, in rail order, and the open one's computer and conversation.
 *  The Main Bot is today's bot, made from today's state, additively, on the first load that finds
 *  its id missing from the list, whatever else the list holds: its id is a UUID v5 of the
 *  computer's id (two tabs write the same keys), its name the legacy pref (or BARKBOT_NAME when it
 *  is unset). Its conversation is the newest one on that computer that no listed bot names and that
 *  has no bot folder (today's rule, used this once); none when a record could not be read. Only the
 *  new keys are written; the legacy barkbot.bot is never written or deleted.
 *  A preference read or write that fails never fails the page: it shows what it could read, writes
 *  nothing more, and says so (`notice`). A Main Bot record already there is kept, never written
 *  over: a load whose list add failed is repaired by the next.
 *  ?bot=<id>: the open bot, else the first in the rail. */
export const loadChat = createServerFn({method: 'GET'})
  .validator((botId: string | null | undefined) => (typeof botId === 'string' ? botId : null))
  .handler(async ({data: want}): Promise<Chat> => {
  const [hosts, ids, legacy] = await Promise.all([ownHosts(), got(listIds(), 'read the bots'), got(legacyName(), 'read the saved bot name')])
  const host = hosts.find((h) => h.name === HOST_NAME()) ?? null
  // Today's name: the legacy pref, else BARKBOT_NAME. If the read failed it is not known, so it is shown, never saved.
  const todays = legacy.ok ? (legacy.v ?? BOT_NAME()) : BOT_NAME()
  if (!host) {
    // No computer: no record can be made (a bot names its computer). Today's name, nothing written.
    return {bots: [{id: 'no-computer', name: todays}], botId: 'no-computer', bot: todays, host: null, sessionId: null, startedAt: null, notice: null, sessions: {}}
  }
  const sessions = await ownSessions()
  const onHost = sessions.filter((s) => s.execution_host_id === host.id).sort((a, b) => b.inserted_at.localeCompare(a.inserted_at))
  // The list as read, or null when the read failed. Empty: the store was never made (today's state).
  const listed = ids.ok ? (ids.v ?? []) : null
  const r = listed?.length ? await readBots(listed, hosts, sessions) : {bots: [], unread: 0}
  let notice: string | null = !ids.ok || r.unread ? NOT_READ : null
  let rail: {bot: Bot; session: SessionCheck}[] = r.bots
  // Today's conversation: the newest on the computer, if it is surely no other bot's (task-b910d6ee3d466fd1).
  // Sure only when every listed bot was read and kept: a dropped record, one that could not be read,
  // or one beyond what a load reads may name it, and the pick is saved. Otherwise none.
  // A conversation with a bot folder is never today's: it is a made bot's (folderless). It is
  // picked only when it is used, once: a load whose Main Bot is listed reads no conversation.
  const whole = listed !== null && listed.length <= READ_CAP && !r.unread && r.bots.length === listed.length
  const taken = new Set(r.bots.map(({bot}) => bot.session_id))
  const main: Bot = {id: mainBotId(host.id), name: todays, host_id: host.id, session_id: null, created_at: new Date().toISOString()}
  let picked: Promise<{bot: Bot; session: SessionCheck}> | undefined
  const withToday = () =>
    (picked ??= (whole ? folderless(onHost, taken) : Promise.resolve(undefined)).then((today) => ({
      bot: {...main, session_id: today?.id ?? null, created_at: today?.inserted_at ?? main.created_at},
      session: today ? ({is: 'open', session: today} as const) : ({is: 'none'} as const),
    })))
  // The move-in never makes the list longer than a load reads: at READ_CAP it waits, nothing written.
  if (listed && !listed.includes(main.id) && listed.length < READ_CAP) {
    if (!legacy.ok) {
      // The move-in waits for a read of today's name that worked: a failed read is not "unset".
      notice = NOT_READ
    } else {
      const there = await got(readBot(main.id), 'read the Main Bot')
      const kept = there.ok && there.v ? trusted(main.id, there.v, hosts) : null
      if (!there.ok) notice = NOT_READ
      else if (kept) {
        // Made by a load whose list add failed: keep it as it is now (it may be renamed), add its id.
        const session = await sessionOf(kept, sessions)
        if (session.is !== 'foreign') {
          rail = [...rail, {bot: kept, session}]
          if (!(await got(addId(kept.id), 'add the Main Bot to the list')).ok) notice = NOT_SAVED
        }
      } else if (!there.v) {
        // Nothing half-made: the id joins the list only after its record is whole.
        const moving = await withToday()
        if (!(await got(putBot(moving.bot), 'save the Main Bot')).ok) notice = NOT_SAVED
        else {
          rail = [...rail, moving]
          if (!(await got(addId(main.id), 'add the Main Bot to the list')).ok) notice = NOT_SAVED
        }
      }
      // A Main Bot key that is there but not well formed is never written over: in memory only.
    }
  }
  // Nothing to show: the Main Bot from what the caller itself can see, written nowhere. Once the
  // store exists (or could not be read) it opens no conversation: the newest one on the computer
  // may be another bot's, and a message would go to the wrong bot.
  if (!rail.length) rail = [listed?.length === 0 ? await withToday() : {bot: main, session: {is: 'none'}}]
  const open = rail.find((x) => x.bot.id === want) ?? rail[0]
  const session = open.session.is === 'open' ? open.session.session : null
  const home = hosts.find((h) => h.id === open.bot.host_id) ?? host
  // Each bot's conversation, for the fleet stream's Working and Unread per tile: only a session sessionOf opened.
  const byBot = Object.fromEntries(rail.flatMap((x) => (x.session.is === 'open' ? [[x.bot.id, x.session.session.id]] : [])))
  return {bots: rail.map(({bot}) => ({id: bot.id, name: bot.name, ...(bot.id === main.id && {main: true})})), botId: open.bot.id, bot: open.bot.name, host: home, sessionId: session?.id ?? null, startedAt: session?.inserted_at ?? null, notice, sessions: byBot}
})

// Each Create try's id: random. In dev only (vite build leaves it out), BARKBOT_TEST_MINT_FILE, set
// by scripts/behaviour.mjs against its stand-in Barkpark, names a file whose lines are the ids the
// tries take first. A line whose record is there, or could not be read, is dropped: the test hook
// never writes over a record, listed or not.
async function minter(): Promise<(i: number) => string> {
  const file = import.meta.env.DEV ? process.env.BARKBOT_TEST_MINT_FILE : undefined
  const given: string[] = []
  if (file) {
    let lines: string[] = []
    try {
      lines = readFileSync(file, 'utf8').split('\n').map((x) => x.trim()).filter(Boolean)
    } catch {}
    for (const id of lines) if ((await readBot(id).catch(() => 'unread')) === null) given.push(id)
  }
  return (i) => given[i] ?? randomUUID()
}

/** Create in the New Bot dialog: a new bot on the enrolled computer, with an empty conversation
 *  that Barkpark makes on its first message (startChat saves it), so a failed Create leaves no
 *  session behind. Its record is written whole first, its id added to the list last, so a bot
 *  shows only once it is whole; if the add fails the record is removed again. It is refused, with
 *  nothing written, when no computer is enrolled (a bot works on a computer) or when the list
 *  holds as many ids as one load reads (READ_CAP) once the ids proven to have no record are gone
 *  (roomFor).
 *  Its first conversation asks for its own folder on the computer (botFolder), one no listed bot
 *  works in (freshId). */
// A full list can hold ids that show no bot, and the cap counts the bots that show
// (task-c95974b430641fe6). An id whose record read answered "unset" is proven gone (a record is
// whole before its id is listed): it leaves the list, and if that makes room the bot is made. A
// read that failed or timed out proves nothing and removes nothing. A bot whose record is there
// but does not show (its computer no longer enrolled, a conversation that is not yours) is kept,
// and the refusal says how many show: a load reads only the first READ_CAP ids, so one more would
// not show either.
async function roomFor(ids: string[]): Promise<string[]> {
  let now = ids
  let recs = await readListed(now)
  const gone = recs.filter((r) => r.is === 'gone').map((r) => r.id)
  if (gone.length) {
    for (const id of gone) await removeId(id).catch(() => { throw new Error('your bot list could not be tidied in Barkpark. Try again.') })
    now = (await listIds().catch(() => { throw new Error('your bots could not be read from Barkpark. Try again.') })) ?? []
    if (now.length < READ_CAP) return now
    recs = await readListed(now) // the list changed meanwhile: what it holds now
  }
  // Why each of the ids a load reads shows or not, from the one read above.
  const [hosts, sessions] = await Promise.all([ownHosts(), ownSessions()])
  const why = await Promise.all(
    recs.slice(0, READ_CAP).map(async (r) => {
      if (r.is !== 'there') return r.is
      const bot = trusted(r.id, r.raw, hosts)
      if (!bot) {
        const h = (r.raw as {host_id?: unknown} | null)?.host_id
        return typeof h === 'string' && trusted(r.id, r.raw, [{id: h, name: '', online: false}]) ? 'computer' : 'malformed'
      }
      return (await sessionOf(bot, sessions)).is === 'foreign' ? 'foreign' : 'shown'
    }),
  )
  const n = (k: string) => why.filter((w) => w === k).length
  const shown = n('shown')
  if (n('unread')) throw new Error(`your list holds ${now.length} bots and ${shown} show; ${n('unread')} could not be read from Barkpark just now. Try again.`)
  if (shown >= why.length) throw new Error(`you have ${READ_CAP} bots, the most BarkBot shows.`)
  const parts = ([['computer', 'on a computer that is no longer enrolled'], ['foreign', 'in a conversation that is not yours'], ['malformed', 'not well formed'], ['gone', 'gone from Barkpark']] as const)
    .filter(([k]) => n(k))
    .map(([k, t]) => `${n(k)} ${t}`)
  throw new Error(`your list holds ${now.length} bots, the most BarkBot reads, and only ${shown} show: ${parts.join(', ')}. No bot was made.`)
}

export const createBot = createServerFn({method: 'POST'})
  .validator((d: {name: unknown; shape?: unknown; colour?: unknown}) => {
    if (!validName(d.name)) throw new Error('a bot name is 1 to 200 characters')
    if (d.shape !== undefined && !validShape(d.shape)) throw new Error('that shape is not one of the shapes')
    if (d.colour !== undefined && !validColour(d.colour)) throw new Error('that colour is not one of the colours')
    return {name: d.name.trim(), shape: d.shape as string | undefined, colour: d.colour as string | undefined}
  })
  .handler(async ({data}) => {
    const host = await findHost()
    if (!host) throw new Error('a bot works on a computer, and none is enrolled. Enroll one: npm run host:enroll, then npm run host.')
    let ids = await listIds().catch(() => {
      throw new Error('your bots could not be read from Barkpark. Try again.')
    })
    if (ids && ids.length >= READ_CAP) ids = await roomFor(ids)
    // A new id whose folder no listed bot works in; a few tries, then a plain refusal, nothing written.
    const id = freshId(ids ?? [], host.id, await minter())
    if (!id) throw new Error('every id tried gave a folder one of your bots already works in. Try again.')
    const bot: Bot = {id, ...data, host_id: host.id, session_id: null, created_at: new Date().toISOString()}
    await putBot(bot)
    try {
      await addId(bot.id)
    } catch (e) {
      // A failed add may still land. Read the list again: the id there means the bot is made. The
      // record is dropped only when Barkpark itself answered the add (its transaction is over) and
      // the list, read after, holds no id. A lost answer (no answer at all), or a gateway that gave
      // up (502, 503, 504) while Barkpark may still be applying it, proves nothing: the record is
      // kept and Create says so. A record dropped while its id may yet be listed would leave an id
      // with no record: never shown, never removed, a cap slot (task-4338079c878d4cc7).
      const answered = e instanceof BarkparkError && ![502, 503, 504].includes(e.status)
      const now = await listIds().catch(() => undefined)
      if (now?.includes(bot.id)) return {id: bot.id}
      if (now === undefined || !answered) throw new Error(CREATE_UNSURE)
      await dropBot(bot.id).catch(() => console.warn('barkbot: a bot record whose list add failed could not be removed'))
      throw e
    }
    return {id: bot.id}
  })

/** Is the open bot's computer reachable right now? The page asks every few seconds: Barkpark accepts
 *  a message for a computer that is off (202) and answers it only when the computer is back, so
 *  without this a send looked like it went nowhere (seen live 2026-11-11). It is asked about the open
 *  bot's own computer (its record's host, loadChat's `host`), and answers only for one of the
 *  caller's own enrolled, unrevoked computers: any other id is not reachable. */
export const computerOnline = createServerFn({method: 'GET'})
  .validator((d: {hostId: unknown}) => ({hostId: typeof d?.hostId === 'string' ? d.hostId : ''}))
  .handler(async ({data}): Promise<boolean> => (await ownHosts()).find((h) => h.id === data.hostId)?.online ?? false)

/** A new conversation on the bot's computer, kept in the bot's record so a reload opens it again.
 *  Claude starts in plan mode (the host's default). Only a record that is the caller's own, on that
 *  computer, whose session is none or gone, is written; a session Barkpark could not be asked about
 *  is kept. Once the conversation exists this never throws: `kept` is true only when the record was
 *  written. It is false when there is no such record (none, not the caller's, another computer),
 *  when the record already names a conversation (another tab saved one), or when a read or the
 *  write failed: the page says so in one line. */
export const startChat = createServerFn({method: 'POST'})
  .validator((d: {hostId: string; botId: string}) => d)
  .handler(async ({data}) => {
    // A bot made with Create works in its own folder on the computer; the Main Bot in the shared root.
    const folder = botFolder(data.botId, data.hostId)
    if (folder !== null && typeof folder === 'object') throw new Error(folder.refused)
    // Bounded as a read is: a conversation that does not open in time is said, not waited on forever.
    let s: RawSession
    try {
      s = await bp<RawSession>('/v1/chat/sessions', {method: 'POST', json: {provider: 'claude', execution_target: 'registered_host', execution_host_id: data.hostId, ...(folder ? {bot_folder: folder} : {})}, signal: AbortSignal.timeout(READ_MS)})
    } catch (e) {
      if ((e as Error)?.name === 'TimeoutError') throw new Error(`This message was not sent: Barkpark did not open its conversation within ${READ_MS / 1000} s. Send it again.`)
      throw e
    }
    let kept = false
    try {
      kept = await oneAtATime(data.botId, async (write) => {
        const raw = await readBot(data.botId)
        const bot = raw && trusted(data.botId, raw, await ownHosts())
        const now = bot && bot.host_id === data.hostId ? await sessionOf(bot) : null
        if (bot && now?.is === 'none') {
          // Its own field only: a rename at the same moment stays.
          return (await write((signal) => setBotField(data.botId, 'session_id', s.id, signal))) !== null
        }
        return false
      })
    } catch (e) {
      console.warn(`barkbot: could not save the new conversation in its bot (${(e as Error).message})`)
      kept = false
    }
    return {sessionId: s.id, startedAt: s.inserted_at, kept}
  })

/** What a message names: a picture by its id, a text file or PDF by its id and its name. */
export type AttachmentRef = string | {id: string; name: string}

/** Sends one message. A computer that cannot take what it names (Barkpark's 422
 *  host_cannot_receive_attachments), or cannot run the conversation as asked (422 chat_unsupported:
 *  for a bot's own folder, a chat host too old to run a bot in its folder), is answered as
 *  `refused`, not thrown: the page says so in a plain line and keeps the draft. It is never sent
 *  again without the folder: that would run the bot in the computer's shared root.
 *  Barkpark sends the turn on before it stores the user's message (chat_controller.ex
 *  create_message), so only an answer from before that is a sure no: a 4xx, or a 503 that the
 *  runtime could not take it (runtime_capacity, runtime_unavailable). That is `failed`, with
 *  Barkpark's words. Anything else may come after the turn went: a 500 or another 503 (storing it
 *  failed), a gateway's 502 or 504, no answer at all. That is `unsure`. Neither is thrown, so the
 *  page can tell "Barkpark said no" from "it may have gone".
 *  `key` is the message's Idempotency-Key (Barkpark PR #26689, docs/api-v1.md): the same key with
 *  the same request (query and body) answers the first answer again and runs nothing; with another
 *  request, 422 idempotency_key_reused; while the first is still being answered, 409
 *  idempotency_key_in_use. A 5xx is not remembered. So `unsure` says whether sending the same
 *  message again is safe (`again: 'safe'`: no answer, or not Barkpark's own) or may run it twice
 *  (`again: 'look'`: Barkpark's own 5xx, released, or no key). A 409 is asked again, the same key,
 *  every IN_USE_MS up to IN_USE_TRIES; then it is `unsure`, safe. A 422 reused means this key was
 *  first used for other words and ran nothing for these: they go once more under a new key. The
 *  answer names the key it is under, so the page keeps that one with the words. */
/** A refusal Barkpark gives before the turn goes: the message was surely not sent. */
const refusedBeforeSending = (e: BarkparkError) =>
  (e.status >= 400 && e.status < 500) || (e.status === 503 && (e.code === 'runtime_capacity' || e.code === 'runtime_unavailable'))

/** Whether Barkpark shows this conversation as made with a bot folder. A failed read: no. */
async function askedForFolder(id: string): Promise<boolean> {
  try {
    const s = await bp<{bot_folder?: unknown}>(`/v1/chat/sessions/${encodeURIComponent(id)}?since=${NO_MESSAGES}`)
    return typeof s.bot_folder === 'string' && s.bot_folder !== ''
  } catch {
    return false
  }
}

/** Barkpark's own 5xx (its error envelope): its key is not remembered, so the same key runs again. */
const ownFiveHundred = (e: unknown) => e instanceof BarkparkError && e.status >= 500 && !e.code.startsWith('http_')
const IN_USE_MS = 1000
const IN_USE_TRIES = 8

export const sendMessage = createServerFn({method: 'POST'})
  .validator((d: {id: string; content: string; attachments?: AttachmentRef[]; key?: string}) => d)
  .handler(async ({data}): Promise<{accepted: true; key?: string; replay?: boolean} | {refused: string} | {failed: string} | {unsure: string; again: 'safe' | 'look'; key?: string}> => {
    // What it names was stored for this conversation first (uploadAttachment below).
    const json = data.attachments?.length ? {content: data.content, attachments: data.attachments} : {content: data.content}
    let key = data.key
    let replay = false
    try {
      for (let tries = 1; ; tries++) {
        try {
          await bp(`/v1/chat/sessions/${encodeURIComponent(data.id)}/messages`, {method: 'POST', json, ...(key ? {headers: {'idempotency-key': key}} : {}), answered: (res) => void (replay = res.headers.get('idempotency-replay') === 'true')})
          break
        } catch (e) {
          if (!key || !(e instanceof BarkparkError)) throw e
          if (e.status === 409 && e.code === 'idempotency_key_in_use') {
            if (tries >= IN_USE_TRIES) return {unsure: e.message, again: 'safe', key}
            await new Promise((r) => setTimeout(r, IN_USE_MS))
            continue
          }
          if (e.status === 422 && e.code === 'idempotency_key_reused' && key === data.key) {
            key = randomUUID()
            continue
          }
          throw e
        }
      }
    } catch (e) {
      if (!(e instanceof BarkparkError) || !refusedBeforeSending(e)) return {unsure: (e as Error).message, again: key && !ownFiveHundred(e) ? 'safe' : 'look', key}
      if (e.status === 422 && e.code === 'host_cannot_receive_attachments') return {refused: 'host_cannot_receive_attachments'}
      // chat_unsupported is Barkpark's shared code (a revoked host, a provider not ready, …): it is
      // the folder only when this conversation asked for one; otherwise it goes on as any failure.
      if (e.status === 422 && e.code === 'chat_unsupported' && (await askedForFolder(data.id))) return {refused: 'chat_unsupported'}
      return {failed: e.message}
    }
    // A replay: it went before, once; this is that first answer again.
    return {accepted: true, key, ...(replay ? {replay} : {})}
  })

/** Stores one picture, text file or PDF for a conversation and answers its id and type. Barkpark
 *  reads the type from the bytes themselves, never from the file's name: png, jpeg, gif, webp,
 *  PDF or UTF-8 text, up to 3 MB. Anything else is answered as `refused` (its 400), not thrown. */
export const uploadAttachment = createServerFn({method: 'POST'})
  .validator((d: {id: string; data: string}) => d)
  .handler(async ({data}): Promise<{id: string; media_type: string; byte_size: number} | {refused: string}> => {
    try {
      const r = await bp<{attachment: {id: string; media_type: string; byte_size: number}}>(`/v1/chat/sessions/${encodeURIComponent(data.id)}/attachments`, {method: 'POST', json: {data: data.data}})
      return {id: r.attachment.id, media_type: r.attachment.media_type, byte_size: r.attachment.byte_size}
    } catch (e) {
      if (e instanceof BarkparkError && e.status === 400) return {refused: e.message}
      throw e
    }
  })

/** The person's answer to what the bot asked leave for. Barkpark passes it to the bot's computer;
 *  an allow lets exactly the asked step go on, a deny tells the bot no. */
export const answerApproval = createServerFn({method: 'POST'})
  .validator((d: {id: string; requestId: string; decision: 'allow' | 'deny'}) => {
    if (d.decision !== 'allow' && d.decision !== 'deny') throw new Error('An answer is allow or deny')
    return d
  })
  .handler(async ({data}) => {
    await bp(`/v1/chat/sessions/${encodeURIComponent(data.id)}/approval`, {method: 'POST', json: {request_id: data.requestId, decision: data.decision}})
    return {answered: true}
  })

/** The person's choice for a question the bot asked. Barkpark checks every choice against what
 *  the bot offered and rebuilds the answer itself, so only an offered choice can get through. */
export const answerQuestion = createServerFn({method: 'POST'})
  .validator((d: {id: string; requestId: string; answers: Record<string, string | string[]>}) => d)
  .handler(async ({data}) => {
    await bp(`/v1/chat/sessions/${encodeURIComponent(data.id)}/answer`, {method: 'POST', json: {request_id: data.requestId, answers: data.answers}})
    return {answered: true}
  })

/** Saves the bot's new name. Details never sends an empty one (it puts the old name back); this
 *  refuses one anyway, so no path can save a blank bot. */
const NOT_KEPT = 'This bot is not saved yet, so its name is not kept'
export const renameBot = createServerFn({method: 'POST'})
  .validator((d: {id: string; name: unknown}) => {
    if (!validName(d.name)) throw new Error('A bot name is 1 to 200 characters')
    return {id: d.id, name: d.name}
  })
  .handler(async ({data}) => {
    // The bot's own key, and only a record that is the caller's own: nothing else is written. The
    // name is set on its own (setBotField, row-locked), so a conversation saved at the same moment
    // stays, and a rename never waits on another change. The check reads first: in the gap before
    // the set, the record can change (only the set's field is written, so nothing else is lost) or
    // be removed (the set then makes a record of the name alone, which setBotField removes again;
    // nothing in BarkBot removes a record a page has open: dropBot is Create's clean-up of its own
    // new id). The write is bounded as a queued one is (WRITE_MS).
    const raw = await readBot(data.id)
    const bot = raw && trusted(data.id, raw, await ownHosts())
    if (!bot || (await sessionOf(bot)).is === 'foreign') throw new Error(NOT_KEPT)
    if (!(await write((signal) => setBotField(data.id, 'name', data.name, signal)))) throw new Error(NOT_KEPT)
    return {name: data.name}
  })
