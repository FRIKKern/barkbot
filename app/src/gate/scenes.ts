import type {Scene} from '../components/Shell'

// One scene per fixtures/states/<id>.json: the UI facts of that state (bot names, which
// panel is open, card values). Conversation content is not here: fixtures hold only its
// lengths (O2), so Gate A measures the frame around the transcript.
export const scenes: Record<string, Scene> = {
  'oracle-turn-1040': {
    bots: [{name: 'Grookie', main: true}, {name: 'Oracle'}],
    active: 'Oracle',
    panelOpen: true,
    computer: 'Asleep',
    voice: {voice: 'Helix', speed: '1x', language: 'Auto-detect'},
  },
}
