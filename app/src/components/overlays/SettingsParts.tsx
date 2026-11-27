// The pieces every Settings page is built from (fixtures/states/oracle-settings*.json, Grok 1.2.3).
// Long descriptions are kept as lengths in the fixtures, so they are placeholders of the captured
// size: a wrapped one fills its row (lines: 2), a one-line one has its measured width.
import {createContext, useContext, useState, type ReactNode} from 'react'
import {Icon} from '../Composer'
import {SETTINGS, fit} from './fit'

export const x = <Icon d="M4 4l8 8M12 4l-8 8" />
export const chevronDown = <Icon d="M4.5 6.5L8 10l3.5-3.5" />
export const info = <Icon d="M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM8 7.25V11M8 5v.25" />
export const Bar = ({w, h = 10}: {w: number | string; h?: number}) => <span className="ph" style={{width: w, height: h}} />

export type Desc = {lines: 2} | {width: number}

export function Description({desc}: {desc: Desc}) {
  const two = 'lines' in desc
  return (
    <span className={`set-desc${two ? ' two' : ''}`}>
      {two ? (
        <>
          <Bar w="100%" />
          <Bar w="70%" />
        </>
      ) : (
        <Bar w={desc.width} />
      )}
    </span>
  )
}

export function Label({text, nested, children}: {text: string; nested?: boolean; children?: ReactNode}) {
  return (
    <div className="set-label">
      {nested ? (
        <span className="set-nested">
          <span style={fit(SETTINGS, text)}>{text}</span>
        </span>
      ) : (
        <span style={fit(SETTINGS, text)}>
          {text}
          {children}
        </span>
      )}
      <span className="set-info">{info}</span>
    </div>
  )
}

// A row with a label (and its info mark), a description under it and an optional control at its right.
export function DescRow({label, desc, nested, children}: {label: string; desc: Desc; nested?: boolean; children?: ReactNode}) {
  return (
    <div className={`set-drow${'lines' in desc ? ' fill' : ''}`}>
      <div>
        <Label text={label} nested={nested} />
        <Description desc={desc} />
      </div>
      {children && <div>{children}</div>}
    </div>
  )
}

// 1.2.3's plain row: 56 tall, the label with no info mark over a one-line description
// (General's Send with ⌘↵, Permissions' App permissions).
export function PlainRow({label, width, children}: {label: string; width: number; children: ReactNode}) {
  return (
    <div className="set-prow">
      <div>
        <div className="set-plabel">
          <span style={fit(SETTINGS, label)}>{label}</span>
        </div>
        <Description desc={{width}} />
      </div>
      <div>{children}</div>
    </div>
  )
}

// General's rows: a label with its info mark, the control at the right.
export function SettingRow({label, short, children}: {label: string; short?: boolean; children: ReactNode}) {
  return (
    <div className={`set-row${short ? ' short' : ''}`}>
      <div>
        <Label text={label} />
      </div>
      <div>{children}</div>
    </div>
  )
}

export function Select({label, value}: {label: string; value: string}) {
  return (
    <button role="combobox" aria-expanded="false" aria-label={label} className="set-select">
      <span>
        <span style={fit(SETTINGS, value)}>{value}</span>
      </span>
      {chevronDown}
    </button>
  )
}

// The switches' positions, kept by the dialog (Settings) so a flipped switch stays flipped when its
// page is left and opened again (a page's own state goes with the page on a tab change). Without a
// dialog around it a switch keeps its own.
export const SwitchState = createContext<{flipped: Record<string, boolean>; flip: (label: string, on: boolean) => void} | null>(null)

export function Switch({label, on = true}: {label: string; on?: boolean}) {
  const kept = useContext(SwitchState)
  const [own, setOwn] = useState(on)
  const checked = kept ? (kept.flipped[label] ?? on) : own
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className="set-switch" onClick={() => (kept ? kept.flip(label, !checked) : setOwn(!checked))}>
      <span />
    </button>
  )
}

// A grey pill button: Check for updates, Update, Open apps. Look only: none acts yet (0005).
export function PillButton({text, label}: {text: string; label?: string}) {
  return (
    <button aria-label={label} className="pill set-pill">
      <span style={fit(SETTINGS, text)}>{text}</span>
    </button>
  )
}

export function GroupHead({title}: {title: string}) {
  return (
    <div className="set-group-head">
      <h3 style={fit(SETTINGS, title)}>{title}</h3>
      <span className="set-info">{info}</span>
    </div>
  )
}

export function Group({title, children}: {title: string; children: ReactNode}) {
  return (
    <section>
      <GroupHead title={title} />
      <div className="set-card">{children}</div>
    </section>
  )
}
