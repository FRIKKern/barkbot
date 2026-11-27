import {conversationOf} from './oracle'

// fixtures/states/oracle-picture-viewer.json (1.3.0): the five pictures' second tile pressed; the
// viewer open over the conversation at the second picture ("2 / 5").
export default {...conversationOf('picture-viewer'), viewer: {at: 1}}
