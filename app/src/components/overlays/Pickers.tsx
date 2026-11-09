// The Voice chat card's three pickers. Each opens 4 pt above its row's button, right edges
// aligned (fixtures/states/oracle-{voice,speed,language}-picker.json); a long list scrolls inside
// 360 pt with a 7 pt gutter. The picked option carries a check.
import {useState} from 'react'
import {Icon} from '../Composer'
import {languages, markedVoices, speeds, voices} from './data'

const check = <Icon d="M3.5 8.5l3 3 6-7" />

type Props = {picked?: string; onPick?: () => void}

function Picker({
  kind,
  label,
  options,
  picked,
  preview,
  onPick,
}: {
  kind: string
  label: string
  options: string[]
  picked: string
  preview?: boolean
  onPick?: () => void
}) {
  const [value, setValue] = useState(picked)
  return (
    <div role="presentation" className={`pop picker ${kind}`}>
      <div className="picker-scroll">
        <div role="listbox" aria-label={label} className="listbox">
          {options.map((o) => (
            <div
              key={o}
              role="option"
              aria-selected={o === value}
              tabIndex={-1}
              className="option"
              onClick={() => {
                setValue(o)
                onPick?.()
              }}
            >
              <span className="option-text">
                <div>
                  <span>{o}</span>
                </div>
              </span>
              {preview ? (
                <span className="option-trail">
                  {markedVoices.has(o) && (
                    <span className="option-mark">
                      <span role="img" aria-hidden="true" />
                    </span>
                  )}
                  <button aria-label={`Play the ${o} preview`} className="play" onClick={(e) => e.stopPropagation()}>
                    <span>
                      <Icon d="M5.5 3.5v9l7-4.5z" />
                    </span>
                  </button>
                  {o === value && <span className="option-check">{check}</span>}
                </span>
              ) : (
                o === value && <span className="option-check">{check}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Each opens on the oracle's captured pick unless told otherwise.
export const VoicePicker = ({picked = 'Helix', onPick}: Props) => (
  <Picker kind="voice-picker" label="Voice" options={voices} picked={picked} preview onPick={onPick} />
)
export const SpeedPicker = ({picked = '1x', onPick}: Props) => <Picker kind="speed-picker" label="Speed" options={speeds} picked={picked} onPick={onPick} />
export const LanguagePicker = ({picked = 'Auto-detect', onPick}: Props) => (
  <Picker kind="language-picker" label="Language" options={languages} picked={picked} onPick={onPick} />
)
