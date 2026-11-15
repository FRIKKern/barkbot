// For scripts/behaviour.mjs only: mounts Shell on its own so the test can drive `workingBots`
// as the chat stream would (a bot entering it starts a turn, leaving it is the reply landing).
// Served by the dev server as /src/gate/behaviour.tsx; no route or page imports it.
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {Shell, type Scene} from '../components/Shell'
import {oracle} from './scenes/oracle'

/** `scene`: what to lay over the oracle scene (two bots of one name, for the id rules). */
export function mount(el: HTMLElement, overlay?: string, scene?: Partial<Scene>) {
  const root = createRoot(el)
  const render = (working: string[]) => flushSync(() => root.render(<Shell scene={{...oracle, overlay, ...scene}} workingBots={working} />))
  render([])
  return render
}
