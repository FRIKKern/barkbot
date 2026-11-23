import {createFileRoute} from '@tanstack/react-router'
import {bpStream} from '../../server/barkpark'
import {ourFleet} from '../../server/fleet'

// GET /api/chat/events: Barkpark's fleet stream, read with the server's token and cut to our own
// sessions' {session_id, agent_state}: a snapshot (event: snapshot), then each flip (event: state).
// Barkpark's carries every session the token sees, with titles; none of that goes out
// (server/fleet.ts). The working row and the rail's Working follow it.
export const Route = createFileRoute('/api/chat/events')({
  server: {
    handlers: {
      GET: async ({request}) => {
        const up = await bpStream('/v1/chat/events', request.signal, request.headers.get('last-event-id'))
        if (!up.ok || !up.body) return new Response(await up.text(), {status: up.status})
        return new Response(ourFleet(up.body), {headers: {'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive'}})
      },
    },
  },
})
