// The details panel (aside "Conversation details", 720..1040): the bot, its tabs, and the
// Activity cards: Suggested, Computer, Voice chat. Library shows its empty state.
import {useState} from 'react'
import type {Scene} from './Shell'
import {Icon} from './Composer'
import {Face, Pick, Row, Section, fit} from './parts'
import {Tooltip, useHover} from './tips'

// Always mounted: closing runs its width 320 -> 0 (styles/details.css), and a closed panel is
// inert. The tab starts on the scene's and follows clicks.
export function Details({scene, onClose}: {scene: Scene; onClose?: () => void}) {
  const active = scene.active ?? ''
  const [tab, setTab] = useState(scene.tab ?? 'activity')
  const library = tab === 'library'
  const avatar = useHover()
  return (
    <aside className="details" aria-label="Conversation details" inert={!scene.panelOpen}>
      <header className="details-head">
        <button className="close" aria-label="Close" onClick={onClose}>
          <Icon d="M4 4l8 8M12 4l-8 8" />
        </button>
      </header>
      <div className={library ? 'details-body lib' : 'details-body'}>
        <div className="who">
          <button className="who-face" aria-label="Edit Bot avatar" data-editing={scene.overlay === 'edit-avatar' || undefined} {...avatar.on}>
            <Face size={52} />
            {/* The pencil's 14 pt box sits at the face's centre in every capture; it draws on
                hover and while the avatar editor is open (oracle-edit-avatar). */}
            <i className="who-pencil" aria-hidden="true">
              <Icon d="M10.5 2.5l3 3-7.5 7.5H3v-3z" />
            </i>
          </button>
          <Tooltip box={avatar.box} side="bottom">
            Edit Avatar
          </Tooltip>
          <input key={active} className="who-name" aria-label="Bot name" defaultValue={active} />
        </div>
        <div className="tabs-row">
          <div role="tablist" aria-label="Conversation details" className="tabs">
            <button role="tab" aria-selected={!library} className="tab" onClick={() => setTab('activity')}>
              Activity
            </button>
            <button role="tab" aria-selected={library} className="tab" onClick={() => setTab('library')}>
              Library
            </button>
          </div>
          <span className="tabs-fade" />
        </div>
        {library ? (
          <div role="tabpanel" className="tabpanel library">
            <div className="library-empty">
              <div>
                <p>Pages, files, and apps this Bot makes show up here</p>
              </div>
            </div>
            <div className="library-end" />
          </div>
        ) : (
          <div role="tabpanel" className="tabpanel">
            <Section title="Suggested" action={<button className="section-hide">Hide</button>}>
              <Row icon={<Icon d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" />} label="Add to Slack" />
              <Row icon={<Icon d="M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM8 5v3l2 1.25" />} label="Create a routine" />
            </Section>
            {scene.computer && (
              <Section title="Computer">
                <li>
                  <button className="computer">
                    <span className="computer-text">
                      <span className="computer-name">
                        <bdi style={fit("Bot's computer")}>Bot's computer</bdi>
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
                <Pick label="Voice" value={scene.voice.voice} open={scene.overlay === 'voice-picker'} />
                <Pick label="Speed" value={scene.voice.speed} open={scene.overlay === 'speed-picker'} />
                <Pick label="Language" value={scene.voice.language} open={scene.overlay === 'language-picker'} />
              </Section>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
