import {oracle} from './oracle'
import {transcripts} from '../transcripts'

// fixtures/states/oracle-file-waiting.json (oracle 1.0.3, a version exception: scripts/lib/versions.mjs):
// a file waiting in the composer with words typed. Name, size and words are the capture's own
// labels (spans 174-176, p 185: the recipe's made-up file, no conversation text).
export default {
  ...oracle,
  transcript: {bubbles: transcripts['file-waiting']},
  composer: {draft: 'What does this file say?', files: [{name: 'oracle-note.txt', size: '25B'}]},
}
