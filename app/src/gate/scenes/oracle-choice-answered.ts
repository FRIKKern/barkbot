import {oracle} from './oracle'
import {transcripts} from '../transcripts'

// fixtures/states/oracle-choice-answered.json (1.2.3): the question answered with B, and the bot's
// reply under it. No time row on screen, as in oracle-ask-choice.
export default {...oracle, transcript: {bubbles: transcripts['choice-answered']}}
