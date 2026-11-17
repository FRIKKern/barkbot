// The bots, kept in the owner's own per-account prefs (docs/contracts/user-prefs.md in Barkpark;
// plan: /papers/barkbot-many-bots-plan, "The record"):
//
//   barkbot.bots        {ids: [id, ...]}   the order in the rail; changed only by PATCH add/remove (row-locked)
//   barkbot.bot.<id>    {name, shape, colour, host_id, session_id, created_at}   PUT whole by Create and the move-in;
//                       one field (name, session_id) by PATCH set (row-locked: setBotField)
//   barkbot.bot         {name}             today's one bot, before the store: read, never written or deleted
//
// A pref is written by a client, so a record is a claim, not a fact. A record is shown only if its
// key, id and fields are well formed and its host is one of the caller's own enrolled computers.
// Its session is checked on its own (sessionOf): opened only if Barkpark shows it as a
// registered-host session ON THAT HOST. A session Barkpark shows elsewhere (another host, managed)
// drops the record: not shown, and nothing is ever sent to it (the owner's bp token can be a global
// admin, which opens any session id). A session that is gone (404, archived) keeps the bot and
// opens no conversation; the next message starts a fresh one and saves its id.
// No token, credential or enrollment value is ever written in a pref.
import {createHash} from 'node:crypto'
import {bp, conf, BarkparkError} from './barkpark'
import {colours, shapeRows} from '../components/overlays/data'

export type Bot = {id: string; name: string; shape?: string; colour?: string; host_id: string; session_id: string | null; created_at: string}
export type OwnHost = {id: string; name: string; online: boolean}
export type OwnSession = {id: string; execution_target: string; execution_host_id?: string | null; inserted_at: string}

export const LIST_KEY = 'barkbot.bots'
export const LEGACY_KEY = 'barkbot.bot'
export const botKey = (id: string) => `barkbot.bot.${id}`

