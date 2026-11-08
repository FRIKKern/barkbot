// The details panel (aside "Conversation details", 720..1040): the bot, its tabs, and the
// Activity cards: Suggested, Computer, Voice chat. Library shows its empty state.
import type {Scene} from './Shell'
import {Icon} from './Composer'
import {Face, Pick, Row, Section} from './parts'

export function Details({scene}: {scene: Scene}) {
  const active = scene.active ?? ''
  const library = scene.tab === 'library'
  return (
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
            <button role="tab" aria-selected={!library} className="tab">
              Activity
            </button>
            <button role="tab" aria-selected={library} className="tab">
              Library
            </button>
          </div>
        </div>
        {library ? (
          <div role="tabpanel" className="tabpanel library">
            <div className="library-empty">
              <p>Pages, files, and apps this Bot makes show up here</p>
            </div>
          </div>
        ) : (
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
        )}
      </div>
    </aside>
  )
}
