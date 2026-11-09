import {createFileRoute} from '@tanstack/react-router'
import {bpStream} from '../../server/barkpark'

// GET /api/chat/events: Barkpark's fleet stream, passed through with the server's token. Every
// bot's state, never message content: a snapshot (event: snapshot), then each flip
// (event: state, {session_id, agent_state}). The working row and the rail's Working follow it.
export const Route = createFileRoute('/api/chat/events')({
  server: {
    handlers: {
      GET: async ({request}) => {
        const up = await bpStream('/v1/chat/events', request.signal, request.headers.get('last-event-id'))
        if (!up.ok || !up.body) return new Response(await up.text(), {status: up.status})
        return new Response(up.body, {headers: {'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive'}})
      },
    },
  },
})
