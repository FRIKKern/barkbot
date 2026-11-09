// The lists the overlays show, as captured (fixtures/states/oracle-*.json). Labels are UI text
// and are kept 1:1 (0005). A list only partly on screen when captured holds what was on screen;
// the rest needs a capture scrolled to the end (see the voice and language notes).

export const speeds = ['0.5x', '0.75x', '1x', '1.25x', '1.5x', '2x']

// oracle-voice-picker: the list holds 28 voices (scroll height 1074 = 6 + 28 x 38 - 2 + 6); the
// first 16 were on screen. Liora carries a 14 pt mark left of its preview button.
export const voices = [
  'Altair',
  'Ara',
  'Atlas',
  'Aurora',
  'Carina',
  'Castor',
  'Celeste',
  'Cosmo',
  'Eve',
  'Helios',
  'Helix',
  'Iris',
  'Kepler',
  'Leo',
  'Liora',
  'Lumen',
]
export const markedVoices = new Set(['Liora'])

// oracle-language-picker: 29 entries (scroll height 938 = 6 + 29 x 32 - 2 + 6); 17 were on screen.
export const languages = [
  'Auto-detect',
  'English',
  'Arabic (Egypt)',
  'Arabic (Saudi Arabia)',
  'Arabic (United Arab Emirates)',
  'Bengali',
  'Catalan',
  'Chinese (Simplified)',
  'Danish',
  'Dutch',
  'Finnish',
  'French',
  'German',
  'Hindi',
  'Hungarian',
  'Indonesian',
  'Italian',
]

// oracle-new-bot-dialog: 13 shapes in rows of 5, 5, 3; 11 colours in rows of 6, 5. The oracle
// opened with hex and Blue picked. Swatch colours are the captured backgrounds (Black shows white
// on the dark sheet).
export const shapeRows = [
  ['blob', 'cloud', 'square', 'sparkle', 'clover'],
  ['heart', 'flower', 'teardrop', 'tablet', 'wedge'],
  ['house', 'star', 'hex'],
]
export const colours: [string, string][] = [
  ['Black', 'rgb(255, 255, 255)'],
  ['Brown', 'rgb(161, 107, 57)'],
  ['Red', 'rgb(252, 44, 62)'],
  ['Orange', 'rgb(249, 103, 14)'],
  ['Yellow', 'rgb(246, 148, 18)'],
  ['Green', 'rgb(20, 195, 112)'],
  ['Cyan', 'rgb(19, 184, 163)'],
  ['Blue', 'rgb(24, 132, 252)'],
  ['Violet', 'rgb(144, 90, 251)'],
  ['Magenta', 'rgb(251, 52, 153)'],
  ['Gray', 'rgb(119, 119, 119)'],
]

// The account menu's usage line as captured; real usage replaces it when the menu is wired.
export const weeklyUsage = '12% used'

// oracle-connect-apps: the filters and the sections on screen when captured. App names are
// third-party product names: text only, never their logos (neutral tiles stand in). Only
// 1Password's Connect carries its own label in the oracle; the others are named by their text.
export const appCategories = ['All', 'Password Managers', 'Productivity', 'Communication', 'Design', 'Code']
export const appSections: {title: string; viewAll: boolean; apps: string[]}[] = [
  {title: 'Recommended for you', viewAll: true, apps: ['Datadog', 'Vercel', 'Supabase', 'Cloudflare', 'Sentry', 'Firebase']},
  {title: 'Password Managers', viewAll: false, apps: ['1Password']},
  {title: 'Productivity', viewAll: true, apps: ['Notion', 'Atlassian', 'Google Docs', 'Canva']},
]
export const labelledConnect = new Set(['1Password'])

// oracle-settings: the sections of the settings sidebar.
export const settingsSections = ['General', 'Computer', 'Permissions', 'Vault', 'Usage & Billing', 'Updates']
