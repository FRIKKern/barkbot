import {conversationOf} from './oracle'

// fixtures/states/oracle-picture-viewer-rest.json (1.3.0): the +3 tile pressed; the viewer open at
// the first picture that tile stands for, the third ("3 / 5").
export default {...conversationOf('picture-viewer-rest'), viewer: {at: 2}}
