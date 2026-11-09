// What the pointer brings up: tooltips and a bot's chat preview (fixtures/states/oracle-hover-*.json).
// Both hang at the end of <body>, as the oracle's do, so they never shift the page's own order.
//
//   tooltip   24 high, 12/16 type on the raised ground, radius 6, 8 from its control, centred on it,
//             kept 8 inside the window (Connect apps: x 8, not centred)
//   preview   260 x 60 card, 8 right of the bot's tile and 3 above it: face 16, name 13/500, one
//             line of the bot's last message at 66% ink
import {useLayoutEffect, useRef, useState, type ReactNode} from 'react'
import {createPortal} from 'react-dom'

type Box = {left: number; top: number; right: number; bottom: number; width: number}

// Spread `on` onto the control; `box` is its rectangle while the pointer is over it.
export function useHover() {
  const [box, setBox] = useState<Box | null>(null)
  const on = {
    onMouseEnter: (e: {currentTarget: Element}) => setBox(e.currentTarget.getBoundingClientRect()),
    onMouseLeave: () => setBox(null),
  }
  return {box, on}
}

const EDGE = 8
const GAP = 8

export function Tooltip({box, side = 'top', children}: {box: Box | null; side?: 'top' | 'bottom'; children: ReactNode}) {
  const ref = useRef<HTMLDivElement>(null)
  const [left, setLeft] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!box || !ref.current) return setLeft(null)
    const w = ref.current.getBoundingClientRect().width
    const centred = box.left + box.width / 2 - w / 2
    setLeft(Math.max(EDGE, Math.min(centred, window.innerWidth - EDGE - w)))
  }, [box])
  if (!box) return null
  const top = side === 'top' ? box.top - GAP - 24 : box.bottom + GAP
  return createPortal(
    <div className="tip-wrap" role="presentation" style={{left: left ?? box.left, top, visibility: left === null ? 'hidden' : undefined}}>
      <div ref={ref} className="tip" role="tooltip">
        {children}
      </div>
    </div>,
    document.body,
  )
}

// Keys inside a tooltip ("Click or hold ⌘ D to dictate").
export function Keys({keys}: {keys: string[]}) {
  return (
    <span className="tip-keys">
      <span>
        {keys.map((k) => (
          <span key={k} className="tip-key">
            {k}
          </span>
        ))}
      </span>
    </span>
  )
}

export function Preview({box, name, line}: {box: Box | null; name: string; line: string}) {
  if (!box) return null
  return createPortal(
    <div className="preview-wrap" role="presentation" style={{left: box.right + 8, top: box.top - 3}}>
      <div className="preview" role="dialog" aria-label={`${name} chat preview`}>
        <div className="preview-body">
          <div className="preview-head">
            <span className="preview-face" />
            <span className="preview-name">{name}</span>
          </div>
          <span className="preview-line">{line}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
