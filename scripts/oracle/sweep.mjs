// The capture sweep: every oracle state that can be reached by LOOKING, captured into
// fixtures/states/. Each recipe opens one thing (a tab, a menu, a picker, a dialog, a width),
// captures it, and puts the screen back; the sweep checks the screen came back before the next.
// Nothing here sends, shares, connects, creates, approves or wakes a computer (O1, O3).
//
//   node scripts/oracle/sweep.mjs [--only <id>] [--hovers] [--followups] [--list] [--settle <ms>]
//
// Personal data never lands in a fixture (O2): any text that looks like an e-mail address,
// and everything in the account menu that is not a menu item, is kept as a length only.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { connect } from './cdp.mjs';
import { activeBot, ORACLE_BOT } from './recipes.mjs';
import { collect } from './collect.mjs';
import { controls, namedElements } from '../lib/controls.mjs';
import { path } from '../lib/data.mjs';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
// How long a changed screen must sit before the capture: some panels animate their height for longer.
const SETTLE = args.includes('--settle') ? Number(args[args.indexOf('--settle') + 1]) : 600;
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

// The only controls the sweep may press. Anything else is refused, by name.
const MAY_PRESS = new Set(['View conversation details', 'Library', 'Activity', 'Composer actions', 'Open account menu', 'New Bot', 'Voice', 'Speed', 'Language', 'Close', 'Connect apps', 'Edit Bot avatar', 'Settings', 'Get Grok Bot for mobile']);
// Names NEVER would refuse that only open a view: 'Connect apps' opens the list; each row's own Connect stays refused.
const OPENS_ONLY = new Set(['Close', 'Connect apps']);
const NEVER = /send|share|connect|approve|allow|create|add to|delete|remove|invite|upgrade|sign out|log out|wake|start voice/i;

// [id, what it shows, steps to open, steps to close]. A step: {press: name} | {key: 'Escape'} | {width: n}.
const SWEEP = [
  ['oracle-main-1280', 'the main view, 1280 wide', [{ width: 1280 }], [{ width: null }]],
  ['oracle-main-1600', 'the main view, 1600 wide', [{ width: 1600 }], [{ width: null }]],
  // At 720 the oracle closes its details panel by itself, and it stays closed when the width comes back.
  ['oracle-main-720', 'the main view, 720 wide (the panel closes itself)', [{ width: 720 }], [{ width: null }, { panelOpen: true }]],
  ['oracle-main-880', 'the main view, 880 wide', [{ width: 880 }], [{ width: null }]],
  ['oracle-main-2000', 'the main view, 2000 wide', [{ width: 2000 }], [{ width: null }]],
  ['oracle-panel-closed', 'details panel closed', [{ press: 'View conversation details' }], [{ press: 'View conversation details' }]],
  ['oracle-library', 'details panel, Library tab', [{ press: 'Library' }], [{ press: 'Activity' }]],
  ['oracle-composer-menu', 'the composer actions menu', [{ press: 'Composer actions' }], [{ key: 'Escape' }]],
  ['oracle-account-menu', 'the account menu', [{ press: 'Open account menu' }], [{ key: 'Escape' }], { privateMenu: true }],
  ['oracle-voice-picker', 'the Voice picker open', [{ press: 'Voice' }], [{ key: 'Escape' }]],
  ['oracle-speed-picker', 'the Speed picker open', [{ press: 'Speed' }], [{ key: 'Escape' }]],
  ['oracle-language-picker', 'the Language picker open', [{ press: 'Language' }], [{ key: 'Escape' }]],
  ['oracle-new-bot-dialog', 'the Create New Bot dialog, empty', [{ press: 'New Bot' }], [{ key: 'Escape' }]],
];

