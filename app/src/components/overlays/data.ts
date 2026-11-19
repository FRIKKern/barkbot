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
// so this is a placeholder of that length; real usage replaces it when the menu is wired. The
// menu's width follows this text.
export const weeklyUsage = '–% used'

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
