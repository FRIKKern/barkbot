import {oracle} from './oracle'
import {transcripts} from '../transcripts'

// fixtures/states/oracle-file-sent.json (1.2.3, second take): the file sent, the bot's two replies
// under it; the day's time row above the file ("Today 11:31 PM", a row of gate/transcripts.ts).
export default {...oracle, transcript: {bubbles: transcripts['file-sent']}}
