// Overlays: menus, open pickers, dialogs. The overlays lane owns this folder; the frame mounts
// whatever a scene names here (Scene.overlay), so neither lane edits the other's files.
// Captured targets: oracle-composer-menu, oracle-account-menu, oracle-{voice,speed,language}-picker,
// oracle-new-bot-dialog. Each is a fixed layer over the frame, placed by its anchor (styles/overlays.css).
//
// A scene that names an overlay holds it open (Gate A). Otherwise the overlay opens from its
// trigger, found by the trigger's captured label, so the frame needs no handler of its own yet;
// Escape or a click outside closes it.
//
// A modal (Create New Bot, Connect Apps, Settings) makes the rest of the window inert while it is
// open: traces/2026-11-08-new-bot.json shows the oracle (Floating UI) marking the rail, the
// conversation and the panel the moment the dialog appears.
//
// Keys and focus, as traces/2026-11-09-keys.json measured them on the oracle:
//   on open   a modal focuses the dialog itself (Create New Bot: its name field); a menu focuses
//             the menu with no row highlighted; a picker focuses its picked option, highlighted
//   arrows    move focus and data-highlighted through the rows (no wrap)
//   Escape    closes without choosing; focus goes back to what had it when the overlay opened
//             (the trigger, when the trigger took focus on the click)
//   outside   a click outside closes it and leaves focus on the page (body)
// Enter on a highlighted row clicks it; the oracle probe pressed no Enter, so that one is ours.
import {useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode} from 'react'
import type {Scene} from '../Shell'
import {AccountMenu, ComposerMenu} from './Menus'
import {LanguagePicker, SpeedPicker, VoicePicker} from './Pickers'
import {NewBotDialog} from './NewBotDialog'
import {AvatarEditor, ConnectApps, Settings} from './Views'

type Open = {name: string; picked?: string; trigger?: HTMLElement; back?: HTMLElement | null}
type Render = (o: {picked?: string; scene?: Scene; close: () => void; go: (name: string) => void}) => ReactNode

const overlays: Record<string, Render> = {
  'composer-menu': ({close}) => <ComposerMenu onPick={close} />,
  'account-menu': ({close, go}) => <AccountMenu onPick={close} onSettings={() => go('settings')} />,
  'voice-picker': ({picked, scene, close}) => <VoicePicker picked={picked ?? scene?.voice?.voice} onPick={close} />,
  'speed-picker': ({picked, scene, close}) => <SpeedPicker picked={picked ?? scene?.voice?.speed} onPick={close} />,
  'language-picker': ({picked, scene, close}) => <LanguagePicker picked={picked ?? scene?.voice?.language} onPick={close} />,
  'new-bot-dialog': ({close}) => <NewBotDialog onClose={close} />,
  'connect-apps': ({close}) => <ConnectApps onClose={close} />,
  'edit-avatar': () => <AvatarEditor />,
  settings: ({close}) => <Settings onClose={close} />,
}

const modals = new Set(['new-bot-dialog', 'connect-apps', 'settings'])
const rows = '[role=menuitem], [role=option]'

const pickers: Record<string, string> = {
  Voice: 'voice-picker',
  Speed: 'speed-picker',
  Language: 'language-picker',
}

const triggers: Record<string, string> = {
  'Composer actions': 'composer-menu',
  'Open account menu': 'account-menu',
  'New Bot': 'new-bot-dialog',
  'Connect apps': 'connect-apps',
  'Edit Bot avatar': 'edit-avatar',
}

// Which overlay a clicked trigger opens, by the trigger's label (a label's tail after a comma is a
// status: "Open account menu, new update available").
function triggered(el: Element | null): Open | null {
  const t = el?.closest<HTMLElement>('button, [role=combobox]')
  const label = t?.getAttribute('aria-label')?.split(', ')[0]
  if (!t || !label) return null
  if (t.getAttribute('role') === 'combobox' && pickers[label]) return {name: pickers[label], picked: t.textContent?.trim() || undefined, trigger: t}
  const name = triggers[label]
  return name ? {name, trigger: t} : null
}