// Hover states: the pointer resting on one control of the main view (1040), nothing pressed.
// A hover fixture keeps the whole screen, plus `pointer` (which control) and `changed` (the keys
// whose box or look differ from the same screen with the pointer parked): Gate A scores only those.
const HOVER = ['New Bot', 'Connect apps', 'Open account menu', 'View conversation details', 'Share', 'Composer actions', 'Start voice input', 'Start voice chat', 'Close', 'Edit Bot avatar', 'Bot name', 'Activity', 'Library', 'Add to Slack', 'Create a routine', "Bot's computer", 'Voice', 'Speed', 'Language', 'Prompt'];
const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Bot tile #2 is Oracle's. #1 is the owner's real bot and is never touched, not even hovered (O1).
for (const [name, nth] of [...HOVER.map((n) => [n, 0]), ['Bot tile', 1]])
  SWEEP.push([`oracle-hover-${slug(name)}${name === 'Bot tile' ? `-${nth + 1}` : ''}`, `pointer over ${name}${name === 'Bot tile' ? ` #${nth + 1}` : ''}`, [{ hover: name, nth }], [{ park: true }], { keepPointer: true, diff: true, pointer: { over: name, nth } }]);
// Overlay follow-ups. A recipe with { diff: true } keeps `changed`: the keys its LAST step changed.
// Not here, on purpose: the account menu's first row opens a usage submenu with the owner's spend
// (never captured, O2); the pickers did not scroll for a wheel over the listbox, and the composer
// menu's first row and the Speed picker's first option show no hover to a pointer move: all need a better recipe before they are tried again.
SWEEP.push(
  // A typed name, never Create: Escape discards it.
  ['oracle-new-bot-named', 'Create New Bot with a name typed', [{ press: 'New Bot' }, { type: 'Test' }], [{ key: 'Escape' }], { diff: true }],
);
const only2 = args.includes('--hovers');
const only3 = args.includes('--followups');
// Second-level views: look only, closed with Escape. Captured with --out first and read before any is kept.
SWEEP.push(
  ['oracle-connect-apps', 'the Connect apps list', [{ press: 'Connect apps' }], [{ key: 'Escape' }]],
  ['oracle-edit-avatar', 'the Bot avatar editor', [{ press: 'Edit Bot avatar' }], [{ key: 'Escape' }]],
  ['oracle-settings', 'Settings, from the account menu', [{ press: 'Open account menu' }, { press: 'Settings' }], [{ key: 'Escape' }], { privateMenu: true }],
  ['oracle-get-mobile', 'Get Grok Bot for mobile, from the account menu', [{ press: 'Open account menu' }, { press: 'Get Grok Bot for mobile' }], [{ key: 'Escape' }], { privateMenu: true }],
);
const out2 = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const only4 = args.includes('--views');

if (args.includes('--list')) { for (const [id, what] of SWEEP) console.log(`${id}  ${what}`); process.exit(0); }

const page = await connect();
const bot = await activeBot(page);
if (bot !== ORACLE_BOT) throw new Error(`refusing: the open bot is "${bot}", not "${ORACLE_BOT}" (O1)`);
const W0 = await page.evaluate(() => [innerWidth, innerHeight]);
// The oracle's own version: a Grok update can move any number, so every capture names it.
const version = await page.evaluate(() => navigator.userAgent.match(/(Grok[ \w]*)\/([\d.]+)/)?.slice(1).join(' ') ?? navigator.userAgent.match(/Electron\/[\d.]+/)?.[0] ?? null);
// The screen's signature: its controls by name, and every open list, menu or dialog.
// 'Hide' (Suggested) comes and goes with the pointer over the window, so it is not part of the signature.
const names = async () => { const st = await page.evaluate(collect); return [...new Set(controls(st).map((c) => c.name).filter((n) => n !== 'Hide'))].sort().join('|') + '#' + st.elements.filter((e) => ['listbox', 'option', 'menu', 'menuitem', 'dialog'].includes(e.role)).length; };
// Every recipe starts from the captured base: Oracle open with its details panel open. Grok remembers a
// closed panel across launches, and a sweep that once stopped mid-recipe can leave it closed.
if (!controls(await page.evaluate(collect)).some((c) => c.name === 'Close')) {
  console.log('the details panel was closed: opening it first (the base every recipe starts from)');
  await press('View conversation details');
  await wait(SETTLE);
}
const base = await names();

// A real pointer press at the control's centre (menus open on pointerdown, not on click()).
async function press(name) {
  if (!MAY_PRESS.has(name) || (NEVER.test(name) && !OPENS_ONLY.has(name))) throw new Error(`refusing to press "${name}": not on the sweep's list`);
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
  if (s.park) return park();
  if (s.panelOpen) { // open the details panel only if it is still closed, then let it finish moving
    await wait(1000);
    if (!controls(await page.evaluate(collect)).some((c) => c.name === 'Close')) await press('View conversation details');
    return wait(1000);
  }
  if (s.type) { await page.send('Input.insertText', { text: s.type }); return wait(SETTLE); }
  if (s.wheel || s.hoverRole) {
    const el = (await page.evaluate(collect)).elements.find((e) => e.role === (s.wheel || s.hoverRole) && e.box[2] > 0 && e.box[3] > 0);
    if (!el) throw new Error(`no ${s.wheel || s.hoverRole} on screen`);
    const [x, y, w, h] = el.box;
    execFileSync('open', ['-a', 'Grok Bot']);
    await page.send('Page.bringToFront');
    if (s.hoverRole) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + w / 2, y: y + Math.min(h, 32) / 2 });
    else for (let i = 0; i < 10; i++) { await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: x + w / 2, y: y + h / 2, deltaX: 0, deltaY: 400 }); await wait(80); }
    return wait(SETTLE);
  }
  if (s.hover) {
    const hit = controls(await page.evaluate(collect)).filter((c) => c.name === s.hover);
    if (!hit[s.nth ?? 0]) throw new Error(`"${s.hover}" #${(s.nth ?? 0) + 1}: no such control`);
    const [x, y, w, h] = hit[s.nth ?? 0].e.box;
    execFileSync('open', ['-a', 'Grok Bot']);
    await page.send('Page.bringToFront');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + w / 2, y: y + h / 2 });
    return wait(SETTLE);
  }
  const before = await names();
  if (s.press) await press(s.press);
  else if (s.key) for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: s.key, code: s.key, windowsVirtualKeyCode: 27 });
  else if ('width' in s) {
    if (s.width === null) await page.send('Emulation.clearDeviceMetricsOverride');
    else await page.send('Emulation.setDeviceMetricsOverride', { width: s.width, height: W0[1], deviceScaleFactor: 0, mobile: false });
    const want = s.width ?? W0[0];
    for (let t = 0; t < 30 && (await page.evaluate(() => innerWidth)) !== want; t++) await wait(100);
    return wait(SETTLE);
  }
  for (let t = 0; t < 30; t++) { await wait(100); if ((await names()) !== before) return wait(SETTLE); } // 600 default: the slowest measured move is 300 ms
  throw new Error(`${JSON.stringify(s)} changed nothing on screen in 3 s; stopping`);
}

