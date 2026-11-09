// Three captured views over the main screen, look only (nothing in them acts yet, 0005):
// Connect Apps (fixtures/states/oracle-connect-apps.json), the avatar editor
// (oracle-edit-avatar.json) and Settings, General page (oracle-settings.json).
// The owner's name, e-mail, connected count and promo copy are lengths only in the fixtures,
// so they show as plain placeholder bars of the captured size, never text.
import {useState, type ReactNode} from 'react'
import {Icon} from '../Composer'
import {CharacterLooks} from './NewBotDialog'
import {appCategories, appSections, labelledConnect, settingsSections} from './data'
import {APP, CATEGORY, SECTION, SETTINGS, fit} from './fit'

const x = <Icon d="M4 4l8 8M12 4l-8 8" />
const chevronDown = <Icon d="M4.5 6.5L8 10l3.5-3.5" />
const info = <Icon d="M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM8 7.25V11M8 5v.25" />
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

function SettingRow({label, short, children}: {label: string; short?: boolean; children: ReactNode}) {
  return (
    <div className={`set-row${short ? ' short' : ''}`}>
      <div>
        <div className="set-label">
          <span style={fit(SETTINGS, label)}>{label}</span>
          <span className="set-info">{info}</span>
        </div>
      </div>
      <div>{children}</div>
    </div>
  )
}

function Select({label, value}: {label: string; value: string}) {
  return (
    <button role="combobox" aria-expanded="false" aria-label={label} className="set-select">
      <span>
        <span style={fit(SETTINGS, value)}>{value}</span>
      </span>
      {chevronDown}
    </button>
  )
}

const sectionIcons: Record<string, string> = {
  General:
    'M8 5.75a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5zM8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05',
  Computer: 'M2.5 3.5h11v7h-11zM6 13.5h4M8 10.5v3',
  Permissions: 'M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z',
  Vault: 'M3 6.5h10v7H3zM5 6.5V5a3 3 0 0 1 6 0v1.5',
  'Usage & Billing': 'M2.5 4h11v8h-11zM2.5 7h11',
  Updates: 'M13 8a5 5 0 1 1-1.5-3.55M13 2.5v2.5h-2.5',
}

// Settings pages beside General (item F14: oracle-settings-computer, -permissions, -updates).
// Long descriptions are kept as lengths in the fixtures, so they are placeholders of the captured
// size: a wrapped one fills its row (lines: 2), a one-line one has its measured width.
type Desc = {lines: 2} | {width: number}
function Description({desc, small}: {desc: Desc; small?: boolean}) {
  const two = 'lines' in desc
  return (
    <span className={`set-desc${small ? ' small' : ''}${two ? ' two' : ''}`}>
      {two ? (
        <>
          <Bar w="100%" />
          <Bar w="70%" />
        </>
      ) : (
        <Bar w={desc.width} />
      )}
    </span>
  )
}

function Label({text, nested, children}: {text: string; nested?: boolean; children?: ReactNode}) {
  return (
    <div className="set-label">
      {nested ? (
        <span className="set-nested">
          <span style={fit(SETTINGS, text)}>{text}</span>
        </span>
      ) : (
        <span style={fit(SETTINGS, text)}>
          {text}
          {children}
        </span>
      )}
      <span className="set-info">{info}</span>
    </div>
  )
}

// A row with a label, a description under it and an optional control at its right.
function DescRow({label, desc, nested, children}: {label: string; desc: Desc; nested?: boolean; children?: ReactNode}) {
  return (
    <div className={`set-drow${'lines' in desc ? ' fill' : ''}`}>
      <div>
        <Label text={label} nested={nested} />
        <Description desc={desc} />
      </div>
      {children && <div>{children}</div>}
    </div>
  )
}

function Switch({label, on = true}: {label: string; on?: boolean}) {
  const [checked, setChecked] = useState(on)
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className="set-switch" onClick={() => setChecked(!checked)}>
      <span />
    </button>
  )
}

