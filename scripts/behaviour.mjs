// Behaviour: what the frame DOES, rule by rule, as the oracle traces show it. Gate A measures a
// still screen; this drives ours with real CDP mouse, key and focus events and checks each rule.
// Every rule is checked next to a control, which shows the check can fail: the rule's effect is
// absent before the gesture, or a near-miss gesture does not cause it.
//
//   node scripts/behaviour.mjs          start the app and a headless Chrome, run every rule, stop both
//   node scripts/behaviour.mjs --url http://localhost:3170   use an app that is already running
//
// Exits 1 if any rule fails, or if a precondition does not hold (then nothing was measured).
// The app it starts talks to a stand-in Barkpark (below), never a real one.
// Sources: traces/2026-11-09-rename.json, traces/2026-11-09-unread.json,
// traces/2026-11-09-long-answer.json (all Grok 0.79.3).
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createServer as httpServer } from 'node:http';
import { mkdirSync, rmSync } from 'node:fs';
import { connect } from './oracle/cdp.mjs';
import { path } from './lib/data.mjs';

const args = process.argv.slice(2);
const opt = (k) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
const freePort = () => new Promise((ok, no) => { const s = createServer().once('error', no).listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); });
const APP_PORT = await freePort(), CHROME_PORT = await freePort();
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = path('.cache', `behaviour-chrome-${CHROME_PORT}`);
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function until(fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { if (await fn()) return; } catch {} await wait(200); }
  throw new Error(`timed out waiting for ${what}`);
}
const kids = [];
process.on('exit', () => { kids.forEach((k) => { try { k.kill('SIGTERM'); } catch {} }); try { rmSync(PROFILE, { recursive: true, force: true }); } catch {} });
process.on('SIGINT', () => process.exit(130));

// A stand-in Barkpark for the live page (/): it answers what loadChat asks (no computer enrolled;
// the saved bot name) and keeps every write, so the rename-persists rules can count them.
const stub = { name: null, reads: 0, writes: [], other: [] };
const PREF = '/w/default/p/default/v1/prefs/production/barkbot.bot';
const STUB_PORT = await freePort();
await new Promise((ok) => httpServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const json = (code, v) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
    if (req.url === PREF && req.method === 'GET') { stub.reads++; return json(200, { key: 'barkbot.bot', dataset: 'production', value: stub.name === null ? null : { name: stub.name } }); }
    if (req.url === PREF && req.method === 'PUT') { const { value } = JSON.parse(body); stub.writes.push(value); stub.name = value?.name ?? null; return json(200, { key: 'barkbot.bot', dataset: 'production', value }); }
    if (req.url.startsWith('/w/default/v1/chat-hosts')) return json(200, { hosts: [] });
    stub.other.push(`${req.method} ${req.url}`);
    json(404, { error: { code: 'not_found', message: 'not in the stand-in' } });
  });
}).listen(STUB_PORT, '127.0.0.1', ok));

