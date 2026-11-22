import type {Scene} from '../components/Shell'
import {seenAtCapture} from './scenes/oracle'

// One scene per fixtures/states/<id>.json, each in its own file, scenes/<id>.ts (default export),
// so lanes adding scenes never edit the same file. A scene is the UI facts of that state (bot
// names, which panel is open, card values). Conversation content is not here: fixtures hold only
// its lengths (O2). A captured state with no scene scores 0 in Gate A: that is the backlog.
const files = import.meta.glob<{default: Scene}>('./scenes/oracle-*.ts', {eager: true})
export const scenes: Record<string, Scene> = Object.fromEntries(
  Object.entries(files).map(([file, mod]) => [file.replace('./scenes/', '').replace(/\.ts$/, ''), mod.default]),
)

// A hover state is the main view with the pointer on one control: same scene as oracle-turn-1040
// (the gate moves the pointer itself).
// A follow-up state (-start, -end, -named, -hover) is its overlay's scene; the gate replays the last
// step (oracle-voice-picker-start: the voice grid wheeled up to its top, as a person scrolls it).
// Every captured state was taken on the same computer, last heard from 13 minutes before (seenAtCapture),
// stamped now so the time is the capture's whenever the page is drawn.
export const sceneFor = (id: string): Scene | undefined => {
  const s = scenes[id] ?? scenes[id.replace(/-(start|end|named|hover)$/, '')] ?? (id.startsWith('oracle-hover-') ? scenes['oracle-turn-1040'] : undefined)
  return s && {...s, seen: seenAtCapture()}
}
