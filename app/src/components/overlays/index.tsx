// Overlays: menus, open pickers, dialogs. The overlays lane owns this folder; the frame mounts
// whatever a scene names here (Scene.overlay), so neither lane edits the other's files.
// Captured targets: oracle-composer-menu, oracle-account-menu, oracle-{voice,language}-picker,
// oracle-new-bot-dialog. Each is a fixed layer over the frame, placed by its anchor (styles/overlays.css).
//
// A scene that names an overlay holds it open (Gate A). Otherwise the overlay opens from its
// trigger, found by the trigger's captured label, so the frame needs no handler of its own yet;
// Escape or a click outside closes it.
//
// A modal (Create New Bot, Connect Apps, Settings) hides the rest of the window while it is open
// (aria-hidden, and inert): traces/2026-11-08-new-bot.json shows the oracle (Floating UI) setting
// aria-hidden on the rail, the conversation and the panel the moment the dialog appears.
//
// Keys and focus, as traces/2026-11-09-keys.json measured them on the oracle:
//   on open   a modal focuses the dialog itself (Create New Bot: its name field); a menu focuses
//             the menu with no row highlighted; a picker focuses its picked option, highlighted
//             (traced on 0.79.3's Speed list; 1.2.3's Voice dialog focuses its checked voice: ours)
//   arrows    move focus and data-highlighted through the rows (no wrap)
//   Escape    closes without choosing; focus goes back to what had it when the overlay opened
//             (the trigger, when the trigger took focus on the click)
//             A view opened from a menu's row (account menu > Settings): what had it before the
//             menu opened (the trace: Connect apps, not the account menu's button)
//   outside   a click outside closes it and leaves focus on the page (body)
// Enter on a highlighted row clicks it; the oracle probe pressed no Enter, so that one is ours.
import {useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode} from 'react'
import type {Scene} from '../Shell'
import {AccountMenu, ComposerMenu} from './Menus'
import {LanguagePicker} from './Pickers'
import {VoiceDialog} from './VoiceDialog'
import {NewBotDialog} from './NewBotDialog'
import {AvatarEditor, ConnectApps, Settings} from './Views'
import {GetMobile} from './GetMobile'

// `before`: what had focus before the trigger was pressed (a click on a button moves focus to it
// first). A view opened from a menu's row gives focus back there on close: the keys trace's
// Settings (account menu > Settings) gave it to Connect apps, focused before the menu opened.
type Open = {name: string; picked?: string; trigger?: HTMLElement; back?: HTMLElement | null; before?: HTMLElement | null}
/** Create in the New Bot dialog: makes the bot; the dialog closes once it is made. `retry`: the id of
 *  a bot whose record write got no answer (CreateRetry), which this Create finishes. */
export type CreateBot = (b: {name: string; shape: string; colour: string; retry?: string}) => Promise<void>
/** A picker's pick: which picker (its overlay name; 'voice-speed' for the Voice dialog's slider) and the value. */
export type Choose = (overlay: string, value: string | number) => void
// `choose` picks and closes (a list); `change` hands a value on and leaves the overlay open (the Voice dialog).
type Render = (o: {picked?: string; scene?: Scene; close: () => void; choose: (value: string) => void; change: (overlay: string, value: string | number) => void; go: (name: string) => void; create?: CreateBot}) => ReactNode

