import {oracle} from './oracle'
import {transcripts} from '../transcripts'
import {todayAt} from './today'

// fixtures/states/oracle-choice-answered.json (oracle 1.0.3, a version exception: scripts/lib/versions.mjs):
// the question answered with B, and the bot's reply under it.
export default {...oracle, transcript: {bubbles: transcripts['choice-answered'], time: todayAt(10, 1)}}
