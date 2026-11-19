import {oracle} from './oracle'
import {transcripts} from '../transcripts'
import {timeAbove, todayAt} from './today'

// fixtures/states/oracle-pictures-sent.json (1.2.3): the file sent first, then five pictures; the
// time row above the file, as in oracle-file-sent.
export default {...oracle, transcript: {bubbles: timeAbove(transcripts['pictures-sent'], 1, todayAt(20, 21))}}
