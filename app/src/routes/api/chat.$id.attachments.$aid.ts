import {createFileRoute} from '@tanstack/react-router'
import {bp} from '../../server/barkpark'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA = /^[0-9a-f]{64}$/
const PICTURES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
// A name goes into the header only if it is plainly safe, else none (Barkpark's
// TicketsAttachmentsController safe_filename): no quotes, no line breaks, no header games.
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,127}$/

// GET /api/chat/<session>/attachments/<id>[?name=<file name>]: one picture, text file or PDF of a
// conversation. Barkpark answers the bytes as base64 in JSON with the type it read from them
// (HTML, SVG and script are stored as text/plain), and the bytes go out only as one of these:
//   a picture: inline, as itself (an <img>, or a new tab);
//   a text file: text/plain; charset=utf-8, as a download;
//   a PDF: application/pdf, as a download, never drawn here. Chrome's PDF viewer runs a PDF's own
//     script (dialogs) under this origin and does not apply a CSP sandbox to it (rev299 on #317),
//     and a file can land on a bot's reply as well as on the person's message.
// Each with nosniff, so the browser never guesses a type. The two files also carry a CSP sandbox,
// as Barkpark's ticket route sends; that is not what keeps them from drawing here: the download is.
// Anything else: 415, no bytes. The shape is Barkpark's TicketsAttachmentsController's: only raster
// pictures inline, every other type downloads (task-71ee600273461306).
export const Route = createFileRoute('/api/chat/$id/attachments/$aid')({
  server: {
    handlers: {
      GET: async ({params, request}) => {
        if (!UUID.test(params.id) || !SHA.test(params.aid)) return new Response('bad id', {status: 400})
        try {
          // A picture's bytes are not bounded (barkpark.ts READ_MS): a slow link is not a hang.
          const {attachment} = await bp<{attachment: {media_type: string; data: string}}>(`/v1/chat/sessions/${params.id}/attachments/${params.aid}`, {unbounded: true})
          const type = attachment.media_type.split(';')[0].trim().toLowerCase()
          const name = new URL(request.url).searchParams.get('name')
          const named = (kind: string) => (name && SAFE_NAME.test(name) ? `${kind}; filename="${name}"` : kind)
          const bytes = Buffer.from(attachment.data, 'base64')
          const common = {'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=31536000, immutable'}
          if (PICTURES.has(type)) return new Response(bytes, {headers: {...common, 'content-type': type}})
          if (type === 'text/plain') return new Response(bytes, {headers: {...common, 'content-type': 'text/plain; charset=utf-8', 'content-disposition': named('attachment'), 'content-security-policy': 'sandbox'}})
          if (type === 'application/pdf') return new Response(bytes, {headers: {...common, 'content-type': 'application/pdf', 'content-disposition': named('attachment'), 'content-security-policy': 'sandbox'}})
          return new Response('not a picture, a text file or a PDF', {status: 415})
        } catch {
          return new Response('not found', {status: 404})
        }
      },
    },
  },
})
