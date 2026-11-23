// The picture viewer: a press on a message's picture tile opens it over the conversation, at that
// picture (fixtures/states/oracle-picture-viewer.json: the second tile, "2 / 5"; -rest.json: the +3
// tile opens the third, "3 / 5"). It covers everything right of the rail. Over the pictures: the
// picture's name in a pill, Mark up, Download and Back to chat; under it the name and place, a strip
// of all the message's pictures, and a composer about this picture.
// Mark up and this composer's send are drawn only: neither was captured working (A2).
import {createContext, useEffect, useRef, useState} from 'react'
import {Composer, Icon} from './Composer'

/** What is open: the message's pictures by id and name, which one, how each loads, and the tile
 *  pressed, which gets focus back when the viewer closes. */
export type Viewing = {ids: string[]; names: string[]; at: number; picture: (id: string) => string | null; from?: HTMLElement | null}

/** Opens the viewer: Shell provides it, a picture tile calls it. Outside a Shell a tile opens nothing. */
export const OpenViewer = createContext<((v: Viewing) => void) | null>(null)

/** A picture's name as the viewer shows it: the name it was sent with, else "image". */
const nameOf = (v: Viewing, i: number) => v.names[i] || 'image'

export function Viewer({viewing, onClose}: {viewing: Viewing; onClose: () => void}) {
  const [at, setAt] = useState(viewing.at)
  const root = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const total = viewing.ids.length
  const name = nameOf(viewing, at)
  const src = viewing.picture(viewing.ids[at])
  // The oracle's viewer opens with its composer's Prompt focused (the box's border is the focused
  // 0.22, oracle-picture-viewer 340). Escape closes from anywhere in it, as Back to chat does.
  useEffect(() => {
    root.current?.querySelector<HTMLElement>('.prompt')?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      close.current()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  // Download: the picture by the same route its <img> loads (routes/api/chat.$id.attachments.$aid.ts),
  // saved under its name. The route serves only the four picture types, as themselves, nosniff.
  const download = () => {
    if (!src) return
    const a = document.createElement('a')
    a.href = src
    a.download = name
    a.click()
  }
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-labelledby="viewer-name" ref={root}>
      <div className="viewer-top">
        <span className="viewer-pill">
          <span id="viewer-name">{name}</span>
        </span>
        <div className="viewer-actions">
          <button className="viewer-round" aria-label="Mark up image" aria-disabled="true">
            <Icon d="M10.5 3l2.5 2.5-7 7H3.5V10zM9 4.5L11.5 7" />
          </button>
          <button className="viewer-round" aria-label="Download media" onClick={download}>
            <Icon d="M8 2.5V10M5 7l3 3 3-3M3 12.5h10" />
          </button>
          <button className="viewer-round" aria-label="Back to chat" onClick={onClose}>
            <Icon d="M4 4l8 8M12 4l-8 8" />
          </button>
        </div>
      </div>
      <div className="viewer-media" role="group" aria-label={`Media ${at + 1} of ${total}`}>
        <div className="viewer-stage">{src && <img src={src} alt={name} />}</div>
        <span className="viewer-caption">{`${name} · ${at + 1} / ${total}`}</span>
        <div className="viewer-strip">
          {viewing.ids.map((id, i) => {
            const thumb = viewing.picture(id)
            return (
              <button key={id} className={`viewer-thumb${i === at ? ' on' : ''}`} aria-label={`View media ${i + 1} of ${total}`} aria-current={i === at ? 'true' : undefined} onClick={() => setAt(i)}>
                {thumb && <img src={thumb} alt="" />}
              </button>
            )
          })}
        </div>
      </div>
      <div className="viewer-composer">
        <div className="viewer-compose" role="group" aria-label={`Message about “${name}”`}>
          <Composer placeholder={`Message about ${name}`} disabled />
        </div>
      </div>
    </div>
  )
}
