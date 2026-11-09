// The two menus: Composer actions (opened by the composer's + button) and Account (opened by
// the rail's account button). Measured on fixtures/states/oracle-{composer,account}-menu.json.
// Rows that would leave the app (Attach files, Teach a task, Log out ...) render 1:1 and do
// nothing yet (0005).
import type {ReactNode} from 'react'
import {Icon} from '../Composer'
import {weeklyUsage} from './data'

function Item({icon, label, trail, onPick}: {icon: ReactNode; label: string; trail?: ReactNode; onPick?: () => void}) {
  return (
    <div role="menuitem" tabIndex={-1} className="menu-item" onClick={onPick}>
      <span className="menu-icon">{icon}</span>
      <div className="menu-label">
        <span>{label}</span>
      </div>
      {trail}
    </div>
  )
}

const chevron = <Icon d="M6 4l4 4-4 4" />

export function ComposerMenu({onPick}: {onPick?: () => void}) {
  return (
    <div role="presentation" className="pop menu-pop composer-menu">
      <div role="menu" tabIndex={-1} aria-label="Composer actions" className="menu">
        <Item
          icon={<Icon d="M10.5 5.5l-4.25 4.25a1.25 1.25 0 0 0 1.77 1.77l4.6-4.6a2.5 2.5 0 0 0-3.54-3.54L4.5 8a3.75 3.75 0 0 0 5.3 5.3l3.7-3.7" />}
          label="Attach files"
          onPick={onPick}
        />
        <Item
          icon={
            <svg className="rec" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
              <circle cx="9" cy="9" r="5.5" />
              <circle cx="9" cy="9" r="3.2" />
            </svg>
          }
          label="Teach a task"
          onPick={onPick}
        />
      </div>
    </div>
  )
}

export function AccountMenu({onPick, onSettings}: {onPick?: () => void; onSettings?: () => void}) {
  return (
    <div role="presentation" className="pop menu-pop account-menu">
      <div role="menu" tabIndex={-1} aria-label="Account" className="menu">
        <div role="group" className="menu-group">
          <Item
            icon={<Icon d="M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM8 2.5V8l3.9 3.9" />}
            label="Weekly usage"
            onPick={onPick}
            trail={
              <span className="menu-trail">
                <span>
                  <span>{weeklyUsage}</span>
                </span>
                {chevron}
              </span>
            }
          />
          <Item
            icon={<Icon d="M5 2.5h6a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM7 11.5h2" />}
            label="Get Grok Bot for mobile"
            onPick={onPick}
          />
          <Item
            icon={<Icon d="M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM6.5 6.5a1.5 1.5 0 1 1 2 1.4c-.4.2-.5.5-.5.9M8 10.75v.25" />}
            label="Support"
            onPick={onPick}
            trail={
              <span className="menu-trail">
                <span>
                  <Icon d="M6.5 3.5h-3v9h9v-3M9 3.5h3.5V7M12.5 3.5L7.5 8.5" />
                </span>
              </span>
            }
          />
          <Item
            icon={
              <Icon d="M8 5.75a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5zM8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05" />
            }
            label="Settings"
            onPick={onSettings ?? onPick}
          />
        </div>
        <div role="group" className="menu-group">
          <Item
            icon={<Icon d="M6.5 3a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM2 13c.5-2.3 2.3-3.5 4.5-3.5s4 1.2 4.5 3.5M12.5 5.5v4M10.5 7.5h4" />}
            label="Add account"
            onPick={onPick}
          />
          <Item icon={<Icon d="M6.5 13.5h-3v-11h3M10.5 11L13.5 8l-3-3M13.5 8h-7" />} label="Log out" onPick={onPick} />
        </div>
      </div>
    </div>
  )
}
