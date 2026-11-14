// The three panes: rail, conversation, details. Sizes and colours come from the captured
// oracle state fixtures/states/oracle-turn-1040.json (see styles.css). The bots' faces are
// plain stand-ins of the same size (O2): never the oracle's mascot art.
import {useEffect, useMemo, useRef, useState, type ReactNode} from 'react'
import {Composer, Icon, placeholderFor} from './Composer'
import {Rail} from './Rail'
import {Details} from './Details'
import {Face} from './parts'
import {Overlay} from './overlays'
import {Transcript, fromScene, type SceneRow} from './Transcript'

export type Scene = {
  bots: {name: string; main?: boolean}[]
  active?: string
  panelOpen: boolean
  computer?: string
  voice?: {voice: string; speed: string; language: string}
  tab?: 'activity' | 'library'
  /** Each bot's last message, shown in its chat preview on hover. Placeholder text in scenes (O2). */
  previews?: Record<string, string>
  /** An open menu, picker or dialog, by name (components/overlays). */
  overlay?: string
  /** The conversation on screen, as lengths (gate/transcripts.ts); `time` shows its time row. */
  transcript?: {bubbles: SceneRow[]; time?: string}
}

// The scene is where the page starts; what the person does from there (panel, tab, the bot they
// pick in the rail) is held here, so the live page and the gate share one behaviour.
// `onPickBot` tells the page which bot is now active, so it can load that bot's conversation.
// `onRenameBot` tells it a bot's new name (for a composer the page passes in, and for saving it).
// A window under 800 closes the details panel by itself, and widening it again leaves it closed
// (measured on the oracle: 790 closed, 800 open; oracle-main-790, -800).
const NARROW = '(max-width: 799.98px)'

// `workingBots`: the bots whose run is in progress, from the chat stream (the same signal as the
// transcript's working row; both flip at the same ms in traces say-hi, say-hi-2, storage).
// `unreadBots`: bots the page itself marks unread; Shell adds its own by the oracle's rule
// (useUnread below).
export function Shell({scene: start, transcript, composer, onPickBot, onRenameBot, workingBots = [], unreadBots = []}: {scene: Scene; transcript?: ReactNode; composer?: ReactNode; onPickBot?: (name: string) => void; onRenameBot?: (bot: string, name: string) => void; workingBots?: string[]; unreadBots?: string[]}) {
  const [panelOpen, setPanelOpen] = useState(start.panelOpen)
  const [picked, setPicked] = useState<string | undefined>(undefined)
  // The overlay that is up, whether the scene holds it or a click opened it (Overlay's
  // onOpenChange), so its trigger in the panel shows open (Pick's aria-expanded, the pencil).
  const [opened, setOpened] = useState<string | null>(null)
  // A page that opens already narrow shows the panel closed at once, without the 300 ms close.
  const [instant, setInstant] = useState(false)
  useEffect(() => {
    const narrow = window.matchMedia(NARROW)
    if (narrow.matches) {
      setInstant(true)
      setPanelOpen(false)
      requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)))
    }
    const onChange = (e: MediaQueryListEvent) => e.matches && setPanelOpen(false)
    narrow.addEventListener('change', onChange)
    return () => narrow.removeEventListener('change', onChange)
  }, [])
  const scene: Scene = {...start, panelOpen, active: picked ?? start.active}
  const talk = useMemo(() => (start.transcript ? fromScene(start.transcript.bubbles) : null), [start.transcript])
  const unread = useUnread(workingBots)
  const active = scene.active ?? ''
  // A bot's name as the person renamed it in the details panel. On Enter the header pill, the
  // rail tile's label and the composer's "Message <name>" all follow in the same frame
  // (traces/2026-11-09-rename.json and the lead's re-run on oracle/focus-bot-name).
  const [names, setNames] = useState<Record<string, string>>({})
  const shown = names[active] ?? active
  const pick = (name: string) => {
    setPicked(name)
    onPickBot?.(name)
  }
  return (
    <div className="app" data-panel={panelOpen ? 'open' : 'closed'} data-instant={instant || undefined}>
      <Rail scene={scene} onPick={pick} working={workingBots} unread={[...new Set([...unreadBots, ...unread])]} names={names} />

      {/* Focusable like the oracle's transcript (role=log, tabindex 0): a click on it takes focus,
          which is where a click away from the Bot name field leaves it (rename trace). */}
      <main className="convo" aria-label="Conversation transcript" tabIndex={0}>
        <header className="convo-head">
          {active && (
            <button className="bot-pill" aria-label="View conversation details" aria-expanded={panelOpen} onClick={() => setPanelOpen((o) => !o)}>
              <Face size={18} />
              <span role="heading" aria-level={1}>
                {shown}
              </span>
            </button>
          )}
          <button className="share" aria-label="Share">
            <span className="share-label">Share</span>
            <span className="share-icon">
              <Icon d="M8 10V2.5M5 5.5l3-3 3 3M3 9v3.5h10V9" />
            </span>
          </button>
        </header>
        {transcript ??
          (talk ? (
            <Transcript bot={active} startedAt={scene.transcript?.time ?? null} bubbles={talk.bubbles} working={null} error={null} ask={talk.ask} />
          ) : (
            <div className="transcript" />
          ))}
        {composer ?? <Composer placeholder={placeholderFor(shown, talk?.ask)} />}
      </main>

      <Details scene={{...scene, overlay: opened ?? scene.overlay}} name={shown} onRename={(n) => {
        setNames((m) => ({...m, [active]: n}))
        onRenameBot?.(active, n)
      }} onClose={() => setPanelOpen(false)} />
      <Overlay name={scene.overlay} scene={scene} onOpenChange={setOpened} />
    </div>
  )
}

// The unread dot, by the rule in traces/2026-11-09-unread.json (0.79.3): a reply that lands while
// the window does not have focus marks its bot unread, even the bot that is open; the window
// getting focus clears every dot at once, whatever is open (Settings was). A reply that lands
// in a focused window marks nothing (traces/2026-11-09-long-answer.json: no rail change).
// A reply landing is a bot leaving `workingBots`.
function useUnread(working: string[]) {
  const [unread, setUnread] = useState<string[]>([])
  const was = useRef<string[]>([])
  const key = working.join('\n')
  useEffect(() => {
    const now = key ? key.split('\n') : []
    const replied = was.current.filter((b) => !now.includes(b))
    was.current = now
    if (replied.length && !document.hasFocus()) setUnread((u) => [...new Set([...u, ...replied])])
  }, [key])
  useEffect(() => {
    const clear = () => setUnread([])
    window.addEventListener('focus', clear)
    return () => window.removeEventListener('focus', clear)
  }, [])
  return unread
}