function Group({title, children}: {title: string; children: ReactNode}) {
  return (
    <section>
      <div className="set-group-head">
        <h3 style={fit(SETTINGS, title)}>{title}</h3>
        <span className="set-info">{info}</span>
      </div>
      <div className="set-card">{children}</div>
    </section>
  )
}

const check = <Icon d="M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM5.5 8.2l1.7 1.7 3.3-3.6" />

function ComputerPage() {
  return (
    <>
      <Group title="Your computer">
        <DescRow label="Execution on this computer" desc={{lines: 2}}>
          <Select label="Execution on this computer" value="Always allow" />
        </DescRow>
        <DescRow label="Route traffic through this computer" desc={{lines: 2}}>
          <Switch label="Route traffic through this computer" />
        </DescRow>
      </Group>
      <Group title="Manage devices">
        <div className="set-device">
          <span className="set-device-icon">
            <Icon d="M2.5 3.5h11v7h-11zM6 13.5h4M8 10.5v3" />
          </span>
          <div>
            <div>
              <div className="set-device-name">
                {/* The device is the owner's Mac: its name is a placeholder of the captured length. */}
                <span>
                  <Bar w={64.9} />
                </span>
                <span className="set-device-info">
                  <Icon d="M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM8 7.25V11M8 5v.25" />
                </span>
              </div>
              <span className="set-device-state">
                <span>
                  <span className="set-dot" />
                  Computer · Online now
                </span>
              </span>
            </div>
          </div>
        </div>
      </Group>
      <Group title="Bot's computer">
        <div className="set-block">
          <div className="set-drow fill">
            <div>
              <Label text="Update Bot's Computer" nested />
              <Description desc={{lines: 2}} />
            </div>
          </div>
          <div role="status" className="set-status">
            <div>
              {check}
              <span style={fit(SETTINGS, 'Your computer is on the latest version')}>Your computer is on the latest version</span>
            </div>
          </div>
        </div>
        <DescRow label="Reset Bot's Computer" desc={{lines: 2}}>
          <button aria-label="Reset Bot's Computer" className="set-danger">
            <span>Reset</span>
          </button>
        </DescRow>
      </Group>
    </>
  )
}

function Rule({title, width}: {title: string; width: number}) {
  return (
    <section className="set-rule">
      <div>
        <div>
          <div className="set-rule-head">
            <h3 style={fit(SETTINGS, title)}>{title}</h3>
            <span className="set-info">{info}</span>
          </div>
          <p>
            <Bar w={width} h={8} />
          </p>
        </div>
        <div>
          <button aria-label={`Add Rule to ${title}`} className="set-add">
            <span style={fit(SETTINGS, 'Add Rule')}>Add Rule</span>
          </button>
        </div>
      </div>
    </section>
  )
}

function PermissionsPage() {
  return (
    <>
      <section>
        <div className="set-card flush">
          <DescRow label="Auto-Review" desc={{width: 295.1}}>
            <Switch label="Auto-Review" />
          </DescRow>
        </div>
      </section>
      <div className="set-rules">
        <Rule title="Always Ask" width={281.4} />
        <Rule title="Allow without Asking" width={338.3} />
      </div>
    </>
  )
}

function UpdatesPage() {
  return (
    <Group title="Grok Bot Updates">
      <DescRow label="Automatic Updates" desc={{width: 312.2}}>
        <Switch label="Automatic Updates" />
      </DescRow>
      <div className="set-drow">
        <div>
          <div className="set-label">
            <span>
              Version <bdi style={fit(SETTINGS, '0.79.3')}>0.79.3</bdi>
            </span>
            <span className="set-info">{info}</span>
            <span className="set-info set-notes">
              <Icon d="M4 2.5h6l2.5 2.5v8.5H4zM6 8h4.5M6 10.5h4.5" />
            </span>
          </div>
          <span role="status" className="set-uptodate">
            You&apos;re up to date
          </span>
        </div>
        <div>
          <button className="pill set-check">
            <span>Check for Updates</span>
          </button>
        </div>
      </div>
    </Group>
  )
}

