import {createFileRoute} from '@tanstack/react-router'
import {replaySend, replayStream} from '../../server/replay'

// Gate B's event stream and send for one recorded oracle turn (server/replay.ts).
// Development builds only; production answers 404.
export const Route = createFileRoute('/api/gate-b/$trace')({
  server: {
    handlers: {
      GET: ({request, params}) => {
        if (!import.meta.env.DEV) return new Response('not found', {status: 404})
        return replayStream(params.trace, new URL(request.url).searchParams.get('run'), request.signal)
      },
      POST: ({request}) => {
        if (!import.meta.env.DEV) return new Response('not found', {status: 404})
        return replaySend(new URL(request.url).searchParams.get('run'))
      },
    },
  },
})
