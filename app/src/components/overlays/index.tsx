// Overlays: menus, open pickers, dialogs. The overlays lane owns this folder; the frame mounts
// whatever a scene names here (Scene.overlay), so neither lane edits the other's files.
// Captured targets: oracle-composer-menu, oracle-account-menu, oracle-{voice,speed,language}-picker,
// oracle-new-bot-dialog. Each is a fixed layer over the frame, placed by its anchor (styles/overlays.css).
//
// A scene that names an overlay holds it open (Gate A). Otherwise the overlay opens from its
// trigger, found by the trigger's captured label, so the frame needs no handler of its own yet;
// Escape or a click outside closes it.
import {useEffect, useRef, useState, type ReactNode} from 'react'
import type {Scene} from '../Shell'
import {AccountMenu, ComposerMenu} from './Menus'
import {LanguagePicker, SpeedPicker, VoicePicker} from './Pickers'
import {NewBotDialog} from './NewBotDialog'

type Open = {name: string; picked?: string}
type Render = (o: {picked?: string; scene?: Scene; close: () => void}) => ReactNode

const overlays: Record<string, Render> = {
  'composer-menu': ({close}) => <ComposerMenu onPick={close} />,
  'account-menu': ({close}) => <AccountMenu onPick={close} />,
  'voice-picker': ({picked, scene, close}) => <VoicePicker picked={picked ?? scene?.voice?.voice} onPick={close} />,
  'speed-picker': ({picked, scene, close}) => <SpeedPicker picked={picked ?? scene?.voice?.speed} onPick={close} />,
  'language-picker': ({picked, scene, close}) => <LanguagePicker picked={picked ?? scene?.voice?.language} onPick={close} />,
  'new-bot-dialog': ({close}) => <NewBotDialog onClose={close} />,
}

const pickers: Record<string, string> = {
  Voice: 'voice-picker',
  Speed: 'speed-picker',
  Language: 'language-picker',
}

// Which overlay a clicked trigger opens, by the trigger's label (a label's tail after a comma is a
// status: "Open account menu, new update available").
function triggered(el: Element | null): Open | null {
  const t = el?.closest('button, [role=combobox]')
  const label = t?.getAttribute('aria-label')?.split(', ')[0]
  if (!t || !label) return null
  if (t.getAttribute('role') === 'combobox' && pickers[label]) return {name: pickers[label], picked: t.textContent?.trim() || undefined}
  if (label === 'Composer actions') return {name: 'composer-menu'}
  if (label === 'Open account menu') return {name: 'account-menu'}
  if (label === 'New Bot') return {name: 'new-bot-dialog'}
  return null
}

// `scene` is optional so the frame can pass it when it wants the pickers to follow the scene's
// voice settings; without it a picker opens on its row's value (or the oracle's captured pick).
export function Overlay({name, scene}: {name?: string; scene?: Scene}) {
  const [open, setOpen] = useState<Open | null>(null)
  const layer = useRef<HTMLDivElement>(null)
  const held = !!name
  useEffect(() => {
    if (held) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element
      if (layer.current?.contains(target)) return
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
  const shown = held ? {name} : open
  const render = shown ? overlays[shown.name] : undefined
  if (!shown || !render) return null
  return (
    <div ref={layer} className="overlay" data-overlay={shown.name}>
      {render({
        picked: shown.picked,
        scene,
        close: () => !held && setOpen(null),
      })}
    </div>
  )
}
