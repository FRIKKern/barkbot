import {createFileRoute} from '@tanstack/react-router'
import {bp} from '../../server/barkpark'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA = /^[0-9a-f]{64}$/
const TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

// GET /api/chat/<session>/attachments/<id>: one picture of a conversation, for an <img>. Barkpark
// answers the bytes as base64 in JSON with the type it read from them; this passes them on as
// that type only if it is one of the four picture types, and tells the browser not to guess.
export const Route = createFileRoute('/api/chat/$id/attachments/$aid')({
  server: {
    handlers: {
      GET: async ({params}) => {
        if (!UUID.test(params.id) || !SHA.test(params.aid)) return new Response('bad id', {status: 400})
        try {
          const {attachment} = await bp<{attachment: {media_type: string; data: string}}>(`/v1/chat/sessions/${params.id}/attachments/${params.aid}`)
          if (!TYPES.has(attachment.media_type)) return new Response('not a picture', {status: 415})
          return new Response(Buffer.from(attachment.data, 'base64'), {headers: {'content-type': attachment.media_type, 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=31536000, immutable'}})
        } catch {
          return new Response('not found', {status: 404})
        }
      },
    },
  },
})
