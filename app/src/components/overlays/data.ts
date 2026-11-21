// The lists the overlays show, as captured (fixtures/states/oracle-*.json). Labels are UI text
// and are kept 1:1 (0005). A list only partly on screen when captured holds what was on screen;
// the rest came from a capture scrolled to the end.

// The Voice dialog (Grok 1.2.3, decision 0010): a speed slider over a grid of voices, two to a row.
// 28 voices, as the oracle lists them (fixtures/oracle-1.2.3/traces/2026-11-19-voice-picker.json,
// opened.rows; oracle-voice-picker-start, -picker and -end show them on screen).
export const voices: [name: string, line: string][] = [
  ['Altair', 'Elegant & refined'],
  ['Ara', 'Warm & friendly'],
  ['Atlas', 'Firm & reassuring'],
  ['Aurora', 'Serene & steady'],
  ['Carina', 'Soft & empathetic'],
  ['Castor', 'Easygoing & real'],
  ['Celeste', 'Caring & confident'],
  ['Cosmo', 'Bright & curious'],
  ['Eve', 'Energetic & upbeat'],
  ['Helios', 'Upbeat & versatile'],
  ['Helix', 'Bold & dynamic'],
  ['Iris', 'Friendly & charming'],
  ['Kepler', 'Witty & inventive'],
  ['Leo', 'Strong & assured'],
  ['Liora', 'Calm & grounded'],
  ['Lumen', 'Warm & articulate'],
  ['Luna', 'Gentle & patient'],
  ['Lux', 'Quiet & wise'],
  ['Naksh', 'Warm & thoughtful'],
  ['Orion', 'Rich & cinematic'],
  ['Perseus', 'Strong & trusted'],
  ['Rex', 'Confident & clear'],
  ['Rigel', 'Crisp & composed'],
  ['Sal', 'Smooth & balanced'],
  ['Sirius', 'Clever & playful'],
  ['Ursa', 'Friendly & warm'],
  ['Zagan', 'Deep & dramatic'],
  ['Zenith', 'Sharp & focused'],
]
// Helix and Liora carry a 16 pt mark at the card's top left (img 734.5,310.5 and 734.5,494.5).
export const markedVoices = new Set(['Helix', 'Liora'])

// The Speed slider (the voice-picker trace): a range input 0 to 15, step 1; 5 reads "1.0x" and 6
// "1.1x" (its aria-valuetext too), so a step is 0.1x and the range 0.5x to 2.0x (the ends inferred).
export const SPEED = {min: 0, max: 15, at: (step: number) => Math.round((0.5 + step * 0.1) * 10) / 10, step: (speed: number) => Math.round((speed - 0.5) * 10)}
export const speedText = (speed: number) => `${speed.toFixed(1)}x`

// oracle-language-picker and -end: 29 entries (scroll height 938 = 6 + 29 x 32 - 2 + 6).
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
  'Japanese',
  'Korean',
  'Polish',
  'Portuguese (Brazil)',
  'Portuguese (Portugal)',
  'Russian',
  'Spanish (Mexico)',
  'Spanish (Spain)',
  'Swedish',
  'Thai',
  'Turkish',
  'Vietnamese',
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

// The account menu's usage line. The fixtures redact it (O2: a textLength of 7 only),
// so this is a placeholder of that length; real usage replaces it when the menu is wired.
export const weeklyUsage = '–% used'

// oracle-connect-apps (1.2.3): the filters and the sections on screen when captured. App names are
// third-party product names: text only, never their logos (a tile of the captured colour stands in).
// This Mac's apps carry a line under the name, and Location's action is Open settings.
export const appCategories = ['All', 'Mac', 'Password Managers', 'Productivity', 'Communication', 'Design']
export type App = {name: string; tile?: string; desc?: string; action?: string}
export type AppSection = {title: string; viewAll: boolean; mac?: boolean; apps: App[]}
export const appSections: AppSection[] = [
  {
    title: 'Recommended for you',
    viewAll: true,
    apps: [
      {name: 'Browserless', tile: 'rgb(13, 15, 18)'},
      {name: 'incident.io', tile: 'rgb(243, 85, 51)'},
      {name: 'Turso', tile: 'rgb(43, 44, 49)'},
      {name: 'Lightrun', tile: 'rgb(27, 153, 248)'},
      {name: 'Knock', tile: 'rgb(38, 38, 38)'},
      {name: 'Google Drive', tile: 'rgb(255, 255, 255)'},
    ],
  },
  {
    title: 'This Mac',
    viewAll: false,
    mac: true,
    apps: [
      {name: 'Messages', desc: 'Read and reply to texts', tile: 'linear-gradient(rgb(76, 206, 109) 0%, rgb(48, 183, 82) 100%)'},
      {name: 'Notes', desc: 'Find and save notes', tile: 'linear-gradient(rgb(255, 210, 31) 0%, rgb(235, 188, 0) 100%)'},
      {name: 'Reminders', desc: 'Set and check reminders', tile: 'linear-gradient(rgb(255, 255, 255) 0%, rgb(235, 235, 235) 100%)'},
      {name: 'Calendar', desc: 'See your day and add events', tile: 'linear-gradient(rgb(255, 255, 255) 0%, rgb(235, 235, 235) 100%)'},
      {name: 'Location', desc: 'Find places near you', tile: 'linear-gradient(rgb(31, 138, 255) 0%, rgb(0, 112, 235) 100%)', action: 'Open settings'},
      {name: 'Contacts', desc: 'Look up the people you ask about', tile: 'linear-gradient(rgb(184, 184, 187) 0%, rgb(160, 160, 164) 100%)'},
    ],
  },
  // Below the fold on 1.2.3 (only this title is on screen); its row is as 0.79.3 showed it.
  {title: 'Password Managers', viewAll: false, apps: [{name: '1Password', tile: 'rgb(48, 49, 54)'}]},
]
export const labelledConnect = new Set(['1Password'])

// oracle-settings: the sections of the settings sidebar.
export const settingsSections = ['General', 'Computer', 'Permissions', 'Vault', 'Usage & Billing', 'Updates']
