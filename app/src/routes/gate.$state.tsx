import {createFileRoute, notFound} from '@tanstack/react-router'
import {Shell} from '../components/Shell'
import {sceneFor} from '../gate/scenes'

// Gate A's stage: the shell in the same state as a captured oracle state, so the two can be
// measured side by side (QUALITY.md). Development builds only; production answers 404.
export const Route = createFileRoute('/gate/$state')({
  loader: ({params}) => {
    const scene = sceneFor(params.state)
    if (!import.meta.env.DEV || !scene) throw notFound()
    return scene
  },
  component: function Gate() {
    return <Shell scene={Route.useLoaderData()} />
  },
})
