// Small pieces shared by the panes. The bot's face is a plain stand-in (O2), never the oracle's art.
import type {ReactNode} from 'react'
import {Icon} from './Composer'

export function Section({title, children}: {title: string; children: ReactNode}) {
  return (
    <section className="section">
      <div className="section-title">
        <span>{title}</span>
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

export function Pick({label, value}: {label: string; value: string}) {
  return (
    <li className="pick">
      <span className="pick-label">
        <span>{label}</span>
      </span>
      <button role="combobox" aria-expanded="false" aria-label={label} className="pick-value">
        <span className="pick-text">
          <span>{value}</span>
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
