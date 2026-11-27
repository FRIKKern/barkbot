// Connect apps, look only (fixtures/states/oracle-connect-apps.json, Grok 1.2.3). Nothing here acts
// outside the page (0005): Open and Connect do nothing yet, Close and Escape close the view, the
// filters toggle. The connected count is a length only in the fixture (O2), so a placeholder bar.
//
// `today` is the day the Calendar tile shows (the oracle's tile shows the current day): a scene
// passes the captured day (Scene.apps), the live page shows today. The capture had Calendar's and
// Contacts' Connect under way (a spinner, faded); ours draws no under-way look, since Connect does
// nothing yet (0005) and a scene may only show what the live page can draw.
import {useState} from 'react'
import {Icon} from '../Composer'
import {appCategories, appSections, labelledConnect, type App} from './data'
import {APP, CATEGORY, SECTION, fit} from './fit'

const x = <Icon d="M4 4l8 8M12 4l-8 8" />
const chevronDown = <Icon d="M4.5 6.5L8 10l3.5-3.5" />
const Bar = ({w, h = 10}: {w: number | string; h?: number}) => <span className="ph" style={{width: w, height: h}} />

// This Mac's tiles: a plain white glyph of our own on the captured colour; Calendar shows the day.
const macGlyphs: Record<string, string> = {
  Messages: 'M12 4.5c4.4 0 8 2.9 8 6.5s-3.6 6.5-8 6.5c-1 0-2-.2-2.9-.5L5 18.5l1.2-3.4C4.8 13.9 4 12.5 4 11c0-3.6 3.6-6.5 8-6.5z',
  Notes: 'M6 4.5h12v15H6zM8.5 9h7M8.5 12h7M8.5 15h4',
  Reminders: 'M6 7h.01M6 12h.01M6 17h.01M9.5 7h9M9.5 12h9M9.5 17h9',
  Location: 'M19 5L4.5 11l6.5 2 2 6.5z',
  Contacts: 'M12 5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM5 19.5c.8-3.2 3.6-5 7-5s6.2 1.8 7 5',
}

function Day({today}: {today: Date}) {
  return (
    <span className="ca-day">
      <span>{today.toLocaleDateString('en-US', {weekday: 'short'})}</span>
      <span>{today.getDate()}</span>
    </span>
  )
}

function AppRow({app, mac, today}: {app: App; mac?: boolean; today: Date}) {
  const action = app.action ?? 'Connect'
  return (
    <li className="ca-app">
      <button aria-label={`Open ${app.name}`} className={mac ? 'ca-open ca-open-mac' : 'ca-open'}>
        <span className={mac ? 'ca-tile ca-tile-mac' : 'ca-tile'} style={app.tile ? {background: app.tile} : undefined}>
          {app.name === 'Calendar' ? (
            <Day today={today} />
          ) : (
            mac &&
            macGlyphs[app.name] && (
              <svg className="ca-glyph" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                <path d={macGlyphs[app.name]} />
              </svg>
            )
          )}
        </span>
        <span className="ca-name">
          {mac ? (
            <>
              <span>{app.name}</span>
              <span className="ca-desc">{app.desc}</span>
            </>
          ) : (
            <span>
              <span style={fit(APP, app.name)}>{app.name}</span>
            </span>
          )}
        </span>
      </button>
      <span className="ca-action">
        <button aria-label={labelledConnect.has(app.name) ? `Connect ${app.name}` : undefined} className="ca-connect">
          <span>
            <span>
              {action}
            </span>
          </span>
        </button>
      </span>
    </li>
  )
}

export function ConnectApps({onClose, today}: {onClose?: () => void; today?: string}) {
  const [category, setCategory] = useState('All')
  const day = today ? new Date(`${today}T12:00:00`) : new Date()
  return (
    <>
      <div className="scrim" />
      <div role="dialog" tabIndex={-1} aria-modal="true" aria-label="Connect apps" className="view connect-apps">
        <button aria-label="Close dialog" className="view-close ca-close" onClick={onClose}>
          <span>{x}</span>
        </button>
        <div className="ca-head" />
        <div className="view-scroll">
          <div className="ca-body">
            <div className="ca-title">
              <h2>Connect apps</h2>
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
                      <AppRow key={a.name} app={a} mac={s.mac} today={day} />
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
