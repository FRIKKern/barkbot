import {createFileRoute} from '@tanstack/react-router'
import {Shell} from '../components/Shell'

// T1 wires this to Barkpark (/v1/chat, /v1/bots) through server functions. Until then the
// shell renders with no bots and no conversation, never with made-up ones (D11).
export const Route = createFileRoute('/')({
  component: () => <Shell scene={{bots: [], panelOpen: true}} />,
})
