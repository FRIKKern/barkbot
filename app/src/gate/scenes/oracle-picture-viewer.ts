import {oracle} from './oracle'
import {transcripts} from '../transcripts'

// fixtures/states/oracle-picture-viewer.json (1.2.3): the five pictures' second tile pressed; the
// viewer open over the conversation at the second picture ("2 / 5").
export default {...oracle, transcript: {bubbles: transcripts['picture-viewer']}, viewer: {at: 1}}
