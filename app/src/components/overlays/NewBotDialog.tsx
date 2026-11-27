// Create new Bot (fixtures/states/oracle-new-bot-dialog.json): 440 x 579, centred over a 70%
// black scrim. A preview of the character, its name, 13 shapes, 11 colours; Create stays disabled
// until the bot has a name. The shapes are plain geometric stand-ins drawn here, never the
// oracle's character art (O2). Create makes the bot (onCreate): it reads Creating… while that is
// in flight, as the oracle's does (traces/2026-11-08-create-oracle.json: at 349 ms), and the
// dialog closes once the bot is made. In a gate scene there is no onCreate, and Create does nothing.
import {useState} from 'react'
import {Icon} from '../Composer'
import {colours, shapeRows} from './data'
import {fit} from '../parts'
import {CREATE_UNSURE, CreateRetry} from '../../chat/create-unsure'
import type {CreateBot} from '.'

// Plain shapes in a 36 x 36 box, one per captured shape name.
const shapes: Record<string, string> = {
  blob: 'M18 4c8 0 14 5 14 13s-6 15-14 15S4 26 4 18 10 4 18 4z',
  cloud: 'M11 28a7 7 0 0 1-1-14 9 9 0 0 1 17 2 6 6 0 0 1-1 12z',
  square: 'M8 6h20a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
  sparkle: 'M18 3l3.5 11.5L33 18l-11.5 3.5L18 33l-3.5-11.5L3 18l11.5-3.5z',
  clover: 'M18 5a6 6 0 0 1 6 6 6 6 0 0 1 0 12 6 6 0 0 1-12 0 6 6 0 0 1 0-12 6 6 0 0 1 6-6z',
  heart: 'M18 31L6 19a7 7 0 0 1 12-9 7 7 0 0 1 12 9z',
  flower: 'M18 4l4 6 7-1-1 7 6 4-6 4 1 7-7-1-4 6-4-6-7 1 1-7-6-4 6-4-1-7 7 1z',
  teardrop: 'M18 4c6 8 11 13 11 19a11 11 0 0 1-22 0c0-6 5-11 11-19z',
  tablet: 'M5 11a5 5 0 0 1 5-5h16a5 5 0 0 1 5 5v14a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z',
  wedge: 'M6 6l24 6-6 18z',
  house: 'M18 5l13 11v15H5V16z',
  star: 'M18 3l4.4 9 9.9 1.4-7.2 7 1.7 9.9-8.8-4.7-8.8 4.7 1.7-9.9-7.2-7 9.9-1.4z',
  hex: 'M18 4l12 7v14l-12 7-12-7V11z',
}

export function Shape({name, size}: {name: string; size: number}) {
  return (
    <svg className="shape" viewBox="0 0 36 36" width={size} height={size} aria-hidden="true">
      <path d={shapes[name]} />
    </svg>
  )
}

export function NewBotDialog({onClose, onCreate}: {onClose?: () => void; onCreate?: CreateBot}) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  // Barkpark did not say whether the bot was made: the line says so as it is, and Create stays off
  // while this dialog is open, so no second bot is made blind.
  const [unsure, setUnsure] = useState(false)
  // A record write that got no answer may have saved the bot: its id, kept while this dialog is open
  // so every later Create finishes that same bot and never leaves its record off the list.
  const [retry, setRetry] = useState<string | undefined>()
  const create = async () => {
    if (!onCreate || creating || unsure || !name.trim()) return
    setCreating(true)
    setFailed(null)
    try {
      await onCreate({name: name.trim(), shape, colour, ...(retry && {retry})})
      onClose?.()
    } catch (e) {
      const why = (e as Error).message
      if (e instanceof CreateRetry) setRetry(e.retry)
      if (why.includes(CREATE_UNSURE)) setUnsure(true)
      setFailed(e instanceof CreateRetry ? why : why.includes(CREATE_UNSURE) ? CREATE_UNSURE : `The bot was not made: ${why}`)
      setCreating(false)
    }
  }
  const [shape, setShape] = useState('hex')
  const [colour, setColour] = useState('Blue')
  const fill = colours.find(([c]) => c === colour)?.[1]
  return (
    <>
      <div className="scrim" />
      <div role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="new-bot-title" className="dialog new-bot">
        <button aria-label="Close dialog" className="dialog-close" onClick={onClose}>
          <Icon d="M4 4l8 8M12 4l-8 8" />
        </button>
        <div className="dialog-head">
          <h2 id="new-bot-title">Create new Bot</h2>
        </div>
        <div className="dialog-body">
          <div className="new-bot-form">
            <span className="new-bot-preview" style={{color: fill}}>
              <Shape name={shape} size={96} />
            </span>
            <input aria-label="Bot name" className="new-bot-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            <CharacterLooks shape={shape} colour={colour} onShape={setShape} onColour={setColour} />
          </div>
        </div>
        <div className="dialog-foot">
          <button className="pill" onClick={onClose}>
            <span style={fit('Cancel')}>Cancel</span>
          </button>
          {failed && <span className="new-bot-failed" role="alert">{failed}</span>}
          <button className="pill primary" disabled={!name.trim() || creating || unsure} onClick={() => void create()}>
            <span style={fit(creating ? 'Creating…' : 'Create')}>{creating ? 'Creating…' : 'Create'}</span>
          </button>
        </div>
      </div>
    </>
  )
}

// The 13 shapes and 11 colours, shared by Create new Bot and the avatar editor (oracle-edit-avatar):
// both lay them out the same way, rows of 5, 5, 3 and 6, 5.
export function CharacterLooks({
  shape,
  colour,
  onShape,
  onColour,
}: {
  shape: string
  colour: string
  onShape: (s: string) => void
  onColour: (c: string) => void
}) {
  return (
    <div className="new-bot-looks">
      <div aria-label="Character shape" className="shapes">
        {shapeRows.map((row) => (
          <div key={row[0]} className="shape-row">
            {row.map((s) => (
              <button key={s} aria-label={`${s} character shape`} aria-pressed={s === shape} className="shape-btn" onClick={() => onShape(s)}>
                <span>
                  <Shape name={s} size={36} />
                </span>
                {s === shape && <span className="shape-on" />}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div aria-label="Character color" className="swatches">
        {colours.map(([c, rgb]) => (
          <button key={c} aria-label={`${c} character color`} aria-pressed={c === colour} className="swatch" onClick={() => onColour(c)}>
            <span style={{background: rgb}} />
          </button>
        ))}
      </div>
    </div>
  )
}
