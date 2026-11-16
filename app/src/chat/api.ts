// The conversation's server functions. Their bodies run on the server only (TanStack Start
// strips them from the browser bundle), so they may use server/barkpark.
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {createServerFn} from '@tanstack/react-start'
import {bp, conf, BarkparkError} from '../server/barkpark'
import {addId, botFolder, dropBot, freshId, legacyName, listIds, mainBotId, NO_MESSAGES, putBot, READ_CAP, readBot, readBots, sessionOf, trusted, validColour, validName, validShape, type Bot, type OwnSession, type SessionCheck} from '../server/bots'

export type Host = {id: string; name: string; online: boolean}
/** A bot as the page gets it: its id and its name only (the record's pointers stay on the server). */
export type ChatBot = {id: string; name: string}
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

/** Today's conversation for the Main Bot: the newest of `onHost` that no listed bot names (`taken`)
 *  and that Barkpark shows with no bot folder. A conversation with a folder is a made bot's, whose
 *  record may never have saved it, and the Main Bot works in the computer's shared root, never in a
 *  bot's folder. Barkpark's list carries no bot_folder, so each one is read on its own, newest
 *  first. One that is gone (404) is passed over; a read that fails is not "no folder", so none is
 *  picked. */
async function folderless<S extends {id: string}>(onHost: S[], taken: Set<string | null>): Promise<S | undefined> {
  for (const s of onHost) {
    if (taken.has(s.id)) continue
    try {
      const shown = await bp<{bot_folder?: unknown}>(`/v1/chat/sessions/${encodeURIComponent(s.id)}?since=${NO_MESSAGES}`)
      if (shown.bot_folder === null || shown.bot_folder === undefined) return s
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
  return {bots: rail.map(({bot}) => ({id: bot.id, name: bot.name})), botId: open.bot.id, bot: open.bot.name, host: home, sessionId: session?.id ?? null, startedAt: session?.inserted_at ?? null, notice, sessions: byBot}
})

// Each Create try's id: random. BARKBOT_TEST_MINT_FILE, set only by scripts/behaviour.mjs against
// its stand-in Barkpark, names a file whose lines are the ids the tries take first, one per try.
function minter(): (i: number) => string {
  const file = process.env.BARKBOT_TEST_MINT_FILE
  let given: string[] = []
  if (file) {
    try {
      given = readFileSync(file, 'utf8').split('\n').map((x) => x.trim()).filter(Boolean)
    } catch {}
  }
  return (i) => given[i] ?? randomUUID()
}

/** Create in the New Bot dialog: a new bot on the enrolled computer, with an empty conversation
 *  that Barkpark makes on its first message (startChat saves it), so a failed Create leaves no
 *  session behind. Its record is written whole first, its id added to the list last, so a bot
 *  shows only once it is whole; if the add fails the record is removed again. It is refused, with
 *  nothing written, when no computer is enrolled (a bot works on a computer) or when the list
 *  already holds as many bots as one load shows (READ_CAP).
 *  Its first conversation asks for its own folder on the computer (botFolder), one no listed bot
 *  works in (freshId). */
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
    const ids = await listIds().catch(() => {
      throw new Error('your bots could not be read from Barkpark. Try again.')
    })
    if ((ids?.length ?? 0) >= READ_CAP) throw new Error(`you have ${READ_CAP} bots, the most BarkBot shows.`)
    // A new id whose folder no listed bot works in; a few tries, then a plain refusal, nothing written.
    const id = freshId(ids ?? [], host.id, minter())
    if (!id) throw new Error('every id tried for this bot gave a folder one of your bots already works in, so it was not made. Try again.')
    const bot: Bot = {id, ...data, host_id: host.id, session_id: null, created_at: new Date().toISOString()}
    await putBot(bot)
    try {
      await addId(bot.id)
    } catch (e) {
      await dropBot(bot.id).catch(() => console.warn('barkbot: a bot record whose list add failed could not be removed'))
      throw e
    }
    return {id: bot.id}
  })

