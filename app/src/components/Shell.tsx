// The three panes: rail, conversation, details. Sizes and colours come from the captured
// oracle state fixtures/states/oracle-turn-1040.json (see styles.css). The bots' faces are
// plain stand-ins of the same size (O2): never the oracle's mascot art.
import {useState, type ReactNode} from 'react'
import {Composer} from './Composer'
import {Rail} from './Rail'
import {Details} from './Details'
import {Face} from './parts'
import {Overlay} from './overlays'

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
}

// The scene is where the page starts; what the person does from there (panel, tab, the bot they
// pick in the rail) is held here, so the live page and the gate share one behaviour.
// `onPickBot` tells the page which bot is now active, so it can load that bot's conversation.
export function Shell({scene: start, transcript, composer, onPickBot}: {scene: Scene; transcript?: ReactNode; composer?: ReactNode; onPickBot?: (name: string) => void}) {
  const [panelOpen, setPanelOpen] = useState(start.panelOpen)
  const [picked, setPicked] = useState<string | undefined>(undefined)
  const scene: Scene = {...start, panelOpen, active: picked ?? start.active}
  const active = scene.active ?? ''
  const pick = (name: string) => {
    setPicked(name)
    onPickBot?.(name)
  }
  return (
    <div className="app" data-panel={panelOpen ? 'open' : 'closed'}>
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
            <span>Share</span>
          </button>
        </header>
        {transcript ?? <div className="transcript" />}
        {composer ?? <Composer placeholder={active ? `Message ${active}` : 'Message'} />}
      </main>

      <Details scene={scene} onClose={() => setPanelOpen(false)} />
      <Overlay name={scene.overlay} scene={scene} />
    </div>
  )
}
