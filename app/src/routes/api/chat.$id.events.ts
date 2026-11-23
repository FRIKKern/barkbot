import {createFileRoute} from '@tanstack/react-router'
import {bpStream, historyCursor} from '../../server/barkpark'
import {requireOwnSessionRoute} from '../../server/own-session'

const OPEN = new TextEncoder().encode(': open\n\n')

// GET /api/chat/<session>/events: Barkpark's event stream for one conversation, passed through
// with the server's token. History first (event: message, id = seq), then the live run
// (event: chat, claude's own stream-json). EventSource resends Last-Event-ID on reconnect.
// The cursor is historyCursor's: a first connect asks from 0.
export const Route = createFileRoute('/api/chat/$id/events')({
  server: {
    handlers: {
      GET: async ({request, params}) => {
        // One of BarkBot's own conversations only (server/own-session.ts): any other id, a malformed one
        // too, is not found.
        await requireOwnSessionRoute(params.id)
        const up = await bpStream(`/v1/chat/sessions/${params.id}/events`, request.signal, historyCursor(request))
        if (!up.ok || !up.body) return new Response(await up.text(), {status: up.status})
        // Barkpark sends the headers at once but its first body bytes only with a keepalive, 30 s
        // later on a conversation with no rows, and a passed-through body reaches the browser only
        // with its first chunk: the page's stream opened 30 s late, and a first message gave up at
        // OPEN_MS (task-7ec7bb04a1125c4d). A comment line first opens it now; EventSource ignores it.
        const body = up.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({start: (c) => c.enqueue(OPEN)}))
        return new Response(body, {headers: {'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive'}})
      },
    },
  },
})
