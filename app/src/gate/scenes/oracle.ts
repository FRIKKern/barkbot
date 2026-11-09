import type {Scene} from '../../components/Shell'

// The oracle bot's screen as captured (fixtures/states/oracle-turn-1040.json): the base most scenes start from.
export const oracle: Scene = {
  bots: [{name: 'Grookie', main: true}, {name: 'Oracle'}],
  active: 'Oracle',
  panelOpen: true,
  computer: 'Asleep',
  voice: {voice: 'Helix', speed: '1x', language: 'Auto-detect'},
  // The preview's line is the bot's last message: the fixture keeps only its length (9), so a placeholder.
  previews: {Oracle: 'Last note'},
}
