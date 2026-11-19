// Three captured views over the main screen, look only (nothing in them acts yet, 0005):
// Connect Apps (fixtures/states/oracle-connect-apps.json), the avatar editor
// (oracle-edit-avatar.json) and Settings (Settings.tsx, re-exported here).
// The owner's name, e-mail, connected count and promo copy are lengths only in the fixtures,
// so they show as plain placeholder bars of the captured size, never text.
import {useState} from 'react'
import {Icon} from '../Composer'
import {CharacterLooks} from './NewBotDialog'
import {appCategories, appSections, labelledConnect} from './data'
import {APP, CATEGORY, SECTION, fit} from './fit'

const x = <Icon d="M4 4l8 8M12 4l-8 8" />
const chevronDown = <Icon d="M4.5 6.5L8 10l3.5-3.5" />
const Bar = ({w, h = 10}: {w: number | string; h?: number}) => <span className="ph" style={{width: w, height: h}} />

export function ConnectApps({onClose}: {onClose?: () => void}) {
  const [category, setCategory] = useState('All')
  return (
    <>
      <div className="scrim" />
      <div role="dialog" tabIndex={-1} aria-modal="true" aria-label="Connect Apps" className="view connect-apps">
        <button aria-label="Close" className="view-close ca-close" onClick={onClose}>
          <span>{x}</span>
        </button>
        <div className="ca-head" />
        <div className="view-scroll">
          <div className="ca-body">
            <div className="ca-title">
              <h2>Connect Apps</h2>
              <div className="ca-plugins-wrap">
                <button aria-label="Your plugins" className="ca-plugins">
                  <span className="ca-stack">
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i}>
                        <span />
                      </span>
                    ))}
                  </span>
                  <Bar w={71.3} />
                  <Icon d="M6 4l4 4-4 4" />
                </button>
              </div>
            </div>
            <div className="ca-tools">
              <div className="ca-search-row">
                <div className="ca-search">
                  <Icon d="M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM10.25 10.25L13.5 13.5" />
                  <input role="combobox" aria-expanded="false" aria-label="Search across apps and skills" placeholder="Search across apps and skills" />
                </div>
                <button className="ca-templates">
                  <span className="ca-templates-icon">
                    <Icon d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" />
                  </span>
                  Bot templates
                  <span className="ca-templates-chev">{chevronDown}</span>
                </button>
              </div>
              <div role="group" aria-label="Plugin categories" className="ca-cats">
                {appCategories.map((c) => (
                  <button key={c} aria-pressed={c === category} className="ca-cat" style={fit(CATEGORY, c)} onClick={() => setCategory(c)}>
                    {c}
                  </button>
                ))}
                <button className="ca-cat" style={fit(CATEGORY, 'More')}>
                  More
                  <span>{chevronDown}</span>
                </button>
              </div>
            </div>
            <div className="ca-sections">
              {appSections.map((s) => (
                <section key={s.title}>
                  <div className="ca-sec-head">
                    <h3 style={fit(SECTION, s.title)}>{s.title}</h3>
                    {s.viewAll && <button className="ca-viewall">View all</button>}
                  </div>
                  <ul className="ca-grid">
                    {s.apps.map((a) => (
                      <li key={a} className="ca-app">
                        <button aria-label={`Open ${a}`} className="ca-open">
                          <span className="ca-tile" />
                          <span className="ca-name">
                            <span>
                              <span style={fit(APP, a)}>{a}</span>
                            </span>
                          </span>
                        </button>
                        <span>
                          <button aria-label={labelledConnect.has(a) ? `Connect ${a}` : undefined} className="ca-connect">
                            <span>
                              <span>Connect</span>
                            </span>
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// The avatar editor opens under the details panel's avatar, centred on it (avatar 848..912 ->
// editor 731.5..1028.5), and shows the bot's own shape and colour.
export function AvatarEditor({shape: s0 = 'square', colour: c0 = 'Gray'}: {shape?: string; colour?: string}) {
  const [tab, setTab] = useState('Bot')
  const [shape, setShape] = useState(s0)
  const [colour, setColour] = useState(c0)
  return (
    <div role="dialog" aria-label="Avatar editor" className="pop avatar-editor">
      <div className="avatar-head">
        <div role="tablist" aria-label="Avatar source" className="avatar-tabs">
          {['Bot', 'Generate', 'Upload'].map((t) => (
            <button key={t} role="tab" aria-selected={t === tab} className="avatar-tab" onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        <button aria-label="Reset character to default" className="avatar-reset">
          Reset
        </button>
      </div>
      <div className="avatar-body">
        <CharacterLooks shape={shape} colour={colour} onShape={setShape} onColour={setColour} />
      </div>
    </div>
  )
}

export {Settings} from './Settings'
