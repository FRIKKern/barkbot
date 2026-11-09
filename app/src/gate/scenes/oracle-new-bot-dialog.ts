import {oracle} from './oracle'

// fixtures/states/oracle-new-bot-dialog.json: the Create New Bot dialog over the window at rest,
// the details panel open behind it (re-captured on 0.79.3; the 0.79.2 capture had it closed).
export default {...oracle, panelOpen: true, overlay: 'new-bot-dialog'}
