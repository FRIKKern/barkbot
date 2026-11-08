// The capture sweep: every oracle state that can be reached by LOOKING, captured into
// fixtures/states/. Each recipe opens one thing (a tab, a menu, a picker, a dialog, a width),
// captures it, and puts the screen back; the sweep checks the screen came back before the next.
// Nothing here sends, shares, connects, creates, approves or wakes a computer (O1, O3).
//
//   node scripts/oracle/sweep.mjs [--only <id>] [--list]
//
// Personal data never lands in a fixture (O2): any text that looks like an e-mail address,
// and everything in the account menu that is not a menu item, is kept as a length only.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { connect } from './cdp.mjs';
import { activeBot, ORACLE_BOT } from './recipes.mjs';
import { collect } from './collect.mjs';
import { controls } from '../lib/controls.mjs';
import { path } from '../lib/data.mjs';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

// The only controls the sweep may press. Anything else is refused, by name.
const MAY_PRESS = new Set(['View conversation details', 'Library', 'Activity', 'Composer actions', 'Open account menu', 'New Bot', 'Voice', 'Speed', 'Language', 'Close']);
const NEVER = /send|share|connect|approve|allow|create|add to|delete|remove|invite|upgrade|sign out|log out|wake|start voice/i;

// [id, what it shows, steps to open, steps to close]. A step: {press: name} | {key: 'Escape'} | {width: n}.
const SWEEP = [
  ['oracle-main-1280', 'the main view, 1280 wide', [{ width: 1280 }], [{ width: null }]],
  ['oracle-main-1600', 'the main view, 1600 wide', [{ width: 1600 }], [{ width: null }]],
  ['oracle-panel-closed', 'details panel closed', [{ press: 'View conversation details' }], [{ press: 'View conversation details' }]],
  ['oracle-library', 'details panel, Library tab', [{ press: 'Library' }], [{ press: 'Activity' }]],
  ['oracle-composer-menu', 'the composer actions menu', [{ press: 'Composer actions' }], [{ key: 'Escape' }]],
  ['oracle-account-menu', 'the account menu', [{ press: 'Open account menu' }], [{ key: 'Escape' }], { privateMenu: true }],
  ['oracle-voice-picker', 'the Voice picker open', [{ press: 'Voice' }], [{ key: 'Escape' }]],
  ['oracle-speed-picker', 'the Speed picker open', [{ press: 'Speed' }], [{ key: 'Escape' }]],
  ['oracle-language-picker', 'the Language picker open', [{ press: 'Language' }], [{ key: 'Escape' }]],
  ['oracle-new-bot-dialog', 'the Create New Bot dialog, empty', [{ press: 'New Bot' }], [{ key: 'Escape' }]],
];

if (args.includes('--list')) { for (const [id, what] of SWEEP) console.log(`${id}  ${what}`); process.exit(0); }

const page = await connect();
const bot = await activeBot(page);
if (bot !== ORACLE_BOT) throw new Error(`refusing: the open bot is "${bot}", not "${ORACLE_BOT}" (O1)`);
const W0 = await page.evaluate(() => [innerWidth, innerHeight]);
// The oracle's own version: a Grok update can move any number, so every capture names it.
const version = await page.evaluate(() => navigator.userAgent.match(/(Grok[ \w]*)\/([\d.]+)/)?.slice(1).join(' ') ?? navigator.userAgent.match(/Electron\/[\d.]+/)?.[0] ?? null);
// The screen's signature: its controls by name, and every open list, menu or dialog.
const names = async () => { const st = await page.evaluate(collect); return [...new Set(controls(st).map((c) => c.name))].sort().join('|') + '#' + st.elements.filter((e) => ['listbox', 'option', 'menu', 'menuitem', 'dialog'].includes(e.role)).length; };
const base = await names();

// A real pointer press at the control's centre (menus open on pointerdown, not on click()).
async function press(name) {
  if (!MAY_PRESS.has(name) || NEVER.test(name) && name !== 'Close') throw new Error(`refusing to press "${name}": not on the sweep's list`);
  const state = await page.evaluate(collect);
  const hit = controls(state).filter((c) => c.name === name);
  if (hit.length !== 1) throw new Error(`"${name}": ${hit.length} controls by that name, need exactly 1`);
  const [x, y, w, h] = hit[0].e.box;
  // The oracle only takes pointer input while its window is in front.
  execFileSync('open', ['-a', 'Grok Bot']);
  await page.send('Page.bringToFront');
  await wait(300);
  const at = { x: x + w / 2, y: y + h / 2, button: 'left', clickCount: 1 };
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at });
}
// Every step must visibly change the screen (its controls, or the width) within 3 s, or the
// sweep stops: a press that did not take would capture the wrong state under the right name.
async function step(s) {
  const before = await names();
  if (s.press) await press(s.press);
  else if (s.key) for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: s.key, code: s.key, windowsVirtualKeyCode: 27 });
  else if ('width' in s) {
    if (s.width === null) await page.send('Emulation.clearDeviceMetricsOverride');
    else await page.send('Emulation.setDeviceMetricsOverride', { width: s.width, height: W0[1], deviceScaleFactor: 0, mobile: false });
    const want = s.width ?? W0[0];
    for (let t = 0; t < 30 && (await page.evaluate(() => innerWidth)) !== want; t++) await wait(100);
    return wait(600);
  }
  for (let t = 0; t < 30; t++) { await wait(100); if ((await names()) !== before) return wait(600); } // 600: the slowest measured move is 300 ms
  throw new Error(`${JSON.stringify(s)} changed nothing on screen in 3 s; stopping`);
}

function redact(state, privateMenu) {
  const els = state.elements;
  const inMenu = (e) => { let p = e; while (p) { if (p.role === 'menu') return p; p = p.parent === undefined ? null : els[p.parent]; } return null; };
  for (const e of els) {
    if (!e.text) continue;
    // Inside a menu item: a label of the app's ("Settings"). Elsewhere in the account menu: the person's own (name, plan).
    const inItem = (x) => { let p = x; while (p) { if (p.role === 'menuitem' || p.role === 'menuitemradio' || p.role === 'menuitemcheckbox') return true; p = p.parent === undefined ? null : els[p.parent]; } return false; };
    const priv = /@|\b[\w.-]+\.(com|no|ai|io|dev)\b/i.test(e.text) || (privateMenu && inMenu(e) && !inItem(e));
    if (priv) { e.textLength = e.text.length; delete e.text; }
  }
  return state;
}

mkdirSync(path('fixtures', 'states'), { recursive: true });
let done = 0;
for (const [id, what, open, close, opts = {}] of SWEEP) {
  if (only && id !== only) continue;
  for (const s of open) await step(s);
  const state = redact(await page.evaluate(collect), opts.privateMenu);
  const out = { id, what, captured: new Date().toISOString().slice(0, 10), engine: 'electron', version, bot, ...state };
  writeFileSync(path('fixtures', 'states', `${id}.json`), JSON.stringify(out) + '\n');
  if (shots) { const s = await page.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${shots}/${id}.png`, Buffer.from(s.data, 'base64')); }
  for (const s of close) await step(s);
  const now = await names();
  console.log(`${id}: ${state.elements.length} elements at ${state.viewport.slice(0, 2).join('x')} · ${what}`);
  if (now !== base) throw new Error(`the screen did not come back after ${id}; stopping. Controls now differ from the start.`);
  done++;
}
console.log(`sweep: ${done} state(s) captured, screen restored each time`);
page.close();
