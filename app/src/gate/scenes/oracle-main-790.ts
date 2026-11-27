import {conversationOf} from './oracle'

// fixtures/states/oracle-main-790.json (1.3.0): the base scene, its conversation at this width. Below 800 no panel is
// drawn (Shell useNarrow), so the conversation takes the width the panel left.
export default conversationOf('main-790')
