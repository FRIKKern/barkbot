// The Voice picker on Grok 1.2.3 (decision 0010): a dialog, 300 wide, its foot 4 pt above the
// Voice row's button and right edges aligned (fixtures/states/oracle-voice-picker.json). The Speed
// slider runs along its top; under it a grid of voices, two to a row, scrolls inside 268 pt and
// opens with the picked voice in its middle (Helix's row at 294.5, the grid's middle at 336.5).
// Every number is read from that capture and oracle-voice-picker-end.
//
// A pick changes the row at once (the Voice row reads "<voice> <speed>"). Not captured, so ours:
// whether a voice pick closes the dialog (here it stays open, as a radio group does), the slider's
// step (data.ts SPEED), and the keys inside the dialog beyond Escape.
import {useLayoutEffect, useRef, useState, type PointerEvent} from 'react'
import {Icon} from '../Composer'
import {fit} from '../parts'
import {SPEED, markedVoices, speedText, voices} from './data'

// The thumb is 20 wide; its left runs 0 .. track - 20 as the speed runs min .. max.
const THUMB = 20
const clamp = (n: number) => Math.min(SPEED.max, Math.max(SPEED.min, Math.round(n / SPEED.step) * SPEED.step))

type Props = {
  picked?: string
  speed?: number
  /** A voice picked: the row takes it. */
  onPick?: (voice: string) => void
  /** The slider moved: the row takes the new speed. */
  onSpeed?: (speed: number) => void
}

export function VoiceDialog({picked = 'Helix', speed: startSpeed = 1, onPick, onSpeed}: Props) {
  const [voice, setVoice] = useState(picked)
  const [speed, setSpeed] = useState(startSpeed)
  const grid = useRef<HTMLDivElement>(null)
  // Open with the picked voice's row in the middle of the grid.
  useLayoutEffect(() => {
    const g = grid.current
    const card = g?.querySelector<HTMLElement>('[role=radio][aria-checked=true]')?.parentElement
    if (g && card) g.scrollTop = card.offsetTop - (g.clientHeight - card.offsetHeight) / 2
  }, [])
  const setTo = (n: number) => {
    const next = Math.round(clamp(n) * 10) / 10
    if (next === speed) return
    setSpeed(next)
    onSpeed?.(next)
  }
  return (
    <div role="presentation" className="pop voice-picker">
      <div role="dialog" aria-label="Voice" className="voice-dialog">
        <div className="speed">
          <span className="speed-label" style={fit('Speed')}>
            Speed
          </span>
          <Slider value={speed} onChange={setTo} />
          <span className="speed-value">
            <span>
              {[...speedText(speed)].map((c, i) => (
                <span key={i}>
                  <span>{c}</span>
                </span>
              ))}
            </span>
          </span>
        </div>
        <div ref={grid} role="radiogroup" aria-label="Voice" className="voice-grid">
          {voices.map(([name, line]) => (
            <div key={name} className="voice">
              <button
                role="radio"
                aria-checked={name === voice}
                className="voice-card"
                onClick={() => {
                  setVoice(name)
                  if (name !== voice) onPick?.(name)
                }}
              >
                <span className="voice-name">{name}</span>
                <span className="voice-line">{line}</span>
              </button>
              <div className="voice-top">
                {markedVoices.has(name) && <span className="voice-mark" role="img" aria-hidden="true" />}
                {/* Plays nothing: there is no voice source (N4). */}
                <button aria-label={`Play the ${name} preview`} className="play">
                  <span>
                    <Icon d="M5.5 3.5v9l7-4.5z" />
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// The slider: a track (4% wash) filled in blue up to the thumb's right edge, and a 20 pt thumb with
// a 2 pt ring holding the range input itself (input 16 x 16, labelled Speed). Keys go to the input
// (arrows step it); a press or drag on the track moves the thumb under the pointer.
function Slider({value, onChange}: {value: number; onChange: (n: number) => void}) {
  const track = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const frac = (value - SPEED.min) / (SPEED.max - SPEED.min)
  const at = (e: PointerEvent<HTMLDivElement>) => {
    const r = track.current?.getBoundingClientRect()
    if (!r) return
    const f = Math.min(1, Math.max(0, (e.clientX - r.left - THUMB / 2) / (r.width - THUMB)))
    onChange(SPEED.min + f * (SPEED.max - SPEED.min))
  }
  return (
    <div role="group" className="slider">
      <div
        ref={track}
        className="slider-track"
        onPointerDown={(e) => {
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          input.current?.focus()
          at(e)
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && at(e)}
      >
        <div className="slider-wash">
          <span className="slider-fill" style={{width: `calc((100% - ${THUMB}px) * ${frac} + ${THUMB}px)`}} />
        </div>
        <div className="slider-thumb" style={{left: `calc((100% - ${THUMB}px) * ${frac})`}}>
          <input
            ref={input}
            type="range"
            aria-label="Speed"
            aria-valuetext={speedText(value)}
            min={SPEED.min}
            max={SPEED.max}
            step={SPEED.step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </div>
      </div>
    </div>
  )
}