// Before a capture the pointer rests in the bottom-right corner, 8 pt in: blank in every captured
// layout (the details panel, or beside the composer when the panel is closed). A pointer left on a
// control would capture its hover look (oracle-main-1280 caught Composer actions hovered).
let parkedAt = null;
async function park() {
  const [w, h] = await page.evaluate(() => [innerWidth, innerHeight]);
  parkedAt = [w - 8, h - 8];
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: w - 8, y: h - 8 });
  await wait(400);
}

// The owner's own name (this Mac's account name, git's user.name) and account counts never land in a fixture.
const PEOPLE = [() => execFileSync('id', ['-F'], { encoding: 'utf8' }), () => execFileSync('git', ['config', 'user.name'], { encoding: 'utf8' })]
  .map((f) => { try { return f().trim(); } catch { return ''; } }).filter((n) => n.length > 2);
const ACCOUNT_FACT = /^\d+ connected$/;

function redact(state, privateMenu) {
  const els = state.elements;
  const inMenu = (e) => { let p = e; while (p) { if (p.role === 'menu') return p; p = p.parent === undefined ? null : els[p.parent]; } return null; };
  for (const e of els) {
    if (!e.text) continue;
    // Inside a menu item: a label of the app's ("Settings"). Elsewhere in the account menu: the person's own (name, plan).
    const inItem = (x) => { let p = x; while (p) { if (p.role === 'menuitem' || p.role === 'menuitemradio' || p.role === 'menuitemcheckbox') return true; p = p.parent === undefined ? null : els[p.parent]; } return false; };
    // A bot's chat preview (hover on its tile) shows its last message: keep only the bot's name.
    const inPreview = (x) => { let p = x; while (p) { if (p.role === 'dialog' && / chat preview$/.test(p.label || '')) return p; p = p.parent === undefined ? null : els[p.parent]; } return null; };
    const pv = inPreview(e);
    const priv = PEOPLE.some((n) => e.text.includes(n)) || ACCOUNT_FACT.test(e.text) || /@|\b[\w.-]+\.(com|no|ai|io|dev)\b/i.test(e.text) || (privateMenu && inMenu(e) && !inItem(e)) || (pv && e.text !== pv.label.replace(/ chat preview$/, ''));
    if (priv) { e.textLength = e.text.length; delete e.text; }
  }
  return state;
}

