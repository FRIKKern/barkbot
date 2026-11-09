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
  const transport = useMemo<Transport>(
    () => ({
      events: (id) => `/api/gate-b/${trace}?run=${id}${history ? `&history=${encodeURIComponent(history)}` : ''}`,
      send: async (id) => {
        const res = await fetch(`/api/gate-b/${trace}?run=${id}`, {method: 'POST'})
        if (!res.ok) throw new Error(await res.text())
      },
    }),
    [trace, history],
  )
  const convo = useConversation(run, transport)
  return (
    <>
      <Shell
        scene={scene}
        transcript={<Transcript bot={bot} startedAt={null} bubbles={convo.bubbles} working={convo.working} error={convo.error} />}
        composer={<Composer placeholder={`Message ${bot}`} onSend={(text) => void convo.send(text)} disabled={!convo.ready} />}
      />
      <span hidden data-gate-b={convo.ready ? 'ready' : 'waiting'} data-run={convo.ready ? run : undefined} />
    </>
  )
}
