import {oracle} from './oracle'
import {transcripts} from '../transcripts'

// fixtures/states/oracle-picture-viewer-rest.json (1.2.3): the +3 tile pressed; the viewer open at
// the first picture that tile stands for, the third ("3 / 5").
export default {...oracle, transcript: {bubbles: transcripts['picture-viewer-rest']}, viewer: {at: 2}}
