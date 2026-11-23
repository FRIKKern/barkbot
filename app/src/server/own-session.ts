// One answer to "is this conversation one of BarkBot's own?" for every door that takes a session id
// (task-26a1a137b955ef3b): the routes under /api/chat/<session>/ and the server functions that send,
// store or answer for a session. The owner's token can be a global admin, which opens ANY session
// id, so an id a page sends is a claim. It passes only when both hold:
//  (a) Barkpark shows it as a registered-host session on one of the caller's own enrolled,
//      unrevoked computers (ownHosts), and
//  (b) BarkBot itself knows it: a bot record names it, on that computer, or this server made it
//      (startChat calls madeHere; that covers a conversation whose record was not saved, kept:false).
// (a) alone is not enough: Barkpark lists every computer of the workspace (chat_hosts/context.ex
// list_hosts), and any member with chat access can make and drive a session on one
// (chat_controller.ex create; host_execution_gate.ex authorize_turn passes every registered-host
// turn). Barkpark task-7efaf895e8bc88e4 would record who made a session.
// A read that fails or does not answer is never a yes: the door answers as for a stranger's.
// Known misses (accepted): after a restart, a kept:false conversation is not known until its record
// is saved; a conversation on a computer that was revoked does not open (the list leaves it out).
import {bp, conf, BarkparkError} from './barkpark'
import {listIds, NO_MESSAGES, READ_CAP, readListed, trusted} from './bots'

export type OwnComputer = {id: string; name: string; online: boolean; lastSeenAt: string | null}
type RawHost = {id: string; name: string; online: boolean; enrolled: boolean; revoked: boolean; last_seen_at?: string | null}

/** The caller's own computers: enrolled and not revoked, as Barkpark lists them to the caller. */
export async function ownHosts(): Promise<OwnComputer[]> {
  const {hosts} = await bp<{hosts: RawHost[]}>(`/w/${conf().workspace}/v1/chat-hosts`)
  return hosts.filter((x) => x.enrolled && !x.revoked).map((h) => ({id: h.id, name: h.name, online: h.online, lastSeenAt: h.last_seen_at ?? null}))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KEEP = 1000
// Session id → the computer it runs on. `runsOn`: what Barkpark showed (a session's target and host
// are set when it is made and never change: session.ex casts them in create_changeset only).
// `known`: (b) proven. Only yeses are kept; the oldest goes first past KEEP.
const runsOn = new Map<string, string>()
const known = new Map<string, string>()
const keep = (m: Map<string, string>, id: string, host: string) => {
  m.delete(id)
  m.set(id, host)
  if (m.size > KEEP) m.delete(m.keys().next().value as string)
}

/** A conversation this server just made on `hostId` (startChat), saved to its bot or not. */
export const madeHere = (id: string, hostId: string) => keep(known, id, hostId)

/** The computer a registered-host session runs on, or null: gone (404), managed, or not that id. */
async function hostOf(id: string): Promise<string | null> {
  const had = runsOn.get(id)
  if (had) return had
  let s: {id?: unknown; execution_target?: unknown; execution_host_id?: unknown}
  try {
    s = await bp(`/v1/chat/sessions/${encodeURIComponent(id)}?since=${NO_MESSAGES}`)
  } catch (e) {
    if (e instanceof BarkparkError && e.status === 404) return null
    throw e
  }
  if (s.id !== id || s.execution_target !== 'registered_host' || typeof s.execution_host_id !== 'string') return null
  keep(runsOn, id, s.execution_host_id)
  return s.execution_host_id
}

/** Whether one of the bot records a load reads names this session on this computer. A record that
 *  could not be read names nothing. */
async function inRecord(id: string, host: string, hosts: OwnComputer[]): Promise<boolean> {
  const ids = (await listIds()) ?? []
  for (const r of await readListed(ids.slice(0, READ_CAP))) {
    if (r.is !== 'there') continue
    const bot = trusted(r.id, r.raw, hosts)
    if (bot && bot.session_id === id && bot.host_id === host) return true
  }
  return false
}

/** True only when the session is one of BarkBot's own, as above. Any failure: false. */
export async function ownSession(id: unknown): Promise<boolean> {
  if (typeof id !== 'string' || !UUID.test(id)) return false
  try {
    const [hosts, host] = await Promise.all([ownHosts(), hostOf(id)])
    if (host === null || !hosts.some((h) => h.id === host)) return false
    if (known.get(id) === host) return true
    if (!(await inRecord(id, host, hosts))) return false
    keep(known, id, host)
    return true
  } catch (e) {
    console.warn(`barkbot: could not check a conversation as one of your bots' (${(e as Error).message})`)
    return false
  }
}

/** What a door says when ownSession says no. */
export const NOT_OWN = 'This conversation could not be checked as one of your bots\', so nothing was done with it. Reload to try again.'
