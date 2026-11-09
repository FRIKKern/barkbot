// Gate B's stand-in for Barkpark (H5, development only): one recorded oracle turn
// (traces/<id>.json) played as Barkpark's own event stream, so a replayed turn reaches the UI
// through the same EventSource and hook a live one does. Nothing here talks to Barkpark.
//   GET  /api/gate-b/<trace>?run=<id>   the stream; quiet until that run sends
//   POST /api/gate-b/<trace>?run=<id>   the send: answers when the oracle's send was accepted,
//                                        and starts the stream's clock (t = 0 is this request)
import '@tanstack/react-start/server-only'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {oracleTurn, replayScript, type Step, type Trace} from '../chat/turn'

type Run = {steps: Step[]; accept: number; write: (s: string) => void; timers: ReturnType<typeof setTimeout>[]; sent: boolean}
const runs = new Map<string, Run>()
const RUN = /^[\w-]{8,64}$/

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

export function replayStream(id: string, run: string | null, signal: AbortSignal): Response {
  const trace = loadTrace(id)
  if (!trace || !run || !RUN.test(run)) return new Response('no such trace or run', {status: 404})
  const {accept, steps} = replayScript(oracleTurn(trace).milestones)
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      const r: Run = {steps, accept, timers: [], sent: false, write: (s) => {
        try {
          c.enqueue(enc.encode(s))
        } catch {}
      }}
      runs.set(run, r)
      r.write(': replay\n\n') // the first bytes open the EventSource
      signal.addEventListener('abort', () => {
        r.timers.forEach(clearTimeout)
        runs.delete(run)
        try {
          c.close()
        } catch {}
      })
    },
  })
  return new Response(body, {headers: {'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive'}})
}

export async function replaySend(run: string | null): Promise<Response> {
  const r = run ? runs.get(run) : undefined
  if (!r) return new Response('no stream open for this run', {status: 409})
  if (r.sent) return new Response('this run already sent', {status: 409})
  r.sent = true
  // Steps at the same moment go out in one write, as one network read would bring them.
  const at = new Map<number, Step[]>()
  for (const s of r.steps) at.set(s.t, [...(at.get(s.t) ?? []), s])
  for (const [t, group] of at) r.timers.push(setTimeout(() => r.write(group.map(sse).join('')), t))
  await new Promise((ok) => setTimeout(ok, r.accept))
  return Response.json({accepted: true})
}