// `scene` is optional so the frame can pass it when it wants the pickers to follow the scene's
// voice settings; without it a picker opens on its row's value (or the oracle's captured pick).
// `onOpenChange` hears which overlay is shown (its name, or null when none), whether a scene holds
// it or a click opened it, so the frame can mark the trigger (aria-expanded, a pressed look).
export function Overlay({name, scene, onOpenChange}: {name?: string; scene?: Scene; onOpenChange?: (name: string | null) => void}) {
  const [open, setOpen] = useState<Open | null>(null)
  const layer = useRef<HTMLDivElement>(null)
  const held = !!name
  const shownName = held ? name : (open?.name ?? null)
  const tell = useRef(onOpenChange)
  tell.current = onOpenChange
  useEffect(() => {
    tell.current?.(shownName ?? null)
  }, [shownName])
  // Where focus goes when the overlay closes: what had it when the first overlay opened, or the
  // trigger; null after an outside click (the oracle leaves focus on the page then).
  const back = useRef<HTMLElement | null>(null)
  const returnFocus = useRef(true)
  const close = (focusBack: boolean) => {
    returnFocus.current = focusBack
    setOpen(null)
  }
  useEffect(() => {
    if (held) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element
      // The path as dispatched: a pick inside the layer may already have re-rendered it.
      if (layer.current && e.composedPath().includes(layer.current)) {
        if (target.classList.contains('scrim')) close(false)
        return
      }
      const next = triggered(target)
      if (next) {
        const had = document.activeElement as HTMLElement | null
        next.back = had && had !== document.body ? had : next.trigger
      }
      setOpen((cur) => {
        if (next && cur?.name !== next.name) return next
        returnFocus.current = !!next // the trigger again: a toggle; anything else: outside
        return null
      })
    }
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && close(true)
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [held])
  // A modal makes everything beside it inert (no focus, no clicks, hidden from assistive tech).
  const modal = !!shownName && modals.has(shownName)
  useEffect(() => {
    const app = layer.current?.parentElement
    if (!modal || !app) return
    const rest = [...app.children].filter((c) => c !== layer.current && !c.hasAttribute('inert'))
    rest.forEach((c) => c.setAttribute('inert', ''))
    return () => rest.forEach((c) => c.removeAttribute('inert'))
  }, [modal])
  // Focus on open and on close (see the top of this file).
  useEffect(() => {
    if (held) return
    const el = layer.current
    if (open && el) {
      if (open.back !== undefined) back.current = open.back
      returnFocus.current = true
      if (el.contains(document.activeElement)) return
      const first =
        el.querySelector<HTMLElement>('[role=dialog]') && modal
          ? el.querySelector<HTMLElement>('[role=dialog]')
          : (el.querySelector<HTMLElement>('[role=option][aria-selected=true]') ?? el.querySelector<HTMLElement>('[role=menu]'))
      first?.focus()
      return
    }
    if (!open) {
      const to = back.current
      back.current = null
      if (returnFocus.current && to?.isConnected) to.focus()
    }
  }, [open, modal, held])
  // Arrows walk the rows of a menu or list; the focused row carries data-highlighted.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const box = (e.target as Element).closest('[role=menu], [role=listbox]')
    if (!box) return
    const items = [...box.querySelectorAll<HTMLElement>(rows)]
    const at = items.indexOf(e.target as HTMLElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const to = at < 0 ? (e.key === 'ArrowDown' ? 0 : items.length - 1) : Math.max(0, Math.min(items.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))
      items[to]?.focus()
    } else if (e.key === 'Enter' && at >= 0) {
      e.preventDefault()
      items[at].click()
    }
  }
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const row = (e.target as Element).closest(rows)
    if (!row) return
    row.parentElement
      ?.closest('[role=menu], [role=listbox]')
      ?.querySelectorAll('[data-highlighted]')
      .forEach((r) => r.removeAttribute('data-highlighted'))
    row.setAttribute('data-highlighted', '')
  }
  const shown = held ? {name} : open
  const render = shown ? overlays[shown.name] : undefined
  if (!shown || !render) return null
  return (
    <div ref={layer} className="overlay" data-overlay={shown.name} onKeyDown={onKeyDown} onFocus={onFocus}>
      {render({
        picked: shown.picked,
        scene,
        close: () => !held && close(true),
        go: (n: string) => !held && setOpen({name: n}),
      })}
    </div>
  )
}
