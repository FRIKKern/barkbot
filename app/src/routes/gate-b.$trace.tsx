import {createFileRoute, notFound} from '@tanstack/react-router'
import {useMemo, useState} from 'react'
import {Shell} from '../components/Shell'
import {Transcript} from '../components/Transcript'
import {Composer} from '../components/Composer'
import {useConversation, type Transport} from '../chat/useConversation'
import {scenes} from '../gate/scenes'

// Gate B's stage (H5): the oracle's screen with our live conversation, fed by a recorded oracle
// turn instead of Barkpark (server/replay.ts). Type anything and press Enter: the turn plays
// at the oracle's times. scripts/gate-b.mjs measures it. Development builds only.
// When each answer from the stand-in reached the page (window.__arrivals, performance.now()):
// the send's answer, and every event the stream delivered, as the listener got it. Gate B counts
// a moment from the arrival that caused it, so the stand-in's own lateness under load is not
// charged to the UI; what the UI adds after an arrival still is.
type Arrival = {type: string; kind?: string; t: number}
declare global {
  interface Window {
    __arrivals?: Arrival[]
  }
}
if (typeof window !== 'undefined' && import.meta.env.DEV && !('logged' in window.EventSource)) {
  const Base = window.EventSource
  const log = (window.__arrivals = [] as Arrival[])
  const open: EventSource[] = []
  addEventListener('pagehide', () => open.forEach((es) => es.close()))
  // An EventSource whose listeners note the moment each event reaches them.
  const Logged = function (url: string | URL, init?: EventSourceInit) {
    const es = new Base(url, init)
    open.push(es)
    const add = es.addEventListener.bind(es) as (type: string, fn: (e: MessageEvent) => void) => void
    ;(es as {addEventListener: unknown}).addEventListener = (type: string, fn: (e: MessageEvent) => void) =>
      add(type, (e: MessageEvent) => {
        let kind: string | undefined
        try {
          const d = JSON.parse(e.data)
          kind = d?.kind ?? d?.agent_state // a runtime event's kind, or a fleet state's
        } catch {}
        log.push({type, kind, t: performance.now()})
        fn(e)
      })
    return es
  } as unknown as typeof EventSource
  Object.assign(Logged, {logged: true, CONNECTING: 0, OPEN: 1, CLOSED: 2})
  window.EventSource = Logged
}

export const Route = createFileRoute('/gate-b/$trace')({
  loader: ({params}) => {
    if (!import.meta.env.DEV || !/^[\w.-]+$/.test(params.trace)) throw notFound()
    return {trace: params.trace}
  },
  component: Replay,
})

function Replay() {
  const {trace} = Route.useLoaderData()
  const scene = scenes['oracle-turn-1040']
  const bot = scene.active ?? 'Oracle'
  const [run] = useState(() => crypto.randomUUID())
  // ?history=joined: after its reconnect the stream replays the turn stored as one joined text.
  const [history] = useState(() => (typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('history')))
  // ?shape=items: the replay plays a host with item events (turn.ts, Shape).
  const [shape] = useState(() => (typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('shape')))
  const transport = useMemo<Transport>(
    () => ({
      events: (id) => `/api/gate-b/${trace}?run=${id}${history ? `&history=${encodeURIComponent(history)}` : ''}${shape ? `&shape=${encodeURIComponent(shape)}` : ''}`,
      fleet: (id) => `/api/gate-b/${trace}?run=${id}&fleet${shape ? `&shape=${encodeURIComponent(shape)}` : ''}`,
      send: async (id) => {
        const res = await fetch(`/api/gate-b/${trace}?run=${id}`, {method: 'POST'})
        const body = res.ok ? null : await res.text()
        window.__arrivals?.push({type: 'send', t: performance.now()})
        if (body !== null) throw new Error(body)
      },
    }),
    [trace, history, shape],
  )
  const convo = useConversation(run, transport)
  return (
    <>
      <Shell
        scene={scene}
        workingBots={convo.botState === 'working' ? [bot] : []}
        transcript={<Transcript bot={bot} startedAt={null} bubbles={convo.bubbles} working={convo.working} error={convo.error} />}
        composer={<Composer placeholder={`Message ${bot}`} onSend={(text) => void convo.send(text)} disabled={!convo.ready} />}
      />
      <span hidden data-gate-b={convo.ready ? 'ready' : 'waiting'} data-run={convo.ready ? run : undefined} />
    </>
  )
}
