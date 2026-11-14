import {oracle} from './oracle'
import {transcripts} from '../transcripts'

// fixtures/states/oracle-file-sent.json (oracle 1.0.3, a version exception: scripts/lib/versions.mjs).
export default {...oracle, transcript: {bubbles: transcripts['file-sent']}}
