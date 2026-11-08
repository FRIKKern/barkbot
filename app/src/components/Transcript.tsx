// The conversation: a time row, the bubbles, and the working line, pinned to the bottom while
// anything lands (measured on the oracle: 0 pt from the bottom on every frame).
import {useLayoutEffect, useRef} from 'react'
import type {Bubble, Working} from '../chat/useConversation'

const timeOf = (iso: string) => {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  const t = d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'})
  return `${today ? 'Today' : d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})} ${t}`
}

export function Transcript({bot, startedAt, bubbles, working, error}: {bot: string; startedAt: string | null; bubbles: Bubble[]; working: Working; error: string | null}) {
  const box = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  useLayoutEffect(() => {
    const el = box.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [bubbles, working, error])
  return (
    <div className="transcript" ref={box} onScroll={(e) => {
      const el = e.currentTarget
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 2
    }}>
      <div className="column">
        {startedAt && (
          <div className="time-row">
            <time dateTime={startedAt}>{timeOf(startedAt)}</time>
          </div>
        )}
        {bubbles.map((b, i) => (
          <div role="article" key={b.key} className={`turn turn-${b.role}${i > 0 && bubbles[i - 1].role !== b.role ? ' turn-change' : ''}`}>
            <div className={`bubble bubble-${b.role}`} data-role={b.role}>
              <p>{b.text}</p>
            </div>
          </div>
        ))}
        {working && (
          <div className={`working${working.leaving ? ' leaving' : ''}`} aria-hidden="true">
            <span className="work-mark">
              <span className="work-squash">
                <span className="work-tilt" />
              </span>
            </span>
            <span className={`work-label${working.first ? ' first' : ''}`} key={working.label}>
              {working.label}
            </span>
          </div>
        )}
        {error && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}
        <div className="sr-only" role="status" aria-live="polite">
          {working ? `${bot} is working` : bubbles.at(-1)?.role === 'assistant' ? `${bot} replied` : ''}
        </div>
      </div>
    </div>
  )
}
