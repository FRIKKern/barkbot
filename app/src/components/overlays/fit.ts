// Words where the stand-in face runs more than Gate A's 1 pt off the oracle's carry their own
// tracking, so the box matches (the same remedy as parts.tsx's fit, for the views' words; a word that sits in one place only
// goes in parts.tsx's table instead).
// Each value is the base tracking minus the measured gap divided over the word's characters;
// a word can sit in more than one place, so each place has its own table.
type Table = Record<string, string>

// App names, 13/18 weight 500 on 0.195px (oracle-connect-apps).
export const APP: Table = {
  Datadog: '-0.091px',
  Vercel: '-0.005px',
  Supabase: '-0.03px',
  Cloudflare: '-0.075px',
  Sentry: '-0.072px',
  Firebase: '-0.043px',
  '1Password': '-0.205px',
  Notion: '-0.072px',
  Atlassian: '-0.149px',
  Google: '0.013px',
  Canva: '-0.065px',
  'Google Docs': '0.013px',
}
// Section titles, 14/20 weight 500 on 0.14px.
export const SECTION: Table = {'Recommended for you': '0.008px', 'Password Managers': '-0.16px', Productivity: '-0.26px'}
// Category filters, 13/18 on 0.195px.
export const CATEGORY: Table = {All: '0.028px', 'Password Managers': '0.118px', Productivity: '0.128px', More: '-0.28px'}
// Settings words (oracle-settings).
export const SETTINGS: Table = {
  Permissions: '0.095px',
  'Usage & Billing': '0.082px',
  'Unlock the ultimate AI subscription': '-0.089px',
  'Add account': '0.204px',
  'Check Spelling While Typing': '0.147px',
  // The other pages (oracle-settings-computer, -permissions, -updates). h3 12/16 on 0.12px,
  // labels 13/18 on 0.195px, the select's value on -0.08px.
  'Your computer': '0.028px', // 1.2 pt too wide
  "Bot's computer": '-0.037px', // 2.2 pt too wide
  'Always allow': '-0.172px', // 1.1 pt too wide
  'Route traffic through this computer': '0.164px', // 1.1 pt too wide
  "Update Bot's Computer": '0.109px', // 1.8 pt too wide
  'Your computer is on the latest version': '0.127px', // 2.6 pt too wide
  "Reset Bot's Computer": '0.105px', // 1.8 pt too wide
  'Always Ask': '-0.06px', // 1.8 pt too wide
  'Allow without Asking': '0.005px', // 2.3 pt too wide
  'Add Rule': '0.045px', // 0.6 pt too wide (on 0.12px)
  'Grok Bot Updates': '0.008px', // 1.8 pt too wide
  '0.79.3': '0.478px', // 1.7 pt too narrow
}

export const fit = (table: Table, word: string) => (table[word] ? {letterSpacing: table[word]} : undefined)