/** Is the bot's computer reachable right now? The page asks every few seconds: Barkpark accepts a
 *  message for a computer that is off (202) and answers it only when the computer is back, so
 *  without this a send looked like it went nowhere (seen live 2026-11-11). */
export const computerOnline = createServerFn({method: 'GET'}).handler(async (): Promise<boolean> => (await findHost())?.online ?? false)

/** A new conversation on the bot's computer, kept in the bot's record so a reload opens it again.
 *  Claude starts in plan mode (the host's default). Only a record that is the caller's own, on that
 *  computer, whose session is none or gone, is written; a session Barkpark could not be asked about
 *  is kept. Once the conversation exists this never throws: `kept: false` says it was not saved. */
export const startChat = createServerFn({method: 'POST'})
  .validator((d: {hostId: string; botId: string}) => d)
  .handler(async ({data}) => {
    // A bot made with Create works in its own folder on the computer; the Main Bot in the shared root.
    const folder = botFolder(data.botId, data.hostId)
    if (folder !== null && typeof folder === 'object') throw new Error(folder.refused)
    const s = await bp<RawSession>('/v1/chat/sessions', {method: 'POST', json: {provider: 'claude', execution_target: 'registered_host', execution_host_id: data.hostId, ...(folder ? {bot_folder: folder} : {})}})
    let kept = true
    try {
      const raw = await readBot(data.botId)
      const bot = raw && trusted(data.botId, raw, await ownHosts())
      const now = bot && bot.host_id === data.hostId ? await sessionOf(bot) : null
      if (bot && now?.is === 'none') await putBot({...bot, session_id: s.id})
      else if (now?.is === 'unsure') kept = false
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
 *  again without the folder: that would run the bot in the computer's shared root. */
/** Whether Barkpark shows this conversation as made with a bot folder. A failed read: no. */
async function askedForFolder(id: string): Promise<boolean> {
  try {
    const s = await bp<{bot_folder?: unknown}>(`/v1/chat/sessions/${encodeURIComponent(id)}?since=${NO_MESSAGES}`)
    return typeof s.bot_folder === 'string' && s.bot_folder !== ''
  } catch {
    return false
  }
}

export const sendMessage = createServerFn({method: 'POST'})
  .validator((d: {id: string; content: string; attachments?: AttachmentRef[]}) => d)
  .handler(async ({data}): Promise<{accepted: true} | {refused: string}> => {
    // What it names was stored for this conversation first (uploadAttachment below).
    const json = data.attachments?.length ? {content: data.content, attachments: data.attachments} : {content: data.content}
    try {
      await bp(`/v1/chat/sessions/${encodeURIComponent(data.id)}/messages`, {method: 'POST', json})
    } catch (e) {
      if (e instanceof BarkparkError && e.status === 422 && e.code === 'host_cannot_receive_attachments') return {refused: 'host_cannot_receive_attachments'}
      // chat_unsupported is Barkpark's shared code (a revoked host, a provider not ready, …): it is
      // the folder only when this conversation asked for one; otherwise it goes on as any failure.
      if (e instanceof BarkparkError && e.status === 422 && e.code === 'chat_unsupported' && (await askedForFolder(data.id))) return {refused: 'chat_unsupported'}
      throw e
    }
    return {accepted: true}
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
export const renameBot = createServerFn({method: 'POST'})
  .validator((d: {id: string; name: unknown}) => {
    if (!validName(d.name)) throw new Error('A bot name is 1 to 200 characters')
    return {id: d.id, name: d.name}
  })
  .handler(async ({data}) => {
    // The bot's own key, and only a record that is the caller's own: nothing else is written.
    const raw = await readBot(data.id)
    const bot = raw && trusted(data.id, raw, await ownHosts())
    if (!bot || (await sessionOf(bot)).is === 'foreign') throw new Error('This bot is not saved yet, so its name is not kept')
    await putBot({...bot, name: data.name})
    return {name: data.name}
  })
