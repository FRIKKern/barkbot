// What the pointer brings up: tooltips and a bot's chat preview (fixtures/states/oracle-hover-*.json).
// Both hang at the end of <body>, as the oracle's do, so they never shift the page's own order.
//
//   tooltip   24 high, 12/16 type on the raised ground, radius 6, 8 from its control, centred on it,
//             kept 8 inside the window (Connect apps: x 8, not centred)
//   preview   260 wide, 8 right of the bot's tile and centred on it: face 16, name 13/500, the bot's
//             last message at 66% ink, two lines at most (1.2.3, oracle-hover-bot-tile-2: 78 tall,
//             12 above the tile; 0.79.3 showed one line, 60 tall, 3 above)
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
    <div className="preview-wrap" role="presentation" style={{left: box.right + 8, top: (box.top + box.bottom) / 2}}>
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
