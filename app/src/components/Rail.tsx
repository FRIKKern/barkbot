// The rail: the main bot, the pinned bots, New Bot, Connect apps, the account (fixture rail, 0..88).
import type {Scene} from './Shell'
import {Icon} from './Composer'
import {Face} from './parts'

export function Rail({scene}: {scene: Scene}) {
  const main = scene.bots.find((b) => b.main)
  const others = scene.bots.filter((b) => !b.main)
  const active = scene.active ?? ''
  return (
    <aside className="rail" aria-label="Bots">
      <div className="rail-main">
        {main && (
          <button className="rail-tile" aria-label={`${main.name}, Main Bot`}>
            <span className="face face-main" />
            <span className="badge" role="img" aria-label="Main Bot" />
          </button>
        )}
      </div>
      <div className="rail-rule" />
      <div className="rail-list" role="list" aria-label="Pinned Bots">
        {others.map((b) => (
          <div role="listitem" key={b.name}>
            <button className="rail-tile" aria-label={b.name} aria-current={b.name === active ? 'page' : undefined}>
              <Face size={34} />
            </button>
          </div>
        ))}
      </div>
      <div className="rail-foot">
        <div className="rail-slot">
          <button className="rail-icon" aria-label="New Bot">
            <Icon d="M8 2.5v11M2.5 8h11" />
          </button>
        </div>
        <div className="rail-slot">
          <button className="rail-icon" aria-label="Connect apps">
            <Icon d="M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM11.5 9v5M9 11.5h5" />
          </button>
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
