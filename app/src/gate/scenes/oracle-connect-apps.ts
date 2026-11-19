import {oracle} from './oracle'

// fixtures/states/oracle-connect-apps.json: the main screen with the connect-apps view open over it.
// Captured on Thursday 2026-11-19, with Calendar's and Contacts' Connect under way.
export default {...oracle, overlay: 'connect-apps', apps: {today: '2026-11-19', connecting: ['Calendar', 'Contacts']}}
