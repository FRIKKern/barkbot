import {oracle} from './oracle'
import {transcripts} from '../transcripts'
import {filler} from '../../chat/turn'
import {scenePicture} from '../../components/Cards'
import {timeAbove, todayAt} from './today'

// fixtures/states/oracle-pictures-waiting.json (1.2.3): after the file was sent (its time row above
// it, as in oracle-file-sent), five pictures waiting (their names: listitems 164-185), the pointer on the second (only its
// remove button shows), and words typed (p 194: kept as a length, 43).
export default {
  ...oracle,
  transcript: {bubbles: timeAbove(transcripts['pictures-waiting'], 1, todayAt(20, 21))},
  composer: {draft: filler(43), pictures: ['red', 'green', 'blue', 'yellow', 'purple'].map((c, i) => ({name: `${c}.png`, data: '', src: scenePicture(`scene:${i}`)}))},
}
