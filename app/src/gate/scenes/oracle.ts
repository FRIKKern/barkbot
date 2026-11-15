import type {Scene} from '../../components/Shell'
import {transcripts} from '../transcripts'

// The oracle bot's screen as captured (fixtures/states/oracle-turn-1040.json): the base most scenes start from.
export const oracle: Scene = {
  // Ids are the stand-in names: a scene's bots are labels only (O2); the live page's ids are its own.
  bots: [{id: 'Grookie', name: 'Grookie', main: true}, {id: 'Oracle', name: 'Oracle'}],
  active: 'Oracle',
  panelOpen: true,
  computer: 'Asleep',
  voice: {voice: 'Helix', speed: '1x', language: 'Auto-detect'},
  // The preview's line is the bot's last message: the fixture keeps only its length (9), so a placeholder.
  previews: {Oracle: 'Last note'},
  // The long conversation behind most captured states, scrolled to its end (gate/transcripts.ts).
  transcript: {bubbles: transcripts.main},
}
