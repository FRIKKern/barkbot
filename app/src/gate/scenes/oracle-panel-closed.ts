import {conversationOf} from './oracle'

// fixtures/states/oracle-panel-closed.json: the conversation in the 920 column the closed panel leaves.
export default {...conversationOf('panel-closed'), panelOpen: false}