const overlays: Record<string, Render> = {
  'composer-menu': ({close}) => <ComposerMenu onPick={close} />,
  'account-menu': ({close, go}) => <AccountMenu onPick={close} onSettings={() => go('settings')} />,
  'voice-picker': ({scene, change}) => (
    <VoiceDialog picked={scene?.voice?.voice} speed={scene?.voice?.speed} onPick={(v) => change('voice-picker', v)} onSpeed={(n) => change('voice-speed', n)} />
  ),
  'language-picker': ({picked, scene, choose}) => <LanguagePicker picked={picked ?? scene?.voice?.language} onPick={choose} />,
  'new-bot-dialog': ({close, create}) => <NewBotDialog onClose={close} onCreate={create} />,
  'connect-apps': ({close}) => <ConnectApps onClose={close} />,
  'get-mobile': ({close}) => <GetMobile onClose={close} />,
  'edit-avatar': () => <AvatarEditor />,
  settings: ({close}) => <Settings onClose={close} />,
  // A scene can open Settings on another page (oracle-settings-computer, ...); the tabs switch it.
  'settings-computer': ({close}) => <Settings page="Computer" onClose={close} />,
  'settings-permissions': ({close}) => <Settings page="Permissions" onClose={close} />,
  'settings-updates': ({close}) => <Settings page="Updates" onClose={close} />,
}

const modals = new Set(['new-bot-dialog', 'connect-apps', 'get-mobile', 'settings', 'settings-computer', 'settings-permissions', 'settings-updates'])
const rows = '[role=menuitem], [role=option]'

// A combobox opens its list by its label; 1.2.3's Voice row is a plain button that names the
// overlay it opens (data-picker), as it has no label of its own.
const pickers: Record<string, string> = {
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
  if (t?.dataset.picker) return {name: t.dataset.picker, trigger: t}
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
// `onChoose` hears a picker's pick (the frame owns the row it changes); the picker closes after it.
export function Overlay({name, scene, onOpenChange, onCreateBot, onChoose}: {name?: string; scene?: Scene; onOpenChange?: (name: string | null) => void; onCreateBot?: CreateBot; onChoose?: Choose}) {
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
  // Focus as it was when the pointer went down, before the browser moved it to what was pressed.
  const prior = useRef<Element | null>(null)
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
        // A key press (detail 0) moves no focus: what had it is what had it before.
        const was = (e.detail === 0 ? had : prior.current) as HTMLElement | null
        next.before = was && was !== document.body && was.isConnected ? was : null
      }
      prior.current = null
      setOpen((cur) => {
        if (next && cur?.name !== next.name) return next
        returnFocus.current = !!next // the trigger again: a toggle; anything else: outside
        return null
      })
    }
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && close(true)
    const onDown = () => (prior.current = document.activeElement)
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [held])
  // A modal hides everything beside it with aria-hidden="true", as the oracle does (traces/2026-11-08-
  // new-bot.json: the rail, the main column, its header and the panel, the frame the dialog appears),
  // and makes it inert too: aria-hidden alone hides it from assistive tech only, while inert also
  // keeps focus and clicks out of it (the keys trace: Tab stays in the dialog). Each attribute is
  // taken back on close only where this set it.
  const modal = !!shownName && modals.has(shownName)
  useEffect(() => {
    const app = layer.current?.parentElement
    if (!modal || !app) return
    const rest = [...app.children].filter((c) => c !== layer.current)
    const inert = rest.filter((c) => !c.hasAttribute('inert'))
    const hidden = rest.filter((c) => c.getAttribute('aria-hidden') !== 'true')
    inert.forEach((c) => c.setAttribute('inert', ''))
    hidden.forEach((c) => c.setAttribute('aria-hidden', 'true'))
    return () => {
      inert.forEach((c) => c.removeAttribute('inert'))
      hidden.forEach((c) => c.removeAttribute('aria-hidden'))
    }
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
          : (el.querySelector<HTMLElement>('[role=option][aria-selected=true], [role=radio][aria-checked=true]') ?? el.querySelector<HTMLElement>('[role=menu]'))
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
        choose: (value: string) => {
          onChoose?.(shown.name, value)
          if (!held) close(true)
        },
        change: (overlay: string, value: string | number) => onChoose?.(overlay, value),
        go: (n: string) => !held && setOpen((cur) => ({name: n, back: cur?.before ?? cur?.back})),
        create: onCreateBot,
      })}
    </div>
  )
}
