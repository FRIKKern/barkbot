import {createFileRoute} from '@tanstack/react-router'
import {bpStream, historyCursor} from '../../server/barkpark'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/chat/<session>/events: Barkpark's event stream for one conversation, passed through
// with the server's token. History first (event: message, id = seq), then the live run
// (event: chat, claude's own stream-json). EventSource resends Last-Event-ID on reconnect.
// The cursor is historyCursor's: a first connect asks from 0.
export const Route = createFileRoute('/api/chat/$id/events')({
  server: {
    handlers: {
      GET: async ({request, params}) => {
        if (!UUID.test(params.id)) return new Response('bad id', {status: 400})
        const up = await bpStream(`/v1/chat/sessions/${params.id}/events`, request.signal, historyCursor(request))
        if (!up.ok || !up.body) return new Response(await up.text(), {status: up.status})
        return new Response(up.body, {headers: {'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive'}})
      },
    },
  },
})
