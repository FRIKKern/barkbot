// Capture one oracle state (H2): every visible element's box and look, to
// fixtures/states/<id>.json, plus a screenshot kept OUT of git (evidence).
// Conversation text is stored as a length; UI labels as text (O2).
// Usage: node scripts/oracle/capture.mjs <id> [--shot path.png]
import { writeFileSync, mkdirSync } from 'node:fs';
import { connect } from './cdp.mjs';
import { activeBot } from './recipes.mjs';
import { collect } from './collect.mjs';
import { path } from '../lib/data.mjs';

const args = process.argv.slice(2);
const id = args[0];
if (!id) throw new Error('usage: capture.mjs <id> [--shot file.png]');
const shotAt = args.includes('--shot') ? args[args.indexOf('--shot') + 1] : null;

const page = await connect();
const bot = await activeBot(page);
const state = await page.evaluate(collect);
if (bot !== 'Oracle') console.error(`note: the open bot is "${bot}"; only Oracle states belong in fixtures`);
const out = { id, captured: new Date().toISOString().slice(0, 10), engine: 'electron', bot, ...state };
mkdirSync(path('fixtures', 'states'), { recursive: true });
writeFileSync(path('fixtures', 'states', `${id}.json`), JSON.stringify(out) + '\n');
if (shotAt) {
  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(shotAt, Buffer.from(shot.data, 'base64'));
}
console.log(`fixtures/states/${id}.json: ${state.elements.length} elements at ${state.viewport.join('x')}${shotAt ? `, screenshot ${shotAt}` : ''}`);
page.close();
