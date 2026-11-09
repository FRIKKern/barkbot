// The rail: the main bot, the pinned bots, New Bot, Connect apps, the account (fixture rail, 0..88).
import type {ReactNode} from 'react'
import type {Scene} from './Shell'
import {Icon} from './Composer'
import {Face} from './parts'
import {Preview, Tooltip, useHover} from './tips'

// A working bot's tile says so in its name, last: "Oracle, Working", "Oracle, Unread activity,
// Working" (traces say-hi, storage). Nothing else on the tile changes while it works.
export function Rail({scene, onPick, working = []}: {scene: Scene; onPick?: (name: string) => void; working?: string[]}) {
  const busy = (name: string, label: string) => (working.includes(name) ? `${label}, Working` : label)
  const main = scene.bots.find((b) => b.main)
  const others = scene.bots.filter((b) => !b.main)
  const active = scene.active ?? ''
  return (
    <aside className="rail" aria-label="Bots">
      <div className="rail-main">
        {main && (
          <Tile name={main.name} label={busy(main.name, `${main.name}, Main Bot`)} current={main.name === active} line={scene.previews?.[main.name]} onPick={onPick}>
            <span className="face face-main" />
            <span className="badge" role="img" aria-label="Main Bot" />
          </Tile>
        )}
      </div>
      <div className="rail-rule" />
      <div className="rail-list" role="list" aria-label="Pinned Bots">
        {others.map((b) => (
          <div role="listitem" key={b.name}>
            <Tile name={b.name} label={busy(b.name, b.name)} current={b.name === active} line={scene.previews?.[b.name]} onPick={onPick}>
              <Face size={34} />
            </Tile>
          </div>
        ))}
      </div>
      <div className="rail-foot">
        <div className="rail-slot">
          <IconTip label="New Bot">
            <Icon d="M8 2.5v11M2.5 8h11" />
          </IconTip>
        </div>
        <div className="rail-slot">
          <IconTip label="Connect apps">
            <Icon d="M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM11.5 9v5M9 11.5h5" />
          </IconTip>
        </div>
        <div className="rail-account">
          <button className="rail-tile rail-me" aria-label="Open account menu">
            <span className="me" />
          </button>
        </div>
      </div>
    </aside>
  )
}

// A bot's tile; the pointer on it brings up the bot's chat preview (oracle-hover-bot-tile-2).
function Tile({name, label, current, line, onPick, children}: {name: string; label: string; current?: boolean; line?: string; onPick?: (name: string) => void; children: ReactNode}) {
  const h = useHover()
  return (
    <>
      <button className="rail-tile" aria-label={label} aria-current={current ? 'page' : undefined} onClick={() => onPick?.(name)} {...h.on}>
        {children}
      </button>
      <Preview box={h.box} name={name} line={line ?? ''} />
    </>
  )
}

// New Bot, Connect apps: a round icon whose name shows above it on hover (oracle-hover-new-bot, -connect-apps).
function IconTip({label, children}: {label: string; children: ReactNode}) {
  const h = useHover()
  return (
    <>
      <button className="rail-icon" aria-label={label} {...h.on}>
        {children}
      </button>
      <Tooltip box={h.box}>{label}</Tooltip>
    </>
  )
}
