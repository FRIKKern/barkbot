// The rail: the main bot, the pinned bots, New Bot, Connect apps, the account (fixture rail, 0..88).
import {useEffect, useState, type ReactNode} from 'react'
import type {Scene} from './Shell'
import {Icon} from './Composer'
import {Face} from './parts'
import {Preview, Tooltip, useHover} from './tips'

// A working bot's tile says so in its name, last: "Oracle, Working", "Oracle, Unread activity,
// Working" (traces say-hi, storage). Nothing else on the tile changes while it works.
// Not for the bot that is open: on 0.79.3 its tile never says Working (traces/2026-11-09-long-
// answer.json, no rail change in the whole turn). UNVERIFIED on 0.79.3 for a bot that is not
// open: that label comes from the 0.79.2 traces of 2026-11-08 and waits for a re-record.
// A bot with unread activity gets a dot on its face and ", Unread activity" in its name
// (trace say-hi-2 at 5071.6 ms). Where "Main Bot" goes in that order is not captured; it stays first.
// Every bot is known by its id: picking, the current tile, Working and Unread. `names`: bots the
// person renamed (details panel), by id, shown in place of their own name (rename trace: the tile
// label follows on Enter). Two bots may share a name and stay two bots.
export function Rail({scene, onPick, working = [], unread = [], names = {}}: {scene: Scene; onPick?: (id: string) => void; working?: string[]; unread?: string[]; names?: Record<string, string>}) {
  const shown = (b: {id: string; name: string}) => names[b.id] ?? b.name
  const active = scene.active ?? ''
  const busy = (id: string, label: string) => [label, unread.includes(id) && 'Unread activity', working.includes(id) && id !== active && 'Working'].filter(Boolean).join(', ')
  const main = scene.bots.find((b) => b.main)
  const others = scene.bots.filter((b) => !b.main)
  const held = useCommandHeld()
  // ⌘1 on the main bot, ⌘2 on the first pinned bot, and so on (trace say-hi; only two bots captured).
  const hint = (i: number) => (held ? `⌘${i + 1}` : undefined)
  return (
    <aside className="rail" aria-label="Bots">
      <div className="rail-main">
        {main && (
          <Tile id={main.id} shown={shown(main)} label={busy(main.id, `${shown(main)}, Main Bot`)} current={main.id === active} line={scene.previews?.[main.id]} onPick={onPick} unread={unread.includes(main.id)} hint={hint(0)}>
            <span className="face face-main" />
          </Tile>
        )}
      </div>
      <div className="rail-rule" />
      <div className="rail-list" role="list" aria-label="Pinned Bots">
        {others.map((b, i) => (
          <div role="listitem" key={b.id}>
            <Tile id={b.id} shown={shown(b)} label={busy(b.id, shown(b))} current={b.id === active} line={scene.previews?.[b.id]} onPick={onPick} unread={unread.includes(b.id)} hint={hint(main ? i + 1 : i)}>
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
function Tile({id, shown, label, current, line, onPick, unread, hint, children}: {id: string; shown: string; label: string; current?: boolean; line?: string; onPick?: (id: string) => void; unread?: boolean; hint?: string; children: ReactNode}) {
  const h = useHover()
  return (
    <>
      <button className="rail-tile" aria-label={label} aria-current={current ? 'page' : undefined} onClick={() => onPick?.(id)} {...h.on}>
        {children}
        {unread && <span className="unread" role="status" aria-label="Unread activity" />}
        {hint && <span className="rail-hint">{hint}</span>}
      </button>
      <Preview box={h.box} name={shown} line={line ?? ''} />
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

// While ⌘ is held the bot tiles show their shortcut; letting go, or the window losing focus, hides
// them in the same frame (trace say-hi: added at 7129.1 and 9990.2 ms, removed at 8752.9 and
// 11214.1, opacity 1 from the first sample, no fade). Only the hint: ⌘1/⌘2 themselves are not
// built, since the oracle's switching was never captured.
function useCommandHeld() {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    const down = (e: KeyboardEvent) => e.key === 'Meta' && setHeld(true)
    const up = (e: KeyboardEvent) => e.key === 'Meta' && setHeld(false)
    const off = () => setHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', off)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', off)
    }
  }, [])
  return held
}
