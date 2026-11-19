import {oracle} from './oracle'
import {transcripts} from '../transcripts'
import {timeAbove, todayAt} from './today'

// fixtures/states/oracle-file-sent.json (1.2.3): the file sent, the bot's two replies under it. The
// sends were made days after the conversation before them, so a time row stands above the file
// (time 78, "Today 8:21 PM").
export default {...oracle, transcript: {bubbles: timeAbove(transcripts['file-sent'], 1, todayAt(20, 21))}}
