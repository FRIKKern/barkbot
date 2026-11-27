// The Voice chat card's two pickers (Grok 1.2.3, decision 0010; the Language list's size Grok Bot 1.3.0, decision 0011). Each opens 4 pt above its row's
// button, right edges aligned (fixtures/states/oracle-{voice,language}-picker.json).
// Language: a list that scrolls inside 360 pt with a 7 pt gutter; the picked option carries a check.
// Voice: a dialog, the Speed slider over a grid of voices (VoiceDialog.tsx).
import {useState} from 'react'
import {Icon} from '../Composer'
import {languages} from './data'
import {LANGUAGE, fit} from './fit'

const check = <Icon d="M3.5 8.5l3 3 6-7" />

// `onPick` hears the option picked; the overlay host closes the picker and the panel's row takes it.
type Props = {picked?: string; onPick?: (value: string) => void}

function Picker({
  kind,
  label,
  options,
  picked,
  onPick,
}: {
  kind: string
  label: string
  options: string[]
  picked: string
  onPick?: (value: string) => void
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
                onPick?.(o)
              }}
            >
              <span className="option-text">
                <div>
                  <span style={fit(LANGUAGE, o)}>{o}</span>
                </div>
              </span>
              {o === value && <span className="option-check">{check}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// It opens on the oracle's captured pick unless told otherwise.
export const LanguagePicker = ({picked = 'Auto-detect', onPick}: Props) => (
  <Picker kind="language-picker" label="Language" options={languages} picked={picked} onPick={onPick} />
)
