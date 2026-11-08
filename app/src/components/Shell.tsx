// The three panes: rail, conversation, details. Sizes and colours come from the captured
// oracle state fixtures/states/oracle-turn-1040.json (see styles.css). The bots' faces are
// plain stand-ins of the same size (O2): never the oracle's mascot art.
import type {ReactNode} from 'react'

export type Scene = {
  bots: {name: string; main?: boolean}[]
  active?: string
  panelOpen: boolean
  computer?: string
  voice?: {voice: string; speed: string; language: string}
}

export function Shell({scene}: {scene: Scene}) {
  const main = scene.bots.find((b) => b.main)
  const others = scene.bots.filter((b) => !b.main)
  const active = scene.active ?? ''
  return (
    <div className="app" data-panel={scene.panelOpen ? 'open' : 'closed'}>
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
        <div className="transcript" />
        <div className="composer-wrap">
          <div className="composer">
            <button className="round" aria-label="Composer actions">
              <Icon d="M8 3v10M3 8h10" />
            </button>
            <div className="prompt" role="textbox" aria-label="Prompt" aria-multiline="true" contentEditable suppressContentEditableWarning data-placeholder={active ? `Message ${active}` : 'Message'} />
            <button className="round" aria-label="Start voice input">
              <Icon d="M8 2.5a2 2 0 0 1 2 2v3a2 2 0 0 1-4 0v-3a2 2 0 0 1 2-2zM4.5 7.5a3.5 3.5 0 0 0 7 0M8 11v2" />
            </button>
            <button className="round voice" aria-label="Start voice chat">
              <Icon d="M3 6.5v3M5.5 4.5v7M8 3v10M10.5 5v6M13 6.5v3" />
            </button>
          </div>
        </div>
      </main>

      {scene.panelOpen && (
        <aside className="details" aria-label="Conversation details">
          <header className="details-head">
            <button className="close" aria-label="Close">
              <Icon d="M4 4l8 8M12 4l-8 8" />
            </button>
          </header>
          <div className="details-body">
            <div className="who">
              <button className="who-face" aria-label="Edit Bot avatar">
                <Face size={52} />
              </button>
              <input className="who-name" aria-label="Bot name" defaultValue={active} />
            </div>
            <div className="tabs-row">
              <div role="tablist" aria-label="Conversation details" className="tabs">
                <button role="tab" aria-selected="true" className="tab">
                  Activity
                </button>
                <button role="tab" aria-selected="false" className="tab">
                  Library
                </button>
              </div>
            </div>
            <div role="tabpanel" className="tabpanel">
              <Section title="Suggested">
                <Row icon={<Icon d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" />} label="Add to Slack" />
                <Row icon={<Icon d="M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM8 5v3l2 1.25" />} label="Create a routine" />
              </Section>
              {scene.computer && (
                <Section title="Computer">
                  <li>
                    <button className="computer">
                      <span className="computer-text">
                        <span className="computer-name">
                          <bdi>Bot's computer</bdi>
                        </span>
                        <span className="computer-state">
                          <bdi>{scene.computer}</bdi>
                        </span>
                      </span>
                      <span className="thumb">
                        <Face size={20} />
                      </span>
                    </button>
                  </li>
                </Section>
              )}
              {scene.voice && (
                <Section title="Voice chat">
                  <Pick label="Voice" value={scene.voice.voice} />
                  <Pick label="Speed" value={scene.voice.speed} />
                  <Pick label="Language" value={scene.voice.language} />
                </Section>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}

function Section({title, children}: {title: string; children: ReactNode}) {
  return (
    <section className="section">
      <div className="section-title">
        <span>{title}</span>
      </div>
      <ul className="card">{children}</ul>
    </section>
  )
}

function Row({icon, label}: {icon: ReactNode; label: string}) {
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

function Pick({label, value}: {label: string; value: string}) {
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
function Face({size}: {size: number}) {
  return <span className="face" style={{width: size, height: size * 0.88}} />
}

function Icon({d}: {d: string}) {
  return (
    <svg className="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
