// Cards in the conversation, each in a row of its own (no bubble): the bot's question.
// Read on the oracle 1.0.3 (fixtures/states/oracle-ask-choice, -choice-answered; Gate A card cases,
// scripts/lib/cards.mjs). Numbers in styles/cards.css.
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
