// The conversation: a time row, the bubbles, and the working line, pinned to the bottom while
// anything lands (measured on the oracle: 0 pt from the bottom on every frame).
import {Fragment, useLayoutEffect, useRef, type ReactNode} from 'react'
import type {Bubble, Working} from '../chat/useConversation'
import {filler} from '../chat/turn'

/** A message as lengths only (O2): what a gate scene holds (gate/transcripts.ts). */
export type SceneBubble = {role: 'user' | 'assistant'; paras: {len: number; marks?: {tag: 'strong' | 'code'; len: number}[]}[]}

/** Placeholder words of the captured lengths, bold runs and code spans (one word, like a path) in their order. */
export function fromLengths(list: SceneBubble[]): Bubble[] {
  const para = ({len, marks = []}: SceneBubble['paras'][number]) => {
    let rest = len - marks.reduce((n, m) => n + m.len, 0)
    let out = ''
    marks.forEach((m, i) => {
      const seg = Math.floor(rest / (marks.length + 1 - i))
      rest -= seg
      out += words(seg, i > 0, true) + (m.tag === 'strong' ? `**${filler(m.len)}**` : `\`${filler(m.len).replaceAll(' ', '_')}\``)
    })
    return out + words(rest, marks.length > 0, false)
  }
  return list.map((b, i) => ({key: `scene-${i}`, role: b.role, text: b.paras.map(para).join('\n\n')}))
}
// n characters of words, with a space where it meets a mark before or after it.
const words = (n: number, before: boolean, after: boolean) => {
  const pad = (before ? 1 : 0) + (after ? 1 : 0)
  if (n <= pad) return ' '.repeat(Math.max(0, n))
  return (before ? ' ' : '') + filler(n - pad) + (after ? ' ' : '')
}

// A reply's paragraphs (a blank line), **bold** and `code`: the marks the oracle's replies show.
// Your own message stays as typed.
function Rich({text}: {text: string}) {
  return (
    <>
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i}>
          {p.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, j): ReactNode =>
            part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
              <strong key={j}>{part.slice(2, -2)}</strong>
            ) : part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
              <code key={j}>{part.slice(1, -1)}</code>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            ),
          )}
        </p>
      ))}
    </>
  )
}

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
  // Pinned also when the words reflow (a font arrives, a panel opens or closes, the window resizes).
  useLayoutEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (pinned.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [])
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
          <div role="article" key={b.key} className={`turn turn-${b.role}${i > 0 && bubbles[i - 1].role !== b.role ? ' turn-change' : ''}${bubbles[i - 1]?.role === b.role ? ' group-prev' : ''}${bubbles[i + 1]?.role === b.role ? ' group-next' : ''}`}>
            <div role="article" className={`bubble bubble-${b.role}`} data-role={b.role}>
              <span className="sr-only">{b.role === 'user' ? 'You' : bot}</span>
              <div className="bubble-text">
                {b.role === 'assistant' ? <Rich text={b.text} /> : <p>{b.text}</p>}
              </div>
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
          {working && !working.leaving ? `${bot} is working` : bubbles.at(-1)?.role === 'assistant' ? `${bot} replied` : ''}
        </div>
      </div>
    </div>
  )
}
