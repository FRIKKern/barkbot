// The conversation: a time row, the bubbles, and the working line, pinned to the bottom while
// anything lands (measured on the oracle: 0 pt from the bottom on every frame).
import {Fragment, useLayoutEffect, useRef, type ReactNode} from 'react'
import type {Answers, Ask, Bubble, Working} from '../chat/useConversation'
import {filler} from '../chat/turn'
import {AnsweredCard, QuestionCard} from './Cards'

/** A message as lengths only (O2): what a gate scene holds (gate/transcripts.ts). */
export type SceneBubble = {role: 'user' | 'assistant'; paras: {len: number; height?: number; marks?: {tag: 'strong' | 'code'; len: number}[]}[]}
/** A card in a gate scene (scripts/lib/cards.mjs sceneCard): a question waiting (choices) or answered. */
export type SceneCard = {card: 'question'; question: string; choices?: string[]; answered?: {letter: string; label: string}}
export type SceneRow = SceneBubble | SceneCard

/** A scene's conversation: its bubbles and answered cards, and the question still waiting (the last row), as the live page holds them. */
export function fromScene(rows: SceneRow[]): {bubbles: Bubble[]; ask: Ask | null} {
  const last = rows.at(-1)
  const waiting = last && 'card' in last && last.choices ? last : null
  const ask: Ask | null = waiting ? {id: 'scene-ask', what: 'ask you something', detail: null, answering: null, questions: [{question: waiting.question, header: null, multi: false, options: (waiting.choices ?? []).map((label) => ({label, description: null}))}]} : null
  const bubbles = (waiting ? rows.slice(0, -1) : rows).flatMap((r, i): Bubble[] =>
    'card' in r ? (r.answered ? [{key: `scene-${i}`, role: 'assistant', text: '', answered: {question: r.question, ...r.answered}}] : []) : fromLengths([r]).map((b) => ({...b, key: `scene-${i}`})),
  )
  return {bubbles, ask}
}

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
  return list.map((b, i) => ({key: `scene-${i}`, role: b.role, text: b.paras.map(para).join('\n\n'), heights: b.paras.map((p) => p.height ?? 0)}))
}
// n characters of words, with a space where it meets a mark before or after it.
const words = (n: number, before: boolean, after: boolean) => {
  const pad = (before ? 1 : 0) + (after ? 1 : 0)
  if (n <= pad) return ' '.repeat(Math.max(0, n))
  return (before ? ' ' : '') + filler(n - pad) + (after ? ' ' : '')
}

// A gate scene's paragraph is as tall as the oracle's, whatever its placeholder words do.
const heightStyle = (h?: number) => (h ? {height: h, overflow: 'hidden' as const} : undefined)

// A reply's paragraphs (a blank line), **bold** and `code`: the marks the oracle's replies show.
// Your own message stays as typed.
function Rich({text, heights}: {text: string; heights?: number[]}) {
  return (
    <>
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} style={heightStyle(heights?.[i])}>
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

// Two bubbles of one speaker in a row close their corners where they meet; a card between them parts them (oracle-choice-answered).
const joins = (a: Bubble | undefined, b: Bubble) => !!a && !a.answered && a.role === b.role

const timeOf = (iso: string) => {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  const t = d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'})
  return `${today ? 'Today' : d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})} ${t}`
}

export function Transcript({bot, startedAt, bubbles, working, error, picture, ask, onAnswer, onChoose}: {bot: string; startedAt: string | null; bubbles: Bubble[]; working: Working; error: string | null; picture?: (id: string) => string | null; ask?: Ask | null; onAnswer?: (decision: 'allow' | 'deny') => void; onChoose?: (answers: Answers) => void}) {
  const box = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  useLayoutEffect(() => {
    const el = box.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [bubbles, working, error, ask])
  // Pinned also when the words reflow (a font arrives, a panel opens or closes, the window resizes).
  useLayoutEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (pinned.current) el.scrollTop = el.scrollHeight
    })
    el.dataset.hydrated = '' // the server's HTML is not scrolled; Gate A measures after this
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="transcript" data-transcript="" ref={box} onScroll={(e) => {
      const el = e.currentTarget
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 2
    }}>
      <div className="column">
        {startedAt && (
          <div className="time-row">
            <time dateTime={startedAt}>{timeOf(startedAt)}</time>
          </div>
        )}
        {bubbles.map((b, i) => b.answered ? (
          // An answered question: a card in a row of its own, no bubble (oracle-choice-answered, article 134).
          <div role="article" key={b.key} className="turn turn-card">
            <AnsweredCard {...b.answered} />
          </div>
        ) : (
          <div role="article" key={b.key} className={`turn turn-${b.role}${i > 0 && bubbles[i - 1].role !== b.role ? ' turn-change' : ''}${joins(bubbles[i - 1], b) ? ' group-prev' : ''}${joins(bubbles[i + 1], b) ? ' group-next' : ''}`}>
            <div role="article" className={`bubble bubble-${b.role}`} data-role={b.role}>
              <span className="sr-only">{b.role === 'user' ? 'You' : bot}</span>
              {/* Pictures sent with the message. The oracle's picture grid is not read yet (A2): plain. */}
              {b.images && b.images.length > 0 && (
                <div className="bubble-images">
                  {b.images.map((id) => {
                    const src = picture?.(id)
                    return src ? <img key={id} src={src} alt="Attached picture" loading="lazy" /> : null
                  })}
                </div>
              )}
              {(b.text || !b.images?.length) && (
                <div className="bubble-text">
                  {b.role === 'assistant' ? <Rich text={b.text} heights={b.heights} /> : <p style={heightStyle(b.heights?.[0])}>{b.text}</p>}
                </div>
              )}
            </div>
          </div>
        ))}
        {/* The row waits for the bot's Working state (held); the status line below does not. */}
        {working && !working.held && (
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
        {ask?.questions && (
          <div role="article" className="turn turn-card turn-ask">
            <QuestionCard key={ask.id} bot={bot} questions={ask.questions} locked={!!ask.answering} onChoose={onChoose} />
          </div>
        )}
        {ask && !ask.questions && (
          // The oracle's own approval card is not read yet (Q1): this one is plain on purpose.
          <div className="ask ask-leave" role="group" aria-label={`${bot} asks to ${ask.what}`}>
            <p className="ask-what">
              {bot} asks to {ask.what}
            </p>
            {ask.detail && <pre className="ask-detail">{ask.detail}</pre>}
            <div className="ask-buttons">
              <button className="ask-deny" disabled={!!ask.answering} onClick={() => onAnswer?.('deny')}>
                Deny
              </button>
              <button className="ask-allow" disabled={!!ask.answering} onClick={() => onAnswer?.('allow')}>
                Allow
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}
        {/* Said aloud, out of sight; a question is said as the oracle says it (oracle-ask-choice: span 291). */}
        <div className="sr-status" role="status" aria-live="polite">
          <span>{ask?.questions ? `${bot} asked: ${ask.questions[0].question}` : ask ? `${bot} asks to ${ask.what}` : working && !working.leaving && !working.ended ? `${bot} is working` : bubbles.at(-1)?.role === 'assistant' ? `${bot} replied` : ''}</span>
        </div>
      </div>
    </div>
  )
}
