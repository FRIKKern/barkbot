// Create New Bot (fixtures/states/oracle-new-bot-dialog.json): 440 x 579, centred over a 70%
// black scrim. A preview of the character, its name, 13 shapes, 11 colours; Create stays disabled
// until the bot has a name. The shapes are plain geometric stand-ins drawn here, never the
// oracle's character art (O2). Create does nothing yet: making a bot is its own item (0005).
import {useState} from 'react'
import {Icon} from '../Composer'
import {colours, shapeRows} from './data'
import {fit} from '../parts'

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

export function NewBotDialog({onClose}: {onClose?: () => void}) {
  const [name, setName] = useState('')
  const [shape, setShape] = useState('hex')
  const [colour, setColour] = useState('Blue')
  const fill = colours.find(([c]) => c === colour)?.[1]
  return (
    <>
      <div className="scrim" />
      <div role="dialog" aria-modal="true" aria-labelledby="new-bot-title" className="dialog new-bot">
        <button aria-label="Close dialog" className="dialog-close" onClick={onClose}>
          <Icon d="M4 4l8 8M12 4l-8 8" />
        </button>
        <div className="dialog-head">
          <h2 id="new-bot-title">Create New Bot</h2>
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
          <button className="pill primary" disabled={!name.trim()}>
            <span style={fit('Create')}>Create</span>
          </button>
        </div>
      </div>
    </>
  )
}

// The 13 shapes and 11 colours, shared by Create New Bot and the avatar editor (oracle-edit-avatar):
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
