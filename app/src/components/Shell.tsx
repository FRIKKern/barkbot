// The three panes: rail, conversation, details. Sizes and colours come from the captured
// oracle state fixtures/states/oracle-turn-1040.json (see styles.css). The bots' faces are
// plain stand-ins of the same size (O2): never the oracle's mascot art.
import {useEffect, useState, type ReactNode} from 'react'
import {Composer, Icon} from './Composer'
import {Rail} from './Rail'
import {Details} from './Details'
import {Face} from './parts'
import {Overlay} from './overlays'
import {Transcript, fromLengths, type SceneBubble} from './Transcript'

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
  transcript?: {bubbles: SceneBubble[]; time?: string}
}

// The scene is where the page starts; what the person does from there (panel, tab, the bot they
// pick in the rail) is held here, so the live page and the gate share one behaviour.
// `onPickBot` tells the page which bot is now active, so it can load that bot's conversation.
// A narrow window closes the details panel by itself, and widening it again leaves it closed
// (oracle-main-720: closed; oracle-main-880: open). The line is bracketed by those two captures,
// not measured: it sits half-way, below 800.
const NARROW = '(max-width: 799.98px)'

export function Shell({scene: start, transcript, composer, onPickBot}: {scene: Scene; transcript?: ReactNode; composer?: ReactNode; onPickBot?: (name: string) => void}) {
  const [panelOpen, setPanelOpen] = useState(start.panelOpen)
  const [picked, setPicked] = useState<string | undefined>(undefined)
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
  const active = scene.active ?? ''
  const pick = (name: string) => {
    setPicked(name)
    onPickBot?.(name)
  }
  return (
    <div className="app" data-panel={panelOpen ? 'open' : 'closed'} data-instant={instant || undefined}>
      <Rail scene={scene} onPick={pick} />

      <main className="convo" aria-label="Conversation transcript">
        <header className="convo-head">
          {active && (
            <button className="bot-pill" aria-label="View conversation details" aria-expanded={panelOpen} onClick={() => setPanelOpen((o) => !o)}>
              <Face size={18} />
              <span role="heading" aria-level={1}>
                {active}
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
          (scene.transcript ? (
            <Transcript bot={active} startedAt={scene.transcript.time ?? null} bubbles={fromLengths(scene.transcript.bubbles)} working={null} error={null} />
          ) : (
            <div className="transcript" />
          ))}
        {composer ?? <Composer placeholder={active ? `Message ${active}` : 'Message'} />}
      </main>

      <Details scene={scene} onClose={() => setPanelOpen(false)} />
      <Overlay name={scene.overlay} scene={scene} />
    </div>
  )
}
