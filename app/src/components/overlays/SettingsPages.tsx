// Settings pages beside General (item F14: oracle-settings-computer, -permissions, -updates, Grok 1.2.3).
// Look only: the switches toggle; the selects, Update, Reset, Add Rule, Open apps and Check for
// Updates do nothing yet (0005). Nothing here installs, updates or resets anything.
import type {ReactNode} from 'react'
import {Icon} from '../Composer'
import {SETTINGS, fit} from './fit'
import {Bar, DescRow, Group, PillButton, PlainRow, Select, Switch, info} from './SettingsParts'

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
                {/* The device is the owner's Mac: the captures redact its name, so it is a placeholder of the captured length. */}
                <span>
                  <Bar w={64.9} />
                </span>
                <span className="set-device-info">
                  <Icon d="M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM8 7.25V11M8 5v.25" />
                </span>
              </div>
              <span className="set-device-state">
                <span style={fit(SETTINGS, 'Computer · Last opened 13 minutes ago')}>
                  <span className="set-dot" />
                  Computer · Last opened 13 minutes ago
                </span>
              </span>
            </div>
          </div>
        </div>
      </Group>
      <Group title="Messages">
        <DescRow label="Read Texts" desc={{width: 470.4}}>
          <Switch label="Read Texts" on={false} />
        </DescRow>
        <DescRow label="Send Texts" desc={{width: 373.2}}>
          <Switch label="Send Texts" on={false} />
        </DescRow>
      </Group>
      <Group title="Bot's computer">
        <DescRow label="Update Bot's Computer" desc={{lines: 2}} nested>
          <PillButton text="Update" label="Update Bot's Computer" />
        </DescRow>
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
          <DescRow label="Approvals" desc={{lines: 2}}>
            <Select label="Approvals" value="Auto-review" />
          </DescRow>
        </div>
      </section>
      <div className="set-rules">
        <Rule title="Always Ask" width={281.4} />
        <Rule title="Allow without Asking" width={338.3} />
      </div>
      <section>
        <div className="set-card flush">
          <PlainRow label="App permissions" width={437.5}>
            <PillButton text="Open apps" />
          </PlainRow>
        </div>
      </section>
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
              Version <bdi style={fit(SETTINGS, '1.2.3')}>1.2.3</bdi>
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
          <PillButton text="Check for Updates" />
        </div>
      </div>
    </Group>
  )
}

export const pages: Record<string, () => ReactNode> = {Computer: ComputerPage, Permissions: PermissionsPage, Updates: UpdatesPage}
