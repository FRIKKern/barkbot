// Barkpark's fleet stream (/v1/chat/events), cut down to what the page reads, for our own sessions
// only. Barkpark sends every session the token can see: the workspace's, or every one for a global
// admin token. Each snapshot entry is {session_id, agent_state, ts, title}, a `state` flip is
// {session_id, agent_state, ts, title: null}, and id-less `heartbeat` {session_id, ts} and `title`
// {session_id, title} frames come too (Barkpark studio_chat.ex fleet_snapshot,
// chat_controller.ex fleet_*_frame). A title is written from the conversation, so a
// workspace-mate's title is their words. So only two events go out, `snapshot` and `state`, each
// entry only {session_id, agent_state}, and only for a session that is ours (ourSessions). Every
// other event, field and session is dropped. `id:` lines go out with the frames that keep them, so
// a reconnect resumes (Barkpark replays from the cursor, and the replay is cut the same way).
// Comments (`: keepalive`) go out as they are.
import {ourSessions} from './own-session'

type Frame = {id?: string; event?: string; data: string[]; comment: boolean}

function parse(block: string): Frame {
  const f: Frame = {data: [], comment: false}
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) { f.comment = true; continue }
    const at = line.indexOf(':')
    const field = at < 0 ? line : line.slice(0, at)
    const value = at < 0 ? '' : line.slice(at + 1).replace(/^ /, '')
    if (field === 'id') f.id = value
    else if (field === 'event') f.event = value
    else if (field === 'data') f.data.push(value)
  }
  return f
}

const frame = (event: string, data: unknown, id?: string) => `${id !== undefined ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
const entry = (x: unknown): {session_id: string; agent_state: unknown} | null => {
  if (!x || typeof x !== 'object') return null
  const r = x as Record<string, unknown>
  return typeof r.session_id === 'string' ? {session_id: r.session_id, agent_state: r.agent_state} : null
}

/** One frame of Barkpark's, as it goes to the page: '' when nothing of it may. */
export async function cut(block: string, ours: (id: string) => Promise<boolean>): Promise<string> {
  const f = parse(block)
  if (f.comment && !f.event && f.data.length === 0) return ': keepalive\n\n'
  let data: unknown
  try { data = JSON.parse(f.data.join('\n')) } catch { return '' }
  if (f.event === 'snapshot') {
    const all = Array.isArray((data as {sessions?: unknown})?.sessions) ? ((data as {sessions: unknown[]}).sessions) : []
    const kept = []
    for (const x of all.map(entry)) if (x && (await ours(x.session_id))) kept.push(x)
    return frame('snapshot', {sessions: kept}, f.id)
  }
  if (f.event === 'state') {
    const x = entry(data)
    return x && (await ours(x.session_id)) ? frame('state', x, f.id) : ''
  }
  return ''
}

/** Barkpark's fleet stream, cut as above. */
export function ourFleet(up: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const ours = ourSessions()
  const dec = new TextDecoder()
  const enc = new TextEncoder()
  let rest = ''
  return up.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, out) {
      rest = (rest + dec.decode(chunk, {stream: true})).replace(/\r\n/g, '\n')
      let at: number
      while ((at = rest.indexOf('\n\n')) >= 0) {
        const block = rest.slice(0, at)
        rest = rest.slice(at + 2)
        const s = await cut(block, ours)
        if (s) out.enqueue(enc.encode(s))
      }
    },
  }))
}