const pages: Record<string, () => ReactNode> = {Computer: ComputerPage, Permissions: PermissionsPage, Updates: UpdatesPage}

export function Settings({page = 'General', onClose}: {page?: string; onClose?: () => void}) {
  const [section, setSection] = useState(page)
  const [spelling, setSpelling] = useState(true)
  const shown = pages[section] ? section : 'General'
  const Page = pages[section]
  return (
    <>
      <div className="scrim" />
      <div role="dialog" tabIndex={-1} aria-modal="true" aria-label="Grok Bot settings" className="view settings">
        <div className="set-wrap">
          <nav aria-label="Settings sections" className="set-nav">
            {settingsSections.map((s) => (
              <button key={s} aria-current={s === section ? 'page' : undefined} className="set-tab" onClick={() => setSection(s)}>
                <Icon d={sectionIcons[s]} />
                <span style={fit(SETTINGS, s)}>{s}</span>
              </button>
            ))}
          </nav>
          <section className="set-page">
            <button aria-label="Close" className="view-close set-close" onClick={onClose}>
              {x}
            </button>
            <header className="set-head">
              <div>
                <h2 style={fit(SETTINGS, shown)}>{shown}</h2>
                <span className="set-info">{info}</span>
              </div>
            </header>
            <div className="view-scroll">
              <div className="set-body">
                {Page ? (
                  <Page />
                ) : (
                  <>
                    <section className="set-promo">
                      <div className="set-promo-text">
                        <div>
                          <p style={fit(SETTINGS, 'Unlock the ultimate AI subscription')}>Unlock the ultimate AI subscription</p>
                          <p className="set-promo-copy">
                            <Bar w="100%" />
                            <Bar w="100%" />
                            <Bar w="60%" />
                          </p>
                        </div>
                        <button className="set-cta">
                          <span>Get started</span>
                        </button>
                      </div>
                      <div className="set-promo-art" />
                    </section>
                    <section>
                      <div className="set-group-head">
                        <h3>Account</h3>
                        <span className="set-info">{info}</span>
                      </div>
                      <div className="set-card">
                        <div className="set-account">
                          <div className="set-who">
                            <span className="set-avatar" />
                            <div role="status" className="set-id">
                              <span>
                                <Bar w={72} />
                              </span>
                              <span className="set-email">
                                <span>
                                  <bdi>
                                    <Bar w={109} />
                                  </bdi>
                                </span>
                                <button aria-label="Copy email address" className="set-copy">
                                  <Icon d="M5.5 5.5h7v7h-7zM3.5 10.5v-7h7" />
                                </button>
                              </span>
                            </div>
                          </div>
                          <div className="set-actions">
                            <button className="pill">
                              <span style={fit(SETTINGS, 'Add account')}>Add account</span>
                            </button>
                            <button className="pill">
                              <span>Sign Out</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </section>
                    <section>
                      <div className="set-group-head">
                        <h3>Appearance</h3>
                        <span className="set-info">{info}</span>
                      </div>
                      <div className="set-card">
                        <SettingRow label="Theme">
                          <Select label="Theme" value="Follow System" />
                        </SettingRow>
                        <SettingRow label="Accent">
                          <Select label="Accent" value="Bot color" />
                        </SettingRow>
                        <SettingRow label="Language">
                          <button aria-label="Language, Follow System" className="set-select">
                            <span>Follow System</span>
                            {chevronDown}
                          </button>
                        </SettingRow>
                        <SettingRow label="Check Spelling While Typing" short>
                          <button
                            role="switch"
                            aria-checked={spelling}
                            aria-label="Check Spelling While Typing"
                            className="set-switch"
                            onClick={() => setSpelling(!spelling)}
                          >
                            <span />
                          </button>
                        </SettingRow>
                      </div>
                    </section>
                    <section>
                      <div className="set-group-head">
                        <h3>System</h3>
                        <span className="set-info">{info}</span>
                      </div>
                      <div className="set-card">
                        <SettingRow label="Microphone">
                          <Select label="Microphone" value="System Default" />
                        </SettingRow>
                      </div>
                    </section>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
