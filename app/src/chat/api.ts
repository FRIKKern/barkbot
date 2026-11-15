// The conversation's server functions. Their bodies run on the server only (TanStack Start
// strips them from the browser bundle), so they may use server/barkpark.
import {randomUUID} from 'node:crypto'
import {createServerFn} from '@tanstack/react-start'
import {bp, conf, BarkparkError} from '../server/barkpark'
import {addId, legacyName, listIds, mainBotId, putBot, readBot, readBots, sessionOf, trusted, validName, type Bot, type OwnSession, type SessionCheck} from '../server/bots'

export type Host = {id: string; name: string; online: boolean}
/** A bot as the page gets it: its id and its name only (the record's pointers stay on the server). */
export type ChatBot = {id: string; name: string}
/** The bots in rail order, the open one (`botId`, `bot` its name), its computer and its conversation,
 *  and a plain line when a preference could not be read or saved (`notice`). */
export type Chat = {bots: ChatBot[]; botId: string; bot: string; host: Host | null; sessionId: string | null; startedAt: string | null; notice: string | null}

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
 *  The first load after the store exists makes the Main Bot from today's state, additively: its id
 *  is a UUID v5 of the computer's id (two tabs write the same keys), its name the legacy pref (or
 *  BARKBOT_NAME when it is unset), its session the newest one on that computer (today's rule, used
 *  this once). Only the new keys are written; the legacy barkbot.bot is never written or deleted.
 *  A preference read or write that fails never fails the page: it shows what it could read, writes
 *  nothing more, and says so (`notice`). A Main Bot record already there is kept, never written
 *  over: a load whose list add failed is repaired by the next. */
// ?bot=<id>: the open bot, else the first in the rail.
export const loadChat = createServerFn({method: 'GET'})
  .validator((botId: string | null | undefined) => (typeof botId === 'string' ? botId : null))
  .handler(async ({data: want}): Promise<Chat> => {
  const [hosts, ids, legacy] = await Promise.all([ownHosts(), got(listIds(), 'read the bots'), got(legacyName(), 'read the saved bot name')])
  const host = hosts.find((h) => h.name === HOST_NAME()) ?? null
  // Today's name: the legacy pref, else BARKBOT_NAME. If the read failed it is not known, so it is shown, never saved.
  const todays = legacy.ok ? (legacy.v ?? BOT_NAME()) : BOT_NAME()
  if (!host) {
    // No computer: today's bot cannot be kept (a record names its computer), so it shows by its
    // name with nothing written; bots made with no computer (Create) follow it.
    const made = ids.ok && ids.v?.length ? await readBots(ids.v, hosts, []) : {bots: [], unread: 0}
    const bots = [{id: 'no-computer', name: todays}, ...made.bots.filter(({bot}) => bot.host_id === null).map(({bot}) => ({id: bot.id, name: bot.name}))]
    const open = bots.find((b) => b.id === want) ?? bots[0]
    return {bots, botId: open.id, bot: open.name, host: null, sessionId: null, startedAt: null, notice: !ids.ok || made.unread ? NOT_READ : null}
  }
  const sessions = await ownSessions()
  const newest = sessions.filter((s) => s.execution_host_id === host.id).sort((a, b) => b.inserted_at.localeCompare(a.inserted_at))[0]
  const main: Bot = {id: mainBotId(host.id), name: todays, host_id: host.id, session_id: newest?.id ?? null, created_at: newest?.inserted_at ?? new Date().toISOString()}
  // The Main Bot from what the caller itself can see, written nowhere.
  const inMemory = {bot: main, session: newest ? ({is: 'open', session: newest} as const) : ({is: 'none'} as const)}
  let rail: {bot: Bot; session: SessionCheck}[] = [inMemory]
  let notice: string | null = null
  if (!ids.ok) {
    notice = NOT_READ
  } else if (ids.v?.length) {
    const r = await readBots(ids.v, hosts, sessions)
    if (r.unread) notice = NOT_READ
    // Every stored record dropped: the in-memory Main Bot, nothing written.
    if (r.bots.length) rail = r.bots
  } else if (!legacy.ok) {
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
        rail = [{bot: kept, session}]
        if (!(await got(addId(kept.id), 'add the Main Bot to the list')).ok) notice = NOT_SAVED
      }
    } else if (!there.v) {
      // Nothing half-made: the id joins the list only after its record is whole.
      if (!(await got(putBot(main), 'save the Main Bot')).ok || !(await got(addId(main.id), 'add the Main Bot to the list')).ok) notice = NOT_SAVED
    }
    // A Main Bot key that is there but not well formed is never written over: in memory only.
  }
  const open = rail.find((x) => x.bot.id === want) ?? rail[0]
  const session = open.session.is === 'open' ? open.session.session : null
  const home = open.bot.host_id === null ? null : (hosts.find((h) => h.id === open.bot.host_id) ?? host)
  return {bots: rail.map(({bot}) => ({id: bot.id, name: bot.name})), botId: open.bot.id, bot: open.bot.name, host: home, sessionId: session?.id ?? null, startedAt: session?.inserted_at ?? null, notice}
})

/** Create in the New Bot dialog: a new bot with its own empty conversation on the enrolled
 *  computer. Its record is written whole first, and its id is added to the list last, so a bot
 *  shows only once it is whole. With no computer enrolled the bot is made with none (no session).
 *  A failed write throws, and the dialog says so; a record whose list add failed is never shown.
 *  Until a bot can have its own folder (task-88d21dd5955bfa64) it works in the Main Bot's folder. */
export const createBot = createServerFn({method: 'POST'})
  .validator((d: {name: unknown; shape?: unknown; colour?: unknown}) => {
    if (!validName(d.name)) throw new Error('A bot name is 1 to 200 characters')
    const opt = (v: unknown) => (typeof v === 'string' && v.length <= 40 ? v : undefined)
    return {name: d.name.trim(), shape: opt(d.shape), colour: opt(d.colour)}
  })
  .handler(async ({data}) => {
    const host = await findHost()
    const s = host ? await bp<RawSession>('/v1/chat/sessions', {method: 'POST', json: {provider: 'claude', execution_target: 'registered_host', execution_host_id: host.id}}) : null
    const bot: Bot = {id: randomUUID(), ...data, host_id: host?.id ?? null, session_id: s?.id ?? null, created_at: s?.inserted_at ?? new Date().toISOString()}
    await putBot(bot)
    await addId(bot.id)
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
    const s = await bp<RawSession>('/v1/chat/sessions', {method: 'POST', json: {provider: 'claude', execution_target: 'registered_host', execution_host_id: data.hostId}})
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
 *  host_cannot_receive_attachments) is answered as `refused`, not thrown: the page says so in a
 *  plain line and keeps the draft. */
export const sendMessage = createServerFn({method: 'POST'})
  .validator((d: {id: string; content: string; attachments?: AttachmentRef[]}) => d)
  .handler(async ({data}): Promise<{accepted: true} | {refused: string}> => {
    // What it names was stored for this conversation first (uploadAttachment below).
    const json = data.attachments?.length ? {content: data.content, attachments: data.attachments} : {content: data.content}
    try {
      await bp(`/v1/chat/sessions/${encodeURIComponent(data.id)}/messages`, {method: 'POST', json})
    } catch (e) {
      if (e instanceof BarkparkError && e.status === 422 && e.code === 'host_cannot_receive_attachments') return {refused: 'host_cannot_receive_attachments'}
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
