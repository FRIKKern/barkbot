// Gate B's stand-in for Barkpark (H5, development only): one recorded oracle turn
// (traces/<id>.json) played as Barkpark's own event stream, so a replayed turn reaches the UI
// through the same EventSource and hook a live one does. Nothing here talks to Barkpark.
//   GET  /api/gate-b/<trace>?run=<id>   the stream; quiet until that run sends
//   POST /api/gate-b/<trace>?run=<id>   the send: answers when the oracle's send was accepted,
//                                        and starts the stream's clock (t = 0 is this request)
//   GET  …&status                       what this run has done (for the gate's preconditions)
//   GET  …&fleet                        the fleet stream (Barkpark's /v1/chat/events): a snapshot
//                                        with this run's session idle, then `event: state` flips
//                                        at the oracle rail's times (Working, then not)
// After the turn the stream closes, as a dropped connection would. The browser reconnects and,
// as Barkpark does on every connect, the stream replays the stored rows as `event: message`
// (seq-ascending, `id: <seq>`): the user's row, then the turn's ONE assistant row. `history`
// picks that row's text: `last` (default) is what Barkpark stores today, the text of the turn's
// last model message, because its recorder resets the turn's text at every turn_started;
// `joined` is every message's text joined, as it would store it if that reset were fixed.
import '@tanstack/react-start/server-only'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {filler, oracleTurn, replayScript, stateScript, type Milestone, type Step, type Trace} from '../chat/turn'

type Run = {
  steps: Step[]
  states: Step[]
  accept: number
  milestones: Milestone[]
  write: (s: string) => void
  close: () => void
  fleet: (s: string) => void
  state: string
  timers: ReturnType<typeof setTimeout>[]
  sent: boolean
  connects: number
  rows: number
}
const runs = new Map<string, Run>()
const RUN = /^[\w-]{8,64}$/
const CLOSE_AFTER = 400 // ms after the turn's last event

export function loadTrace(id: string): Trace | null {
  if (!/^[\w.-]+$/.test(id)) return null
  try {
    // vite dev runs in app/; the traces live at the repo root.
    return JSON.parse(readFileSync(resolve(process.cwd(), '..', 'traces', `${id}.json`), 'utf8'))
  } catch {
    return null
  }
}

const sse = (s: Step) => `event: runtime\ndata: ${JSON.stringify(s.data)}\n\n`
const row = (seq: number, role: string, text: string) =>
  `id: ${seq}\nevent: message\ndata: ${JSON.stringify({seq, role, source_markdown: text, metadata: {}, inserted_at: new Date().toISOString()})}\n\n`

const nothing = () => {}
function runFor(run: string, trace: Trace): Run {
  let r = runs.get(run)
  if (!r) {
    const {milestones, rail} = oracleTurn(trace)
    const {accept, steps} = replayScript(milestones)
    r = {steps, states: stateScript(rail), accept, milestones, write: nothing, close: nothing, fleet: nothing, state: 'idle', timers: [], sent: false, connects: 0, rows: 0}
    runs.set(run, r)
    setTimeout(() => runs.delete(run), 5 * 60 * 1000)
  }
  return r
}
let fleetSeq = 0
// Barkpark's fleet frames (ChatController.fleet_*_frame): `id: <epoch>:<seq>`, no message content.
const fleetFrame = (event: string, data: unknown) => `id: 1:${++fleetSeq}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`

function sseResponse(start: (write: (s: string) => void, close: () => void) => void, signal: AbortSignal): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      const write = (s: string) => {
        try {
          c.enqueue(enc.encode(s))
        } catch {}
      }
      const close = () => {
        try {
          c.close()
        } catch {}
      }
      start(write, close)
      signal.addEventListener('abort', close)
    },
  })
  return new Response(body, {headers: {'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive'}})
}

/** The stored rows after the turn, as Barkpark replays them on connect. */
function history(m: Milestone[], shape: string, since: number): string {
  const user = m.find((x) => x.kind === 'user')
  const replies = m.filter((x) => x.kind === 'assistant').map((x) => filler(x.len ?? 0))
  if (!user || !replies.length) return ''
  const rows = [row(1, 'user', filler(user.len ?? 0)), row(2, 'assistant', shape === 'joined' ? replies.join('') : replies.at(-1)!)]
  return rows.slice(since).join('') // rows after Last-Event-ID, as Barkpark replays
}

export function replayStream(id: string, request: Request): Response {
  const url = new URL(request.url)
  const since = Number(request.headers.get('last-event-id') ?? 0) || 0
  const run = url.searchParams.get('run')
  if (!run || !RUN.test(run)) return new Response('no such run', {status: 404})
  if (url.searchParams.has('status')) {
    const r = runs.get(run)
    return Response.json(r ? {connects: r.connects, rows: r.rows, sent: r.sent} : null, {status: r ? 200 : 404})
  }
  const trace = loadTrace(id)
  if (!trace) return new Response('no such trace', {status: 404})
  const r = runFor(run, trace)
  if (url.searchParams.has('fleet'))
    return sseResponse((write) => {
      r.fleet = write
      write('retry: 50\n\n')
      write(fleetFrame('snapshot', {sessions: [{session_id: run, agent_state: r.state, ts: new Date().toISOString(), title: null}]}))
    }, request.signal)
  const shape = url.searchParams.get('history') ?? 'last'
  return sseResponse((write, close) => {
    r.write = write
    r.close = close
    r.connects++
    write('retry: 50\n\n') // reconnect soon after a drop; the first bytes also open the EventSource
    if (r.sent) {
      const h = history(r.milestones, shape, since)
      r.rows += (h.match(/^event: message$/gm) ?? []).length
      write(h)
    }
  }, request.signal)
}

export async function replaySend(run: string | null): Promise<Response> {
  const r = run ? runs.get(run) : undefined
  if (!r) return new Response('no stream open for this run', {status: 409})
  if (r.sent) return new Response('this run already sent', {status: 409})
  r.sent = true
  // Steps at the same moment go out in one write, as one network read would bring them.
  const at = new Map<number, Step[]>()
  for (const s of r.steps) at.set(s.t, [...(at.get(s.t) ?? []), s])
  const run_ = r
  for (const [t, group] of at) r.timers.push(setTimeout(() => run_.write(group.map(sse).join('')), t))
  for (const st of r.states)
    r.timers.push(
      setTimeout(() => {
        run_.state = String(st.data.agent_state)
        run_.fleet(fleetFrame('state', {session_id: run, ...st.data, ts: new Date().toISOString()}))
      }, st.t),
    )
  const last = Math.max(0, ...r.steps.map((s) => s.t))
  r.timers.push(setTimeout(() => run_.close(), last + CLOSE_AFTER))
  await new Promise((ok) => setTimeout(ok, r.accept))
  return Response.json({accepted: true})
}
