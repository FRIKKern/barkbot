import type {Scene} from '../../components/Shell'
import {lifts, transcripts} from '../transcripts'

// The oracle bot's screen as captured (fixtures/states/oracle-turn-1040.json): the base most scenes start from.
export const oracle: Scene = {
  // Ids are the stand-in names: a scene's bots are labels only (O2); the live page's ids are its own.
  bots: [{id: 'Grookie', name: 'Grookie', main: true}, {id: 'Oracle', name: 'Oracle'}],
  active: 'Oracle',
  panelOpen: true,
  computer: 'Asleep',
  voice: {voice: 'Helix', speed: 1, language: 'Auto-detect'},
  // The conversation behind the baseline's states as oracle-turn-1040 shows it, scrolled to its end
  // (gate/transcripts.ts, from the 1.3.0 captures).
  transcript: {bubbles: transcripts.main},
}

/** Settings > Computer reads "Last opened 13 minutes ago" in the captures: the computer was last
 *  heard from 13 minutes before the state was taken. A scene gets it as `seen`, the same field the
 *  live page fills from Barkpark's last_seen_at, stamped when the scene is served (sceneFor): a time
 *  taken when this module loads would be as old as the dev server by the time a page draws it. */
export const seenAtCapture = (now = Date.now()) => new Date(now - 13 * 60_000).toISOString()

/** The base scene with the conversation as one captured state shows it: its column's paragraph
 *  heights and where its scroll was left (transcripts and lifts by the state's id less "oracle-"; a
 *  state with no entry shows it as main does). */
export const conversationOf = (key: string): Scene => ({...oracle, transcript: {bubbles: transcripts[key] ?? transcripts.main, lift: lifts[key]}})
