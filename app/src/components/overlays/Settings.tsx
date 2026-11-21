// Settings, as captured on Grok 1.2.3: the General page (item F13, fixtures/states/oracle-settings.json)
// and the pages beside it (F14, SettingsPages.tsx). Look only (0005): nothing here acts outside the page.
// The owner's name, e-mail, photo and promo copy are lengths only in the fixtures, so they show as
// plain placeholders of the captured size, never text. Vault and Usage & Billing are never captured
// (O2): their tabs highlight but show General.
import {useState} from 'react'
import {Icon} from '../Composer'
import {settingsSections} from './data'
import {SETTINGS, fit} from './fit'
import {Bar, GroupHead, PlainRow, Select, SettingRow, Switch, SwitchState, chevronDown, info, x} from './SettingsParts'
import {pages} from './SettingsPages'

const sectionIcons: Record<string, string> = {
  General:
    'M8 5.75a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5zM8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05',
  Computer: 'M2.5 3.5h11v7h-11zM6 13.5h4M8 10.5v3',
  Permissions: 'M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z',
  Vault: 'M3 6.5h10v7H3zM5 6.5V5a3 3 0 0 1 6 0v1.5',
  'Usage & Billing': 'M2.5 4h11v8h-11zM2.5 7h11',
  Updates: 'M13 8a5 5 0 1 1-1.5-3.55M13 2.5v2.5h-2.5',
}

function GeneralPage() {
  return (
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
        <GroupHead title="Account" />
        <div className="set-card">
          <div className="set-account">
            <div className="set-who">
              {/* The owner's photo is theirs (O2): a plain disc of the captured size. Look only. */}
              <button aria-label="Change profile photo" className="set-photo">
                <span className="set-avatar" />
              </button>
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
        <GroupHead title="Appearance" />
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
            <Switch label="Check Spelling While Typing" />
          </SettingRow>
          <PlainRow label="Send with ⌘↵" width={351.3}>
            <Switch label="Send with ⌘↵" on={false} />
          </PlainRow>
        </div>
      </section>
      {/* Below the captured view (the 1.2.3 capture ends inside Appearance): kept from 0.79.3. */}
      <section>
        <GroupHead title="System" />
        <div className="set-card">
          <SettingRow label="Microphone">
            <Select label="Microphone" value="System Default" />
          </SettingRow>
        </div>
      </section>
    </>
  )
}

// `seen`: when Barkpark last heard from the bot's computer (Scene.seen), for the Computer page.
export function Settings({page = 'General', seen, onClose}: {page?: string; seen?: string | null; onClose?: () => void}) {
  const [section, setSection] = useState(page)
  // The switches' positions for the whole dialog, so a tab change keeps a flipped one (SwitchState).
  const [flipped, setFlipped] = useState<Record<string, boolean>>({})
  const flip = (label: string, on: boolean) => setFlipped((f) => ({...f, [label]: on}))
  const shown = pages[section] ? section : 'General'
  const Page = pages[section] ?? GeneralPage
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
            <button aria-label="Close dialog" className="view-close set-close" onClick={onClose}>
              <span>{x}</span>
            </button>
            <header className="set-head">
              <div>
                <h2>{shown}</h2>
                <span className="set-info">{info}</span>
              </div>
            </header>
            <div className="view-scroll">
              <div className="set-body">
                <SwitchState.Provider value={{flipped, flip}}>
                  <Page seen={seen} />
                </SwitchState.Provider>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
