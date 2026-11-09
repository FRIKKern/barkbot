// Small pieces shared by the panes. The bot's face is a plain stand-in (O2), never the oracle's art.
import type {ReactNode} from 'react'
import {Icon} from './Composer'

// Words where the stand-in face (SF Pro, item F6) runs more than Gate A's 1 pt off the oracle's
// face carry their own tracking, so the box matches. Width gap measured in
// fixtures/states/oracle-turn-1040.json, divided over the word's characters.
const FIT: Record<string, string> = {
  "Bot's computer": '0.081px', // 1.6 pt too wide at 0.195px
  Speed: '0.435px', // 1.2 pt too narrow at 0.195px
  '1x': '-0.68px', // 1.2 pt too wide at -0.08px
}
export const fit = (word: string) => (FIT[word] ? {letterSpacing: FIT[word]} : undefined)

export function Section({title, action, children}: {title: string; action?: ReactNode; children: ReactNode}) {
  return (
    <section className="section">
      <div className="section-title">
        <span>{title}</span>
        {action}
      </div>
      <ul className="card">{children}</ul>
    </section>
  )
}

export function Row({icon, label}: {icon: ReactNode; label: string}) {
  return (
    <li>
      <button className="row">
        <span className="row-icon">{icon}</span>
        <span className="row-label">
          <span>{label}</span>
        </span>
        <span className="row-chevron">
          <Icon d="M6 4l4 4-4 4" />
        </span>
      </button>
    </li>
  )
}

// A voice-chat picker row. `open` while its list is up (Scene.overlay names it); the value is the
// scene's voice setting.
export function Pick({label, value, open = false}: {label: string; value: string; open?: boolean}) {
  return (
    <li className="pick">
      <span className="pick-label">
        <span style={fit(label)}>{label}</span>
      </span>
      <button role="combobox" aria-expanded={open} aria-label={label} className="pick-value">
        <span className="pick-text">
          <span style={fit(value)}>{value}</span>
        </span>
        <Icon d="M4.5 6.5L8 10l3.5-3.5" />
      </button>
    </li>
  )
}

// The bot's face: a plain tilted rounded square (O2 stand-in for the oracle's mascot).
export function Face({size}: {size: number}) {
  return <span className="face" style={{width: size, height: size * 0.88}} />
}
