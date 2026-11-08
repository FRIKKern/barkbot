// Overlays: menus, open pickers, dialogs. The overlays lane owns this folder; the frame mounts
// whatever a scene names here (Scene.overlay), so neither lane edits the other's files.
// Captured targets: oracle-composer-menu, oracle-account-menu, oracle-{voice,speed,language}-picker,
// oracle-new-bot-dialog.
import type {ReactNode} from 'react'

const overlays: Record<string, () => ReactNode> = {}

export function Overlay({name}: {name?: string}) {
  const render = name ? overlays[name] : undefined
  return render ? <>{render()}</> : null
}
