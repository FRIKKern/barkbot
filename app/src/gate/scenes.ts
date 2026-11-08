import type {Scene} from '../components/Shell'

// One scene per fixtures/states/<id>.json: the UI facts of that state (bot names, which
// panel is open, card values). Conversation content is not here: fixtures hold only its
// lengths (O2), so Gate A measures the frame around the transcript. A captured state with
// no scene here scores 0 in Gate A: that is the backlog, not an error.
const oracle: Scene = {
  bots: [{name: 'Grookie', main: true}, {name: 'Oracle'}],
  active: 'Oracle',
  panelOpen: true,
  computer: 'Asleep',
  voice: {voice: 'Helix', speed: '1x', language: 'Auto-detect'},
}

export const scenes: Record<string, Scene> = {
  'oracle-turn-1040': oracle,
  // The same screen at other window widths (the gate sets the width from the fixture).
  'oracle-main-1280': oracle,
  'oracle-main-1600': oracle,
  'oracle-panel-closed': {...oracle, panelOpen: false},
  'oracle-library': {...oracle, tab: 'library'},
}
