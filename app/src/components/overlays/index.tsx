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
// conversation and the panel the moment the dialog appears, and its dialog is focusable. Focus
// goes into a modal when it opens and back to the trigger when an overlay closes, unless the
// person has already put it somewhere else.
import {useEffect, useRef, useState, type ReactNode} from 'react'
import type {Scene} from '../Shell'
import {AccountMenu, ComposerMenu} from './Menus'
import {LanguagePicker, SpeedPicker, VoicePicker} from './Pickers'
import {NewBotDialog} from './NewBotDialog'
import {AvatarEditor, ConnectApps, Settings} from './Views'

type Open = {name: string; picked?: string; trigger?: HTMLElement}
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
const tabbable = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

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
  useEffect(() => {
    if (held) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element
      // The path as dispatched: a pick inside the layer may already have re-rendered it.
      if (layer.current && e.composedPath().includes(layer.current)) return
      const next = triggered(target)
      setOpen((cur) => (next && cur?.name !== next.name ? next : null))
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
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
  // Focus: into a modal on open (its own autofocus first, else its first control); back to the
  // trigger on close when nothing else took it.
  const trigger = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (held) return
    if (open) {
      if (open.trigger) trigger.current = open.trigger
      const el = layer.current
      if (modal && el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>(tabbable)?.focus()
      return
    }
    const back = trigger.current
    trigger.current = null
    const lost = !document.activeElement || document.activeElement === document.body
    if (back?.isConnected && lost) back.focus()
  }, [open, modal, held])
  const shown = held ? {name} : open
  const render = shown ? overlays[shown.name] : undefined
  if (!shown || !render) return null
  return (
    <div ref={layer} className="overlay" data-overlay={shown.name}>
      {render({
        picked: shown.picked,
        scene,
        close: () => !held && setOpen(null),
        go: (n: string) => !held && setOpen({name: n}),
      })}
    </div>
  )
}
