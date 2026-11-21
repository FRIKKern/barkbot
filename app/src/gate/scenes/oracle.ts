import type {Scene} from '../../components/Shell'
import {filler} from '../../chat/turn'
import {lifts, transcripts} from '../transcripts'

// The oracle bot's screen as captured (fixtures/states/oracle-turn-1040.json): the base most scenes start from.
export const oracle: Scene = {
  // Ids are the stand-in names: a scene's bots are labels only (O2); the live page's ids are its own.
  bots: [{id: 'Grookie', name: 'Grookie', main: true}, {id: 'Oracle', name: 'Oracle'}],
  active: 'Oracle',
  panelOpen: true,
  computer: 'Asleep',
  // Settings > Computer reads "Last opened 13 minutes ago" in the capture: the computer was last
  // heard from 13 minutes before the scene opens, the same field the live page fills from Barkpark.
  seen: new Date(Date.now() - 13 * 60_000).toISOString(),
  voice: {voice: 'Helix', speed: 1, language: 'Auto-detect'},
  // The preview's line is the bot's last message: the fixture keeps only its length (185), so placeholder words.
  previews: {Oracle: filler(185)},
  // The conversation behind the baseline's states as oracle-turn-1040 shows it: a message carrying
  // two files, then the long answer, scrolled to its end (gate/transcripts.ts).
  transcript: {bubbles: transcripts.main},
}

/** The base scene with the conversation as one captured state shows it: its column's paragraph
 *  heights and where its scroll was left (transcripts and lifts by the state's id less "oracle-"; a
 *  state with no entry shows it as main does). */
export const conversationOf = (key: string): Scene => ({...oracle, transcript: {bubbles: transcripts[key] ?? transcripts.main, lift: lifts[key]}})
