import {oracle} from './oracle'
import {transcripts} from '../transcripts'

// fixtures/states/oracle-ask-choice.json (1.2.3): the bot's question waiting, three lettered
// choices, under the file and pictures sent before it. No time row on screen: the day's one sits
// above the file, scrolled out of sight.
export default {...oracle, transcript: {bubbles: transcripts['ask-choice']}}