const prefs = (key: string) => {
  const c = conf()
  return `/w/${c.workspace}/p/${c.project}/v1/prefs/${encodeURIComponent(c.dataset)}/${key}`
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
// BarkBot's own namespace for name-based ids (made up for BarkBot, 2026-11-15; never change it:
// the Main Bot's id is derived from it).
const NAMESPACE = '6f1d2c3e-8a4b-4c5d-9e6f-7a8b9c0d1e2f'

/** RFC 4122 UUID v5 (SHA-1, name-based) of `name` in BarkBot's namespace. */
export function uuidV5(name: string): string {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex')
  const h = createHash('sha1').update(ns).update(name, 'utf8').digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

/** The Main Bot's id: the same for every tab and device, so two first loads write the same keys. The host
 *  id is read in lower case (Barkpark's own ids are), so one that differs only in case names the same
 *  Main Bot, and a record made from Barkpark's lower-case id still matches. */
export const mainBotId = (hostId: string) => uuidV5(`main-bot:${hostId.toLowerCase()}`)

/** The folder a bot works in on its computer (task-88d21dd5955bfa64): `bot-` and the first 8 hex of
 *  its id, never its name, so it is always one segment Barkpark takes (^[a-z0-9][a-z0-9-]{0,39}$).
 *  The Main Bot has none (null): it works in the computer's shared root, as today's bot always has.
 *  Upper-case hex is read as lower. Any other bot whose id is not a UUID has no folder it can work
 *  in: `refused`, and no conversation is made for it (never the shared root in its place). */
export function botFolder(id: string, hostId: string): string | null | {refused: string} {
  const low = id.toLowerCase()
  if (low === mainBotId(hostId)) return null
  if (!UUID.test(low)) return {refused: 'This bot has no folder it can work in on the computer, so no conversation was made and nothing was sent.'}
  return `bot-${low.slice(0, 8)}`
}

// A random UUID as randomUUID() makes it: version 4, variant 8, 9, a or b, lower case.
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** How many ids Create tries for a folder no listed bot works in. */
export const MINT_TRIES = 8

/** A new bot's id: the first of `next(0)`, `next(1)`, … (MINT_TRIES of them) whose folder is no
 *  listed bot's folder, or null when every one clashes. A folder is only the first 8 hex of an id,
 *  so two ids can share one (task-c7929f26e51c447a), and two bots in one folder would work in each
 *  other's files. Every listed id counts, on any computer: a stricter check, never a looser one.
 *  Only a lower-case v4 UUID is taken, whatever gave it; anything else is passed over. */
export function freshId(listed: string[], hostId: string, next: (i: number) => string): string | null {
  const used = new Set(listed.map((id) => botFolder(id, hostId)).filter((f) => typeof f === 'string'))
  for (let i = 0; i < MINT_TRIES; i++) {
    const id = next(i)
    const f = botFolder(id, hostId)
    if (V4.test(id) && typeof f === 'string' && !used.has(f)) return id
  }
  return null
}

export const validName = (n: unknown): n is string => typeof n === 'string' && n.trim().length > 0 && n.length <= 200

// A bot's looks are one of the New Bot dialog's own shapes and colours, nothing else.
const SHAPES = new Set(shapeRows.flat())
const COLOURS = new Set(colours.map(([c]) => c))
export const validShape = (v: unknown): v is string => typeof v === 'string' && SHAPES.has(v)
export const validColour = (v: unknown): v is string => typeof v === 'string' && COLOURS.has(v)

async function read<T>(key: string): Promise<T | null> {
  const {value} = await bp<{value: T | null}>(prefs(key))
  return value
}

/** How many records one page load reads. The rest stay in the list, untouched, and are not shown. */
export const READ_CAP = 50

/** The ids in rail order, each once, or null when the store was never made. Throws if the read fails. */
export async function listIds(): Promise<string[] | null> {
  const v = await read<{ids?: unknown}>(LIST_KEY)
  if (!v || !Array.isArray(v.ids)) return null
  return [...v.ids.filter((x): x is string => typeof x === 'string' && UUID.test(x))]
}

/** Today's one bot's name (the legacy pref), or null when it is unset. Read only. Throws if the
 *  read fails: a failed read is not "unset", and the move-in must not save a default over it. */
export async function legacyName(): Promise<string | null> {
  const v = await read<{name?: unknown}>(LEGACY_KEY)
  return validName(v?.name) ? v!.name : null
}

/** A record, checked against the caller's own computers. Null: dropped. Its session is checked
 *  apart (sessionOf), since Barkpark's list does not hold every session. */
export function trusted(id: string, raw: unknown, hosts: OwnHost[]): Bot | null {
  if (!UUID.test(id) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (!validName(r.name) || typeof r.host_id !== 'string' || typeof r.created_at !== 'string') return null
  if (!hosts.some((h) => h.id === r.host_id)) return null
  const sid = r.session_id ?? null
  if (sid !== null && (typeof sid !== 'string' || !UUID.test(sid))) return null
  return {id, name: r.name, shape: validShape(r.shape) ? r.shape : undefined, colour: validColour(r.colour) ? r.colour : undefined, host_id: r.host_id, session_id: sid, created_at: r.created_at}
}

/** What a record's session is to its bot:
 *  open    the caller's own registered-host session on the bot's host: opened
 *  none    the record names no session, or Barkpark has none by that id (404) or it is archived:
 *          the bot stays, no conversation opens, the next message starts one and saves its id
 *  unsure  Barkpark could not be asked (any other failure): the bot stays, nothing opens, and the
 *          record keeps its pointer (a new conversation is not saved over it)
 *  foreign Barkpark shows the session somewhere else (another host, managed, another id): the
 *          record is dropped, never shown, opened or sent to */
export type SessionCheck = {is: 'open'; session: OwnSession} | {is: 'none'} | {is: 'unsure'} | {is: 'foreign'}

// The newest message seq Barkpark takes: a show read past it carries no messages, only the session.
export const NO_MESSAGES = '9223372036854775807'

/** Checks `bot`'s session: first in the caller's list (`listed`), else by its own read, since the
 *  list leaves out archived sessions and holds only the 50 most recently active. */
export async function sessionOf(bot: Bot, listed: OwnSession[] = []): Promise<SessionCheck> {
  const sid = bot.session_id
  if (sid === null) return {is: 'none'}
  const judge = (s: OwnSession & {archived_at?: string | null}): SessionCheck =>
    s.id !== sid || s.execution_target !== 'registered_host' || s.execution_host_id !== bot.host_id ? {is: 'foreign'} : s.archived_at ? {is: 'none'} : {is: 'open', session: {id: s.id, execution_target: s.execution_target, execution_host_id: s.execution_host_id, inserted_at: s.inserted_at}}
  const hit = listed.find((s) => s.id === sid)
  if (hit) return judge(hit)
  try {
    return judge(await bp<OwnSession & {archived_at?: string | null}>(`/v1/chat/sessions/${encodeURIComponent(sid)}?since=${NO_MESSAGES}`))
  } catch (e) {
    if (e instanceof BarkparkError && e.status === 404) return {is: 'none'}
    console.warn(`barkbot: could not check a bot's conversation (${(e as Error).message})`)
    return {is: 'unsure'}
  }
}

/** The first READ_CAP records in the list, in order: the trusted ones with their session checks,
 *  and how many could not be read. An unread record is not shown this time and is not touched. */
export async function readBots(ids: string[], hosts: OwnHost[], listed: OwnSession[]): Promise<{bots: {bot: Bot; session: SessionCheck}[]; unread: number}> {
  const some = ids.slice(0, READ_CAP)
  let unread = 0
  const raws = await Promise.all(some.map((id) => read<unknown>(botKey(id)).catch(() => (unread++, null))))
  const kept = some.map((id, i) => trusted(id, raws[i], hosts)).filter((b): b is Bot => b !== null)
  const checks = await Promise.all(kept.map((b) => sessionOf(b, listed)))
  return {bots: kept.map((bot, i) => ({bot, session: checks[i]})).filter((x) => x.session.is !== 'foreign'), unread}
}

// One change at a time per bot record, for a change that must check the record before it writes
// and is wrong if the record changed in between. A one-field write itself needs no queue: it is a
// PATCH set (setBotField), which Barkpark applies under the row lock, so a rename and a new
// conversation saved at the same moment both stay, from this server or any other. Today only a
// new chat's save goes through here (api.ts startChat): it saves its conversation only if the
// record names none yet, and two new chats at once (two tabs) would both see none and the second
// would save over the first. The queue makes the second read after the first is saved, so it sees
// it and keeps the record's. That holds for one BarkBot server only: Barkpark has no compare-and-set.
// The next change starts after the last one ended, whether it worked or not. Another bot's changes
// never wait on it.
// Every step of a change is bounded, so no change holds its bot for ever:
//  - its reads: each by READ_MS (8 s, barkpark.ts), and a read that does not answer fails the change
//    with its own line. A slow read that answers is an answer, so it is not counted below.
//  - its write: by WRITE_MS (10 s), counted from when the write starts (`write`). Then the write is
//    called off (`signal`; one not yet sent is never sent), the change fails with SLOW, and the
//    next change starts. A write has no time bound of its own (barkpark.ts).
//  - WAIT_MS: a change waits at most 15 s for its turn, else it fails with BUSY and never runs, so
//    nothing is written after its caller was told it was not.
//  - HOLD_MS, the backstop (task-2ad4f1be48ff7f4d): a change holds its bot at most 40 s in all,
//    longer than its reads (startChat's: three, 3 × 8 s) and its write (10 s). Past it the change
//    fails with HELD and the next change starts, so a change that awaits something with no bound
//    before its write cannot wedge its bot. The write a change is handed is its own: once the
//    change has ended (it returned, it failed, or the backstop let its bot go) that write writes
//    nothing (ENDED), and one still on its way is called off, so no write runs outside the queue.
export const WRITE_MS = 10_000
export const WAIT_MS = 15_000
export const HOLD_MS = 40_000
const SLOW = 'Barkpark did not answer the save within 10 s. Reload to see what was kept.'
const BUSY = 'Another change to this bot is still being saved, so this one was not made. Try again in a moment.'
const HELD = 'This change to the bot took over 40 s, so it was stopped and nothing more is written for it. Reload to see what was kept.'
const ENDED = 'This change to the bot had already ended, so nothing was written.'
const changing = new Map<string, Promise<void>>()
/** `write` runs a change's write under WRITE_MS: its `signal` calls the write off at the bound. */
export type Write = <W>(save: (signal: AbortSignal) => Promise<W>) => Promise<W>
export const write: Write = (save) => bounded(save)
function bounded<W>(save: (signal: AbortSignal) => Promise<W>, off?: AbortSignal): Promise<W> {
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), WRITE_MS)
  const callOff = () => stop.abort()
  off?.addEventListener('abort', callOff)
  const called = new Promise<never>((_, no) => stop.signal.addEventListener('abort', () => no(new Error(off?.aborted ? ENDED : SLOW))))
  called.catch(() => {}) // called off after the race settled: nobody waits on it then
  return Promise.race([save(stop.signal), called]).finally(() => {
    clearTimeout(timer)
    off?.removeEventListener('abort', callOff)
  })
}
export function oneAtATime<T>(id: string, change: (write: Write) => Promise<T>): Promise<T> {
  const before = changing.get(id) ?? Promise.resolve()
  const turn = new Promise<boolean>((ok) => {
    const late = setTimeout(() => ok(false), WAIT_MS)
    void before.then(() => {
      clearTimeout(late)
      ok(true)
    })
  })
  const run = turn.then((mine) => {
    if (!mine) throw new Error(BUSY)
    // This change's own write: refused once the change has ended; one on its way then is called off.
    const over = new AbortController()
    const own: Write = (save) => (over.signal.aborted ? Promise.reject(new Error(ENDED)) : bounded(save, over.signal))
    let timer: ReturnType<typeof setTimeout> | undefined
    const held = new Promise<never>((_, no) => (timer = setTimeout(() => no(new Error(HELD)), HOLD_MS)))
    return Promise.race([change(own), held]).finally(() => {
      clearTimeout(timer)
      over.abort()
    })
  })
  // The next change waits for this one to end, or, if this one gave up, for the one it waited on.
  const after = turn.then((mine) => (mine ? run.then(() => undefined, () => undefined) : before))
  changing.set(id, after)
  void after.then(() => {
    if (changing.get(id) === after) changing.delete(id)
  })
  return run
}

/** Writes a bot's own key. The record is whole before its id is added to the list. `signal`
 *  calls the write off (oneAtATime's bound): one not yet sent is never sent. */
export async function putBot(bot: Bot, signal?: AbortSignal): Promise<void> {
  const {id, ...value} = bot
  signal?.throwIfAborted()
  await bp(prefs(botKey(id)), {method: 'PUT', json: {value}, signal})
}

/** Sets one top-level field of a bot's record, under Barkpark's row lock (PATCH set), so a change
 *  to another field at the same moment stays. Answers the record as it is now. A set on a key that
 *  is gone creates it with that one field: that half record is removed again at once, and the
 *  answer is null. (A record always holds more than one field, so only a set that made the key
 *  answers just its own.) `signal` calls the write off, as putBot's does. */
export async function setBotField(id: string, field: 'name' | 'session_id', item: string, signal?: AbortSignal): Promise<Record<string, unknown> | null> {
  signal?.throwIfAborted()
  const {value} = await bp<{value: Record<string, unknown> | null}>(prefs(botKey(id)), {method: 'PATCH', json: {op: 'set', field, item}, signal})
  if (!value || (Object.keys(value).length === 1 && field in value)) {
    await bp(prefs(botKey(id)), {method: 'DELETE'})
    return null
  }
  return value
}

/** Removes a bot's own key: Create's clean-up when its list add failed, so nothing half-made stays. */
export async function dropBot(id: string): Promise<void> {
  if (UUID.test(id)) await bp(prefs(botKey(id)), {method: 'DELETE'})
}

/** Adds an id at the end of the list (idempotent: an id already there stays once). */
export async function addId(id: string): Promise<void> {
  await bp(prefs(LIST_KEY), {method: 'PATCH', json: {op: 'add', field: 'ids', item: id}})
}

/** Removes an id from the list (row-locked; an id not there is no change). Only for an id whose
 *  record is proven gone (readListed): a record is whole before its id is listed. */
export async function removeId(id: string): Promise<void> {
  await bp(prefs(LIST_KEY), {method: 'PATCH', json: {op: 'remove', field: 'ids', item: id}})
}

/** A listed record as one read of it answered:
 *  gone    Barkpark answered for this very key and dataset that it is unset (200, value null)
 *  there   its value, as read
 *  unread  the read failed or timed out, or answered something that is not this key's prefs
 *          answer (another key or dataset, no value field): it proves nothing, so it is never gone */
export type Listed = {id: string; is: 'gone'} | {id: string; is: 'there'; raw: unknown} | {id: string; is: 'unread'}

/** Each listed record, read once, all at once. */
export function readListed(ids: string[]): Promise<Listed[]> {
  const dataset = conf().dataset
  return Promise.all(
    ids.map(async (id): Promise<Listed> => {
      if (!UUID.test(id)) return {id, is: 'unread'}
      const key = botKey(id)
      const a = await bp<{key?: unknown; dataset?: unknown; value?: unknown} | null>(prefs(key)).catch(() => null)
      if (!a || typeof a !== 'object' || a.key !== key || a.dataset !== dataset || !('value' in a)) return {id, is: 'unread'}
      return a.value === null ? {id, is: 'gone'} : {id, is: 'there', raw: a.value}
    }),
  )
}

/** The raw record behind a bot key, for an edit of one field. */
export const readBot = (id: string) => (UUID.test(id) ? read<Record<string, unknown>>(botKey(id)) : Promise.resolve(null))
