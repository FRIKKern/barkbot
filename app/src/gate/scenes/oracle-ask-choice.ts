import {oracle} from './oracle'
import {transcripts} from '../transcripts'
import {todayAt} from './today'

// fixtures/states/oracle-ask-choice.json (oracle 1.0.3, a version exception: scripts/lib/versions.mjs):
// the bot's question waiting, three lettered choices; its time row on screen (captured 2026-11-14, 10:01 AM).
export default {...oracle, transcript: {bubbles: transcripts['ask-choice'], time: todayAt(10, 1)}}
