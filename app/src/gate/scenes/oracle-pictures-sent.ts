import {oracle} from './oracle'
import {transcripts} from '../transcripts'

// fixtures/states/oracle-pictures-sent.json (1.2.3, second take): the file sent first, then five
// pictures; the time row above the file, the first take's answered question cut off at the top.
export default {...oracle, transcript: {bubbles: transcripts['pictures-sent']}}
