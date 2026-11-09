// For scripts/behaviour.mjs only: mounts Shell on its own so the test can drive `workingBots`
// as the chat stream would (a bot entering it starts a turn, leaving it is the reply landing).
// Served by the dev server as /src/gate/behaviour.tsx; no route or page imports it.
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {Shell} from '../components/Shell'
import {oracle} from './scenes/oracle'

export function mount(el: HTMLElement, overlay?: string) {
  const root = createRoot(el)
  const render = (working: string[]) => flushSync(() => root.render(<Shell scene={{...oracle, overlay}} workingBots={working} />))
  render([])
  return render
}
