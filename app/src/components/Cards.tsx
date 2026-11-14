// Cards in the conversation, each in a row of its own (no bubble): the bot's question, a file
// sent, the pictures sent. Read on the oracle 1.0.3 (fixtures/states/oracle-ask-choice,
// -choice-answered, -file-sent, -pictures-sent; Gate A card cases, scripts/lib/cards.mjs).
// Numbers in styles/cards.css.
import {useState} from 'react'
import type {Answers, Question} from '../chat/useConversation'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** The question in bold, over its choices (oracle-ask-choice: p 142, span 143). */
function Head({question, answered}: {question: string; answered?: boolean}) {
  return (
    <div className="qcard-head">
      <p className={`ask-what qcard-q${answered ? ' answered' : ''}`}>
        <span>{question}</span>
      </p>
    </div>
  )
}

/** A choice's letter and label (button 146: span 147, span 148 > span 149). */
function Choice({letter, label, note, picked}: {letter: string; label: string; note?: string | null; picked?: boolean}) {
  return (
    <>
      <span className={`ask-letter${picked ? ' picked' : ''}`} aria-hidden="true">{letter}</span>
      <span className="ask-choice-text">
        <span className="ask-label">{label}</span>
        {note && <span className="ask-note">{note}</span>}
      </span>
    </>
  )
}

/** An answered question: the question dimmed, only the chosen row, its square filled (oracle-choice-answered). */
export function AnsweredCard({question, letter, label}: {question: string; letter: string; label: string}) {
  return (
    <div className="qcard" role="group" aria-label={question}>
      <section className="qcard-box">
        <Head question={question} answered />
        <div className="qcard-rows" role="group" aria-label="Your answer">
          <div className="qcard-row">
            <Choice letter={letter} label={label} picked />
          </div>
        </div>
      </section>
    </div>
  )
}

// The bot's question, its choices lettered. One single-choice question answers on a press, and
// shows the answered form while the answer is on its way; more than one question, or a
// pick-several, is sent with Send once every question has a choice (not read on the oracle:
// the same card, a filled square for each pick).
export function QuestionCard({bot, questions, locked, onChoose}: {bot: string; questions: Question[]; locked: boolean; onChoose?: (answers: Answers) => void}) {
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const direct = questions.length === 1 && !questions[0].multi
  const answers = (p: Record<string, string[]>): Answers => Object.fromEntries(questions.map((q) => [q.question, q.multi ? p[q.question] ?? [] : (p[q.question] ?? [])[0]]))
  const complete = questions.every((q) => (picked[q.question] ?? []).length > 0)
  const press = (q: Question, label: string) => {
    if (direct) {
      setPicked({[q.question]: [label]})
      return onChoose?.({[q.question]: label})
    }
    setPicked((p) => {
      const had = p[q.question] ?? []
      return {...p, [q.question]: q.multi ? (had.includes(label) ? had.filter((x) => x !== label) : [...had, label]) : [label]}
    })
  }
  const chosen = direct && locked ? picked[questions[0].question]?.[0] : undefined
  if (chosen) {
    const i = questions[0].options.findIndex((o) => o.label === chosen)
    return <AnsweredCard question={questions[0].question} letter={LETTERS[i] ?? '·'} label={chosen} />
  }
  return (
    <div className="ask qcard" role="group" aria-label={`${bot} asks you something`}>
      <section className="qcard-box">
        {questions.map((q) => (
          <fieldset className="ask-question" key={q.question} disabled={locked} aria-label={q.question}>
            <Head question={q.question} />
            <form className="qcard-rows" aria-label={q.question} onSubmit={(e) => e.preventDefault()}>
              {q.options.map((o, i) => {
                const on = (picked[q.question] ?? []).includes(o.label)
                return (
                  <button type="button" className="ask-choice" key={o.label} aria-pressed={direct ? undefined : on} onClick={() => press(q, o.label)}>
                    <Choice letter={LETTERS[i] ?? '·'} label={o.label} note={o.description} picked={!direct && on} />
                  </button>
                )
              })}
            </form>
          </fieldset>
        ))}
        {!direct && (
          <div className="ask-buttons">
            <button className="ask-allow" disabled={locked || !complete} onClick={() => onChoose?.(answers(picked))}>
              Send
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

/** A page mark: a sheet with four lines of text on it (oracle-file-sent, span 139 and its four lines). */
export function PageMark() {
  return (
    <span className="page-mark" aria-hidden="true">
      <span className="page-sheet">
        <span className="page-line short" />
        <span className="page-line" />
        <span className="page-line" />
        <span className="page-line short" />
      </span>
    </span>
  )
}

/** The name, its kind kept apart so a long name loses its middle, not its ending (span 148 and 149). */
export function FileName({name}: {name: string}) {
  const dot = name.lastIndexOf('.')
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  return (
    <p className="file-name">
      <bdi>
        <span className="file-base">{base}</span>
        {ext && <span className="file-ext">{ext}</span>}
      </bdi>
    </p>
  )
}

/** A file sent with a message: a card with a page mark, the name and the size, above its bubble
 *  (oracle-file-sent, article 131: 300 x 72, radius 22, on rgb 37). Not openable yet: Barkpark
 *  stores no files but pictures (task-b47b4dcd04d7e4de). */
export function FileCard({name, size}: {name: string; size: string}) {
  return (
    <div className="file-card" role="button" aria-label={`Open ${name}`} aria-disabled="true">
      <section className="file-box">
        <div className="file-body">
          <PageMark />
          <div className="file-text">
            <FileName name={name} />
            <p className="file-size">{size}</p>
          </div>
          <div className="file-actions" />
        </div>
      </section>
    </div>
  )
}

const MAX_TILES = 3

/** A message's pictures: square tiles in a row above its bubble, three at most; past three the third
 *  is dimmed and says how many more (oracle-pictures-sent, article 128: 156 squares 6 apart, "+3" for five). */
export function PictureTiles({ids, picture}: {ids: string[]; picture?: (id: string) => string | null}) {
  const shown = ids.slice(0, MAX_TILES)
  const more = ids.length - MAX_TILES + 1
  return (
    <div className="picture-tiles">
      {shown.map((id, i) => {
        const rest = i === MAX_TILES - 1 && ids.length > MAX_TILES
        const src = picture?.(id)
        return (
          <div className="tile" key={id}>
            <button className="tile-open" aria-label={rest ? `Open the remaining ${more} images full screen` : 'Open image full screen'}>
              {src && <img src={src} alt="" loading="lazy" />}
            </button>
            {rest && <span className="tile-more" aria-hidden="true">+{more}</span>}
          </div>
        )
      })}
    </div>
  )
}

// A gate scene's pictures: plain squares of colour (O2: no picture from the capture is kept).
const COLOURS = ['#b33', '#3a3', '#33b', '#bb3', '#838']
export const scenePicture = (id: string) => {
  const n = Number(id.split(':')[1] ?? 0)
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="${COLOURS[n % COLOURS.length]}"/></svg>`)}`
}
