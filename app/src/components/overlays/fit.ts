// Words where the stand-in face runs more than Gate A's 1 pt off the oracle's carry their own
// tracking, so the box matches (the same remedy as parts.tsx's fit, for the views' words; a word that sits in one place only
// goes in parts.tsx's table instead).
// Each value is the base tracking minus the measured gap divided over the word's characters;
// a word can sit in more than one place, so each place has its own table.
type Table = Record<string, string>

// App names, 13/18 weight 500 on 0.195px (oracle-connect-apps, 1.2.3).
export const APP: Table = {
  Browserless: '-0.105px', // 3.3 pt too wide
  Turso: '-0.305px', // 2.5 pt too wide
  Lightrun: '-0.18px', // 3 pt too wide
  Knock: '-0.185px', // 1.9 pt too wide
  'Google Drive': '-0.013px', // 2.5 pt too wide
  '1Password': '-0.205px',
}
// Section titles, 14/20 weight 500 on 0.14px.
export const SECTION: Table = {'Recommended for you': '0.008px', 'This Mac': '-0.46px', 'Password managers': '-0.16px'} // This Mac: 4.8 pt too wide; Password managers (1.3.0): 5.1
// Language labels, 14/20 on 0.14px (oracle-language-picker, 1.3.0). The widest sets the list's width (max-content).
export const LANGUAGE: Table = {'Arabic (United Arab Emirates)': '0.078px'} // 1.8 pt too wide
// Category filters, 13/18 on 0.195px.
export const CATEGORY: Table = {All: '0.028px', Productivity: '0.128px', More: '-0.28px'}
// Settings words (oracle-settings).
export const SETTINGS: Table = {
  Permissions: '0.095px',
  'Usage & billing': '0.095px', // 1.3.0: 1.5 pt too wide
  'Unlock the ultimate AI subscription': '-0.089px',
  'Add account': '0.204px',
  // The other pages (oracle-settings-computer, -permissions, -updates). h3 12/16 on 0.12px,
  // labels 13/18 on 0.195px, the select's value on -0.08px.
  'Your computer': '0.028px', // 1.2 pt too wide
  "Bot's computer": '-0.037px', // 2.2 pt too wide
  'Always allow': '-0.172px', // 1.1 pt too wide
  'Route traffic through this computer': '0.164px', // 1.1 pt too wide
  "Update Bot's computer": '0.109px', // 1.3.0: 1.8 pt too wide
  "Reset Bot's Computer": '0.105px', // 1.8 pt too wide
  // 1.3.0 (decision 0011), h3 on 0.12px. Check spelling while typing and Read texts fit at the base.
  'Always ask': '-0.1px', // 2.2 pt too wide
  'Allow without asking': '-0.005px', // 2.5 pt too wide
  'Grok Bot updates': '-0.005px', // 2 pt too wide
}

export const fit = (table: Table, word: string) => (table[word] ? {letterSpacing: table[word]} : undefined)
