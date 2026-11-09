// The details panel (aside "Conversation details", 720..1040): the bot, its tabs, and the
// Activity cards: Suggested, Computer, Voice chat. Library shows its empty state.
import {useRef, useState} from 'react'
import type {Scene} from './Shell'
import {Icon} from './Composer'
import {Face, Pick, Row, Section, fit} from './parts'
import {Tooltip, useHover} from './tips'

// Always mounted: closing runs its width 320 -> 0 (styles/details.css), and a closed panel is
// inert. The tab starts on the scene's and follows clicks.
export function Details({scene, name, onRename, onClose}: {scene: Scene; name?: string; onRename?: (name: string) => void; onClose?: () => void}) {
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
          <BotName key={active} name={name ?? active} onRename={onRename} />
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

// The Bot name field, as traces/2026-11-09-rename.json shows it. A click puts the caret where it
// lands (no select-all). Enter saves and leaves the field (focus on body); Escape puts the old
// name back and leaves it; a click elsewhere saves (focus goes where the click went). An empty
// name is never saved: the old one comes back.
function BotName({name, onRename}: {name: string; onRename?: (name: string) => void}) {
  const [draft, setDraft] = useState(name)
  const cancelled = useRef(false)
  // Saves what the field holds, not `draft`: the same native change event can update draft
  // after this closure was made, and the field is what the person sees.
  const save = (field: HTMLInputElement) => {
    const next = field.value.trim()
    if (!next) {
      field.value = name
      setDraft(name)
    } else if (next !== name) onRename?.(next)
  }
  return (
    <input
      className="who-name"
      aria-label="Bot name"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          // Put the old name in the field itself before leaving it. blur() fires the native change
          // event, and React raises onChange from it whenever its own record of the value is behind
          // the field; with the typed text still in the field, that onChange re-applied it after
          // setDraft(name) (seen on CI: field "Oracle Two", header "Oracle"). With the old name
          // already there, nothing has changed and no onChange can bring the typing back.
          cancelled.current = true
          e.currentTarget.value = name
          setDraft(name)
          e.currentTarget.blur()
        }
      }}
      onBlur={(e) => {
        if (cancelled.current) cancelled.current = false
        else save(e.currentTarget)
      }}
    />
  )
}
