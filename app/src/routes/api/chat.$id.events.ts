import {createFileRoute} from '@tanstack/react-router'
import {bpStream} from '../../server/barkpark'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/chat/<session>/events: Barkpark's event stream for one conversation, passed through
// with the server's token. History first (event: message, id = seq), then the live run
// (event: chat, claude's own stream-json). EventSource resends Last-Event-ID on reconnect.
// Barkpark replays stored rows only when asked (rows after Last-Event-ID; with no header, none),
// so a first connect asks from 0. Without it a reloaded page showed an empty conversation
// (seen live 2026-11-11, the first real turn).
export const Route = createFileRoute('/api/chat/$id/events')({
  server: {
    handlers: {
      GET: async ({request, params}) => {
        if (!UUID.test(params.id)) return new Response('bad id', {status: 400})
        const up = await bpStream(`/v1/chat/sessions/${params.id}/events`, request.signal, request.headers.get('last-event-id') ?? '0')
        if (!up.ok || !up.body) return new Response(await up.text(), {status: up.status})
        return new Response(up.body, {headers: {'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive'}})
      },
    },
  },
})
