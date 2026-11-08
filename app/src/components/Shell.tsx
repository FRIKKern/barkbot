// The three panes: rail, conversation, details. Sizes and colours come from the captured
// oracle state fixtures/states/oracle-turn-1040.json (see styles.css). The bots' faces are
// plain stand-ins of the same size (O2): never the oracle's mascot art.
import type {ReactNode} from 'react'
import {Composer} from './Composer'
import {Rail} from './Rail'
import {Details} from './Details'
import {Face} from './parts'

export type Scene = {
  bots: {name: string; main?: boolean}[]
  active?: string
  panelOpen: boolean
  computer?: string
  voice?: {voice: string; speed: string; language: string}
  tab?: 'activity' | 'library'
}

export function Shell({scene, transcript, composer}: {scene: Scene; transcript?: ReactNode; composer?: ReactNode}) {
  const active = scene.active ?? ''
  return (
    <div className="app" data-panel={scene.panelOpen ? 'open' : 'closed'}>
      <Rail scene={scene} />

      <main className="convo" aria-label="Conversation transcript">
        <header className="convo-head">
          {active && (
            <button className="bot-pill" aria-label="View conversation details" aria-expanded={scene.panelOpen}>
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

      {scene.panelOpen && <Details scene={scene} />}
    </div>
  )
}
