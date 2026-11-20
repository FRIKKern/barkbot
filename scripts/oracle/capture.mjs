// Capture one oracle state (H2): every visible element's box and look, to
// fixtures/states/<id>.json, plus a screenshot kept OUT of git (evidence).
// Conversation text is stored as a length; UI labels as text (O2).
// Usage: node scripts/oracle/capture.mjs <id> [--shot path.png] [--hover <control name> [--nth n]]
// --hover rests the pointer on that control first and records it as the state's `pointer` (Gate A does the same on ours).
// Without --hover the pointer is parked 8 pt in from the bottom-right corner and recorded as `parked`, as the sweep
// does: some looks (the Suggested card's Hide) show only while the pointer is over the window, and Gate A rests ours there too.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { connect } from './cdp.mjs';
import { activeBot } from './recipes.mjs';
import { collect } from './collect.mjs';
import { controls } from '../lib/controls.mjs';
import { path } from '../lib/data.mjs';

const args = process.argv.slice(2);
const id = args[0];
if (!id) throw new Error('usage: capture.mjs <id> [--shot file.png]');
const shotAt = args.includes('--shot') ? args[args.indexOf('--shot') + 1] : null;
const hover = args.includes('--hover') ? args[args.indexOf('--hover') + 1] : null;
const nth = args.includes('--nth') ? Number(args[args.indexOf('--nth') + 1]) : 0;

const page = await connect();
const bot = await activeBot(page);
if (hover) {
  const hit = controls(await page.evaluate(collect)).filter((c) => c.name === hover)[nth];
  if (!hit) throw new Error(`"${hover}" #${nth + 1}: no such control`);
  const [x, y, w, h] = hit.e.box;
  execFileSync('open', ['-a', 'Grok Bot']); // a hidden window does not paint its hover look
  await page.send('Page.bringToFront');
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + w / 2, y: y + h / 2 });
  await new Promise((ok) => setTimeout(ok, 600));
}
let parked = null;
if (!hover) {
  const [w, h] = await page.evaluate(() => [innerWidth, innerHeight]);
  parked = [w - 8, h - 8];
  execFileSync('open', ['-a', 'Grok Bot']);
  await page.send('Page.bringToFront');
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: parked[0], y: parked[1] });
  await new Promise((ok) => setTimeout(ok, 400));
}
const state = await page.evaluate(collect);
// The oracle's own version: a Grok update can move any number, so every capture names it (rule 6b).
const version = await page.evaluate(() => navigator.userAgent.match(/(Grok[ \w]*)\/([\d.]+)/)?.slice(1).join(' ') ?? null);
if (bot !== 'Oracle') console.error(`note: the open bot is "${bot}"; only Oracle states belong in fixtures`);
const out = { id, captured: new Date().toISOString().slice(0, 10), engine: 'electron', version, bot, ...state };
if (hover) out.pointer = { over: hover, nth };
else out.parked = parked;
mkdirSync(path('fixtures', 'states'), { recursive: true });
writeFileSync(path('fixtures', 'states', `${id}.json`), JSON.stringify(out) + '\n');
if (shotAt) {
  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(shotAt, Buffer.from(shot.data, 'base64'));
}
console.log(`fixtures/states/${id}.json: ${state.elements.length} elements at ${state.viewport.join('x')}${shotAt ? `, screenshot ${shotAt}` : ''}`);
page.close();
