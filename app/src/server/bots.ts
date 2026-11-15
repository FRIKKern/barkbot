// The bots, kept in the owner's own per-account prefs (docs/contracts/user-prefs.md in Barkpark;
// plan: /papers/barkbot-many-bots-plan, "The record"):
//
//   barkbot.bots        {ids: [id, ...]}   the order in the rail; changed only by PATCH add/remove (row-locked)
//   barkbot.bot.<id>    {name, shape, colour, host_id, session_id, created_at}   PUT on its own key
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

/** The Main Bot's id: the same for every tab and device, so two first loads write the same keys. */
export const mainBotId = (hostId: string) => uuidV5(`main-bot:${hostId}`)

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
  return [...new Set(v.ids.filter((x): x is string => typeof x === 'string' && UUID.test(x)))]
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

/** Writes a bot's own key. The record is whole before its id is added to the list. */
export async function putBot(bot: Bot): Promise<void> {
  const {id, ...value} = bot
  await bp(prefs(botKey(id)), {method: 'PUT', json: {value}})
}

/** Removes a bot's own key: Create's clean-up when its list add failed, so nothing half-made stays. */
export async function dropBot(id: string): Promise<void> {
  if (UUID.test(id)) await bp(prefs(botKey(id)), {method: 'DELETE'})
}

/** Adds an id at the end of the list (idempotent: an id already there stays once). */
export async function addId(id: string): Promise<void> {
  await bp(prefs(LIST_KEY), {method: 'PATCH', json: {op: 'add', field: 'ids', item: id}})
}

/** The raw record behind a bot key, for an edit of one field. */
export const readBot = (id: string) => (UUID.test(id) ? read<Record<string, unknown>>(botKey(id)) : Promise.resolve(null))