let base = opt('url');
if (!base) {
  base = `http://localhost:${APP_PORT}`;
  const env = { ...process.env, BARKPARK_URL: `http://127.0.0.1:${STUB_PORT}`, BARKPARK_TOKEN: 'stand-in', BARKPARK_WORKSPACE: 'default', BARKPARK_PROJECT: 'default', BARKPARK_DATASET: 'production', BARKBOT_NAME: 'BarkBot' };
  kids.push(spawn('pnpm', ['-s', 'dev', '--port', String(APP_PORT), '--strictPort'], { cwd: path('app'), stdio: 'ignore', env }));
  await until(async () => (await fetch(base)).status > 0, 90000, `the app on ${base}`);
}
mkdirSync(PROFILE, { recursive: true });
kids.push(spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${CHROME_PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1040,760', 'about:blank'], { stdio: 'ignore' }));
await until(async () => (await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`)).ok, 30000, 'Chrome');
const page = await connect(undefined, CHROME_PORT);
const ev = (f, ...a) => page.evaluate(f, ...a);

let failed = 0, ran = 0;
const check = (rule, ok, detail) => { ran++; if (!ok) failed++; console.log(`${ok ? '  ✓' : '  ✗'} ${rule}${ok ? '' : `  ${JSON.stringify(detail)}`}`); };
const precondition = (what, ok, detail) => { if (!ok) { console.error(`Behaviour: precondition failed, nothing measured: ${what} ${JSON.stringify(detail)}`); process.exit(1); } };

// Real input, as a person gives it.
const mouse = (type, x, y) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); await wait(60); };
const KEYS = { Escape: [27, ''], Enter: [13, '\r'], Backspace: [8, ''], End: [35, ''] };
const key = async (k) => { const [vk, text] = KEYS[k]; await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: vk, text }); await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: vk }); await wait(30); };
const type = async (t) => { await page.send('Input.insertText', { text: t }); await wait(30); };
// The window's focus. CDP focus emulation flips document.hasFocus() and fires real window blur/focus.
const windowFocus = async (on) => { await page.send('Emulation.setFocusEmulationEnabled', { enabled: on }); await wait(300); };

async function open(url) {
  await page.send('Page.navigate', { url });
  await until(() => ev(() => document.readyState === 'complete' && !!document.querySelector('.app')), 30000, url);
  await wait(500);
}

// ── Rename: the details panel's Bot name field (traces/2026-11-09-rename.json) ──────────────────
// Each case opens the page fresh, so it starts from "Oracle" and one failure cannot leak a
// leftover name into the next. Typing waits until React's own value matches the field's.
console.log('Behaviour · rename (traces/2026-11-09-rename.json)');
const name = () => ev(() => {
  const i = document.querySelector('.who-name'), a = document.activeElement, cs = getComputedStyle(i), r = i.getBoundingClientRect();
  const props = i[Object.keys(i).find((k) => k.startsWith('__reactProps$'))];
  return { value: i.value, react: props?.value, header: document.querySelector('.bot-pill [role=heading]')?.textContent, tile: document.querySelectorAll('.rail-tile')[1]?.getAttribute('aria-label'),
    placeholder: document.querySelector('[data-placeholder]')?.getAttribute('data-placeholder'), active: a === document.body ? 'body' : a.getAttribute('aria-label') || a.tagName,
    sel: a === i ? [i.selectionStart, i.selectionEnd] : null, bg: cs.backgroundColor, transition: cs.transition, rect: [r.x, r.y, r.width, r.height] };
});
const nextFrame = () => ev(() => new Promise((r) => requestAnimationFrame(() => r())));
// Typed text counts once React has rendered it, not after a fixed time.
const typeIn = async (t) => {
  const want = (await name()).value;
  await type(t);
  await until(async () => { const n = await name(); return n.value !== want && n.react === n.value; }, 5000, `React to render the typed "${t}"`);
};
const clear = async () => { await ev(() => document.querySelector('.who-name').select()); await key('Backspace'); await until(async () => { const n = await name(); return n.value === '' && n.react === ''; }, 5000, 'the field to empty'); };
let field;
const fresh = async () => {
  await open(`${base}/gate/oracle-turn-1040`); await windowFocus(true);
  await mouse('mouseMoved', 400, 740); await wait(300);
  const s = await name();
  precondition('a fresh page: the Bot name field holds "Oracle", header, tile and placeholder agree, nothing focused', s.value === 'Oracle' && s.react === 'Oracle' && s.header === 'Oracle' && s.tile === 'Oracle' && s.placeholder === 'Message Oracle' && s.active === 'body', s);
  field = s.rect;
  return s;
};
const into = async (at = 'middle') => { const [x, y, w, h] = field; await click(at === 'middle' ? x + w / 2 : x + w - 12, y + h / 2); };
let s;

s = await fresh();
check('rest: transparent, border-color and background-color transitions of 0.12 s', s.bg === 'rgba(0, 0, 0, 0)' && /border-color 0\.12s.*background-color 0\.12s/.test(s.transition), s);
{ const [x, y, w, h] = field; await mouse('mouseMoved', x + w / 2, y + h / 2); }
await wait(60); const early = (await name()).bg; await wait(250); s = await name();
check('hover: fills to rgba(245,245,245,0.08), through the transition (control: not there at 60 ms)', s.bg === 'rgba(245, 245, 245, 0.08)' && early !== s.bg, { at60ms: early, settled: s.bg });

await fresh();
await into('middle'); const middle = (await name()).sel;
await key('Escape'); await into('right'); const right = (await name()).sel;
check('click: the caret goes where it lands, no select-all (control: a click further right lands further right)', middle && middle[0] === middle[1] && middle[0] > 0 && middle[0] < 6 && right && right[0] === 6 && right[1] === 6, { middle, right });

await fresh();
await into(); await key('End'); await typeIn(' Two'); await wait(3000); const typed = await name();
check('no autosave: 3 s after typing, nothing has saved', typed.value === 'Oracle Two' && typed.header === 'Oracle' && typed.tile === 'Oracle' && typed.placeholder === 'Message Oracle', typed);
await key('Escape'); s = await name();
check('Escape: puts the old name back, focus on body (control: the field held the typed name)', typed.value === 'Oracle Two' && s.value === 'Oracle' && s.react === 'Oracle' && s.active === 'body' && s.header === 'Oracle', s);

// The CI race of PR #28: React's record of the value one step behind the field when Escape
// blurs it. blur() fires the native change event, and React raised onChange from it with the
// typed text after the revert. Forced here by setting React's value tracker back.
await fresh();
await into(); await key('End'); await typeIn(' Two');
await ev(() => document.querySelector('.who-name')._valueTracker.setValue('Oracle'));
await key('Escape'); s = await name();
check('Escape reverts even when React\'s record of the value is behind the field (PR #28 CI race)', s.value === 'Oracle' && s.react === 'Oracle' && s.header === 'Oracle' && s.active === 'body', s);

await fresh();
await into(); await key('End'); await typeIn(' Two'); const before = await name();
await key('Enter'); await nextFrame(); s = await name();
check('Enter: saves, focus on body; header, tile label and placeholder follow in the next frame (control: all old while typing)',
  before.header === 'Oracle' && before.tile === 'Oracle' && before.placeholder === 'Message Oracle' &&
  s.value === 'Oracle Two' && s.active === 'body' && s.header === 'Oracle Two' && s.tile === 'Oracle Two' && s.placeholder === 'Message Oracle Two', { before, after: s });

await fresh();
await into(); await clear(); const empty = await name();
await key('Enter'); s = await name();
check('empty + Enter: keeps the old name, focus on body (control: the field was empty)', empty.value === '' && s.value === 'Oracle' && s.react === 'Oracle' && s.header === 'Oracle' && s.active === 'body', s);

await fresh();
await into(); await key('End'); await typeIn('X'); const away = await name();
await click(400, 300); s = await name();
check('click away on the transcript: saves, focus on the transcript (control: old name until then)', away.header === 'Oracle' && s.value === 'OracleX' && s.header === 'OracleX' && s.tile === 'OracleX' && s.active === 'Conversation transcript', s);

await fresh();
await click(400, 300); s = await name();
check('control: a click on the transcript alone renames nothing, focus on the transcript', s.header === 'Oracle' && s.value === 'Oracle' && s.active === 'Conversation transcript', s);

await fresh();
await into(); await key('End'); await typeIn('X'); await click(44, 155); s = await name();
check('click away on a rail tile: saves, focus goes to what was clicked', s.header === 'OracleX' && s.active === 'OracleX', s);

// ── Unread dot and the Working label (traces/2026-11-09-unread.json, -long-answer.json) ──────────
console.log('Behaviour · unread and working (traces/2026-11-09-unread.json, -long-answer.json)');
const mountWith = async (overlay) => {
  await open(`${base}/gate/oracle-turn-1040`);
  await ev(async (o) => { const m = await import('/src/gate/behaviour.tsx'); document.body.innerHTML = '<div id="t"></div>'; window.__drive = m.mount(document.getElementById('t'), o); }, overlay);
  await wait(300);
};
const rail = () => ev(async () => { await new Promise((r) => setTimeout(r, 50)); const tiles = [...document.querySelectorAll('.rail-tile:not(.rail-me)')].map((b) => b.getAttribute('aria-label'));
  return { focus: document.hasFocus(), tiles, dot: !!document.querySelector('.unread'), settings: !!document.querySelector('[role=dialog]'), open: document.querySelector('[aria-current=page]')?.getAttribute('aria-label') }; });
const drive = (w) => ev((w) => window.__drive(w), w);
const turn = async () => { await drive(['Oracle']); await wait(50); await drive([]); };
await mountWith(undefined); await windowFocus(true);
s = await rail();
precondition('the window has focus, Oracle is open, no dot', s.focus && s.open === 'Oracle' && !s.dot, s);
await turn(); s = await rail();
check('a reply in a focused window sets no dot', s.focus && !s.dot && s.tiles[1] === 'Oracle', s);
await mountWith('settings'); await windowFocus(false);
const pre = await rail();
precondition('the window has no focus, Settings is up, no dot', !pre.focus && pre.settings && !pre.dot, pre);
await turn(); s = await rail();
check('a reply while the window has no focus sets the dot and ", Unread activity", even on the open bot with Settings up (control: none before)', !s.focus && s.dot && s.tiles[1] === 'Oracle, Unread activity' && s.open?.startsWith('Oracle') && s.settings, s);
await wait(1200); s = await rail();
check('control: while the window stays unfocused the dot stays (1.2 s later)', !s.focus && s.dot, s);
await windowFocus(true); s = await rail();
check('the window getting focus clears the dot at once, Settings still up', s.focus && !s.dot && s.tiles[1] === 'Oracle' && s.settings, s);
await turn(); s = await rail();
check('control: focused again, the next reply sets no dot', s.focus && !s.dot, s);
await drive(['Oracle', 'Grookie']); s = await rail();
check('Working: not on the open bot; still on a bot that is not open (control)', s.tiles[1] === 'Oracle' && s.tiles[0] === 'Grookie, Main Bot, Working', s);
await drive([]);

// ── Rename persists: the live page (/) saves the name to Barkpark (task-c3e0bc88ce28833d) ─────
// Grok keeps a renamed bot's name across a restart. Ours saves it as a Barkpark pref on Enter or
// a click away, and loadChat reads it back. Counted at the stand-in, so a write is a write.
if (opt('url')) console.log('Behaviour · rename persists: not run with --url (it needs the stand-in Barkpark)');
else {
  console.log('Behaviour · rename persists (the live page, against the stand-in Barkpark)');
  const live = async () => ({ ...(await name()), tiles: await ev(() => [...document.querySelectorAll('.rail-tile[aria-label]')].map((t) => t.getAttribute('aria-label'))) });
  const reload = async (want) => {
    await open(`${base}/`); await windowFocus(true);
    // Typing before React owns the field would be lost when it hydrates (seen on a cold dev server).
    await until(async () => (await name()).react !== undefined, 30000, 'React to own the Bot name field');
    // A name that never comes back is a failed rule below, not a crash here.
    await until(async () => (await live()).header === want, 10000, `the live page to show "${want}"`).catch(() => {});
    const l = await live(); field = l.rect; return l;
  };
  const reads = stub.reads;
  s = await reload('BarkBot');
  precondition('the live page read the saved name from the stand-in (unset), shows BarkBot, and wrote nothing',
    stub.reads > reads && stub.writes.length === 0 && s.value === 'BarkBot' && s.placeholder === 'Message BarkBot' && s.tiles.includes('BarkBot'), { reads: stub.reads, writes: stub.writes, other: stub.other, s });

  await into(); await key('End'); await typeIn(' Two'); await key('Escape'); await wait(300);
  await into(); await clear(); await key('Enter'); await wait(300);
  s = await live();
  check('Escape and an empty name write nothing to Barkpark (control: the next rule\'s rename writes)', stub.writes.length === 0 && s.header === 'BarkBot', { writes: stub.writes, s });

  await into(); await key('End'); await typeIn(' Two'); await key('Enter');
  await until(async () => stub.writes.length > 0, 5000, 'the rename to reach the stand-in').catch(() => {});
  s = await live();
  check('Enter: writes the name once, and the live composer says "Message BarkBot Two" at once', stub.writes.length === 1 && stub.writes[0]?.name === 'BarkBot Two' && s.placeholder === 'Message BarkBot Two' && s.header === 'BarkBot Two', { writes: stub.writes, s });

  s = await reload('BarkBot Two');
  check('reload: header, rail tile and placeholder show the saved name (control: "BarkBot" before the rename)', s.value === 'BarkBot Two' && s.tiles.includes('BarkBot Two') && s.placeholder === 'Message BarkBot Two' && stub.writes.length === 1, { writes: stub.writes, s });

  await into(); await key('End'); await typeIn('X'); await click(400, 300);
  await until(async () => stub.writes.length > 1, 5000, 'the click-away rename to reach the stand-in').catch(() => {});
  s = await reload('BarkBot TwoX');
  check('click away: writes too, and a reload keeps it', stub.writes.length === 2 && stub.writes[1]?.name === 'BarkBot TwoX' && s.tiles.includes('BarkBot TwoX'), { writes: stub.writes, s });
}

console.log(failed ? `Behaviour: ${failed} of ${ran} rules fail` : `Behaviour: all ${ran} rules hold`);
process.exit(failed ? 1 : 0);
