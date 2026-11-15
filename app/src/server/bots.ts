// The bots, kept in the owner's own per-account prefs (docs/contracts/user-prefs.md in Barkpark;
// plan: /papers/barkbot-many-bots-plan, "The record"):
//
//   barkbot.bots        {ids: [id, ...]}   the order in the rail; changed only by PATCH add/remove (row-locked)
//   barkbot.bot.<id>    {name, shape, colour, host_id, session_id, created_at}   PUT on its own key
//   barkbot.bot         {name}             today's one bot, before the store: read, never written or deleted
//
// A pref is written by a client, so a record is a claim, not a fact. A record is shown only if its
// key, id and fields are well formed, its host is one of the caller's own enrolled computers, and
// its session (if it names one) is one of the caller's own registered-host sessions ON THAT HOST.
// Anything else is dropped: not shown, and nothing is ever sent to the session it names (the
// owner's bp token can be a global admin, which opens any session id).
// No token, credential or enrollment value is ever written in a pref.
import {createHash} from 'node:crypto'
import {bp, conf} from './barkpark'

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

export const validName = (n: unknown): n is string => typeof n === 'string' && n.trim().length > 0 && n.length <= 200

async function read<T>(key: string): Promise<T | null> {
  const {value} = await bp<{value: T | null}>(prefs(key))
  return value
}

/** The ids in rail order, or null when the store was never made. */
export async function listIds(): Promise<string[] | null> {
  const v = await read<{ids?: unknown}>(LIST_KEY)
  if (!v || !Array.isArray(v.ids)) return null
  return v.ids.filter((x): x is string => typeof x === 'string' && UUID.test(x))
}

/** Today's one bot's name (the legacy pref), or null. Read only. */
export async function legacyName(): Promise<string | null> {
  try {
    const v = await read<{name?: unknown}>(LEGACY_KEY)
    return validName(v?.name) ? v!.name : null
  } catch (e) {
    console.warn(`barkbot: could not read the saved bot name (${(e as Error).message})`)
    return null
  }
}

/** A record, checked against what the caller itself can see. Null: dropped. */
export function trusted(id: string, raw: unknown, hosts: OwnHost[], sessions: OwnSession[]): Bot | null {
  if (!UUID.test(id) || !raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!validName(r.name) || typeof r.host_id !== 'string' || typeof r.created_at !== 'string') return null
  if (!hosts.some((h) => h.id === r.host_id)) return null
  const sid = r.session_id ?? null
  if (sid !== null) {
    if (typeof sid !== 'string') return null
    const s = sessions.find((x) => x.id === sid)
    if (!s || s.execution_target !== 'registered_host' || s.execution_host_id !== r.host_id) return null
  }
  const opt = (v: unknown) => (typeof v === 'string' && v.length <= 40 ? v : undefined)
  return {id, name: r.name, shape: opt(r.shape), colour: opt(r.colour), host_id: r.host_id, session_id: sid, created_at: r.created_at}
}

/** Every record in the list, in order, keeping only the trusted ones. */
export async function readBots(ids: string[], hosts: OwnHost[], sessions: OwnSession[]): Promise<Bot[]> {
  const raws = await Promise.all(ids.map((id) => read<unknown>(botKey(id)).catch(() => null)))
  return ids.map((id, i) => trusted(id, raws[i], hosts, sessions)).filter((b): b is Bot => b !== null)
}

/** Writes a bot's own key. The record is whole before its id is added to the list. */
export async function putBot(bot: Bot): Promise<void> {
  const {id, ...value} = bot
  await bp(prefs(botKey(id)), {method: 'PUT', json: {value}})
}

/** Adds an id at the end of the list (idempotent: an id already there stays once). */
export async function addId(id: string): Promise<void> {
  await bp(prefs(LIST_KEY), {method: 'PATCH', json: {op: 'add', field: 'ids', item: id}})
}

/** The raw record behind a bot key, for an edit of one field. */
export const readBot = (id: string) => (UUID.test(id) ? read<Record<string, unknown>>(botKey(id)) : Promise.resolve(null))