mkdirSync(path('fixtures', 'states'), { recursive: true });
let done = 0;
for (const [id, what, open, close, opts = {}] of SWEEP) {
  if (only && id !== only) continue;
  if (only2 && !id.startsWith('oracle-hover-')) continue;
  if (only3 && !/-(end|named|hover)$/.test(id)) continue;
  if (only4 && !['oracle-connect-apps', 'oracle-edit-avatar', 'oracle-settings', 'oracle-get-mobile'].includes(id)) continue;
  // diff recipes: capture the screen just before the last step, so `changed` names what it changed.
  for (const s of opts.diff ? open.slice(0, -1) : open) await step(s);
  let rest = null;
  if (opts.diff) { await park(); rest = new Map(namedElements(redact(await page.evaluate(collect), opts.privateMenu)).map((c) => [c.key, c.e])); await step(open.at(-1)); }
  if (!opts.keepPointer) await park();
  const state = redact(await page.evaluate(collect), opts.privateMenu);
  const out = { id, what, captured: new Date().toISOString().slice(0, 10), engine: 'electron', version, bot, ...state };
  if (opts.pointer) out.pointer = opts.pointer;
  // Where the pointer rested: some looks (the Suggested card's Hide) show only while it is over the window.
  else if (!opts.keepPointer && parkedAt) out.parked = parkedAt;
  if (opts.diff && !opts.pointer) out.act = open.at(-1); // Gate A replays it on ours: { wheel | type | hoverRole }
  if (rest) {
    const look = (e) => JSON.stringify([e.box.map((v) => Math.round(v * 10) / 10), e.style]);
    out.changed = namedElements(state).filter((c) => !rest.has(c.key) || look(rest.get(c.key)) !== look(c.e)).map((c) => c.key);
    if (!out.changed.length) { console.log(`${id}: the last step changes nothing visible; not kept`); for (const s of close) await step(s); continue; }
  }
  writeFileSync(out2 ? `${out2}/${id}.json` : path('fixtures', 'states', `${id}.json`), JSON.stringify(out) + '\n');
  if (shots) { const s = await page.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${shots}/${id}.png`, Buffer.from(s.data, 'base64')); }
  for (const s of close) await step(s);
  const now = await names();
  console.log(`${id}: ${state.elements.length} elements at ${state.viewport.slice(0, 2).join('x')} · ${what}${out.changed ? ` · changed: ${out.changed.join(', ')}` : ''}`);
  if (now !== base) { const [a, b] = [base, now].map((x) => new Set(x.split(/[|#]/))); throw new Error(`the screen did not come back after ${id}; stopping. Gone: ${[...a].filter((x) => !b.has(x)).join(', ') || '-'}; new: ${[...b].filter((x) => !a.has(x)).join(', ') || '-'}; overlay count ${base.split('#')[1]} → ${now.split('#')[1]}`); }
  done++;
}
console.log(`sweep: ${done} state(s) captured, screen restored each time`);
page.close();
