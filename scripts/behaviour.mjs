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
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
const stub = { name: null, reads: 0, writes: [], other: [], hosts: [], sessions: [], answers: [], choices: [], streams: [], rows: [], fleet: null, uploads: [], sent: [], pictures: new Map() };
// The stand-in's side of a conversation's event stream: say an event to every open page.
const say = (kind, more = {}) => stub.streams.forEach((res) => res.write(`event: runtime\ndata: ${JSON.stringify({ kind, ...more })}\n\n`));
const PREF = '/w/default/p/default/v1/prefs/production/barkbot.bot';
const STUB_PORT = await freePort();
await new Promise((ok) => httpServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const json = (code, v) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
    if (req.url === PREF && req.method === 'GET') { stub.reads++; return json(200, { key: 'barkbot.bot', dataset: 'production', value: stub.name === null ? null : { name: stub.name } }); }
    if (req.url === PREF && req.method === 'PUT') { const { value } = JSON.parse(body); stub.writes.push(value); stub.name = value?.name ?? null; return json(200, { key: 'barkbot.bot', dataset: 'production', value }); }
    if (req.url.startsWith('/w/default/v1/chat-hosts')) return json(200, { hosts: stub.hosts });
    if (req.url === '/v1/chat/sessions' && req.method === 'GET') return json(200, { sessions: stub.sessions });
    if (/^\/v1\/chat\/sessions\/[^/]+\/events$/.test(req.url) || req.url === '/v1/chat/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }); res.write(': open\n\n');
      // As Barkpark: the stored rows first (a fresh page asks from 0), and the fleet's snapshot.
      if (req.url === '/v1/chat/events') { if (stub.fleet) res.write(`event: snapshot\ndata: ${JSON.stringify({ sessions: stub.sessions.map((x) => ({ session_id: x.id, agent_state: stub.fleet })) })}\n\n`); }
      else if (req.headers['last-event-id'] !== undefined) stub.rows.forEach((r) => res.write(`id: ${r.seq}\nevent: message\ndata: ${JSON.stringify(r)}\n\n`));
      if (req.url !== '/v1/chat/events') { stub.streams.push(res); res.on('close', () => stub.streams.splice(stub.streams.indexOf(res), 1)); }
      return;
    }
    // Pictures, as Barkpark: an upload answers the sha256 of its bytes; a message names pictures by id.
    if (/^\/v1\/chat\/sessions\/[^/]+\/attachments$/.test(req.url) && req.method === 'POST') { const { data } = JSON.parse(body); const bytes = Buffer.from(data, 'base64'); const id = createHash('sha256').update(bytes).digest('hex'); stub.uploads.push(id); stub.pictures.set(id, data); return json(201, { attachment: { id, media_type: 'image/png', byte_size: bytes.length } }); }
    if (/^\/v1\/chat\/sessions\/[^/]+\/attachments\/[0-9a-f]{64}$/.test(req.url) && req.method === 'GET') { const id = req.url.split('/').pop(); return stub.pictures.has(id) ? json(200, { attachment: { id, media_type: 'image/png', byte_size: 1, data: stub.pictures.get(id) } }) : json(404, { error: { code: 'not_found', message: 'chat attachment not found' } }); }
    if (/^\/v1\/chat\/sessions\/[^/]+\/messages$/.test(req.url) && req.method === 'POST') { stub.sent.push(JSON.parse(body)); return json(202, { accepted: true }); }
    if (/^\/v1\/chat\/sessions\/[^/]+\/answer$/.test(req.url) && req.method === 'POST') { stub.choices.push(JSON.parse(body)); res.writeHead(204); return res.end(); }
    if (/^\/v1\/chat\/sessions\/[^/]+\/approval$/.test(req.url) && req.method === 'POST') { stub.answers.push(JSON.parse(body)); res.writeHead(204); return res.end(); }
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

  // The bot's computer stops and comes back while the page is open (seen live 2026-11-11: a
  // message sent to a stopped computer showed no reply and no reason).
  console.log('Behaviour · the computer goes away (the live page, against the stand-in Barkpark)');
  const host = (online) => [{ id: '00000000-0000-4000-8000-000000000001', name: 'BarkBot Mac', online, enrolled: true, revoked: false }];
  const computer = () => ev(() => ({ state: document.querySelector('.computer-state')?.textContent ?? null, alert: document.querySelector('.chat-error')?.textContent ?? null }));
  stub.hosts = host(true);
  await open(`${base}/`);
  await until(async () => (await computer()).state === 'Asleep', 30000, 'the live page with a computer that is on').catch(() => {});
  let c = await computer();
  precondition('the live page shows a reachable computer and no alert', c.state === 'Asleep' && c.alert === null, c);
  stub.hosts = host(false);
  await until(async () => (await computer()).alert !== null, 10000, 'the page to notice').catch(() => {});
  c = await computer();
  check('the computer stops: within 10 s the card says Unreachable and the conversation says why (control: neither, while it was on)', c.state === 'Unreachable' && /unreachable/.test(c.alert ?? '') && /npm run host/.test(c.alert ?? ''), c);
  stub.hosts = host(true);
  await until(async () => (await computer()).alert === null, 10000, 'the page to notice').catch(() => {});
  c = await computer();
  check('the computer comes back: the alert goes and the card is as before', c.state === 'Asleep' && c.alert === null, c);

  // The bot asks leave before it acts (Barkpark's approval_requested, seen live 2026-11-13: plan
  // mode asks for its plan, then for each step). Nothing may be answered until the person presses.
  console.log('Behaviour · the bot asks leave (the live page, against the stand-in Barkpark)');
  const SESSION = '00000000-0000-4000-8000-0000000000aa';
  stub.sessions = [{ id: SESSION, execution_target: 'registered_host', execution_host_id: host(true)[0].id, inserted_at: '2026-11-13T10:00:00Z', status: 'active' }];
  const card = () => ev(() => { const c = document.querySelector('.ask'); const r = (q) => { const b = c?.querySelector(q)?.getBoundingClientRect(); return b ? [b.x + b.width / 2, b.y + b.height / 2] : null; };
    return { shown: !!c, what: c?.querySelector('.ask-what')?.textContent ?? null, detail: c?.querySelector('.ask-detail')?.textContent ?? null, allow: r('.ask-allow'), deny: r('.ask-deny'), locked: !!c?.querySelector('.ask-allow')?.disabled }; });
  const asks = (id, tool, input) => say('approval_requested', { approval_id: id, native: { kind: 'approval_requested', approval_id: id, tool_name: tool, input } });
  await open(`${base}/`);
  await until(() => stub.streams.length > 0, 30000, 'the live page to open its conversation stream').catch(() => {});
  let k = await card();
  precondition('the live page has a conversation open and shows no card', stub.streams.length > 0 && !k.shown && stub.answers.length === 0, { streams: stub.streams.length, k, other: stub.other, page: await ev(() => ({ state: document.querySelector('.computer-state')?.textContent, note: document.querySelector('.chat-note')?.textContent ?? null, err: document.querySelector('.chat-error')?.textContent ?? null })) });
  say('turn_started'); asks('ask-1', 'Write', { file_path: '/bot/home/notes.txt', content: 'hi' });
  await until(async () => (await card()).shown, 5000, 'the card').catch(() => {});
  await wait(600);
  k = await card();
  check('the bot asks: a card says what for and what with, and nothing is answered (control: no card before the ask)', k.shown && /asks to write notes\.txt/.test(k.what ?? '') && k.detail === 'hi' && stub.answers.length === 0, { k, answers: stub.answers });
  if (k.allow) { await click(...k.allow); await until(() => stub.answers.length > 0, 5000, 'the answer to reach the stand-in').catch(() => {}); await click(...k.allow); await wait(300); }
  k = await card();
  check('Allow: answers that ask once, with allow; a second press sends nothing; the card stays until the bot\'s computer has it', stub.answers.length === 1 && stub.answers[0].request_id === 'ask-1' && stub.answers[0].decision === 'allow' && k.shown && k.locked, { k, answers: stub.answers });
  say('control_completed', { native: { kind: 'control_completed', operation: 'answer_approval' } });
  await until(async () => !(await card()).shown, 5000, 'the card to go').catch(() => {});
  k = await card();
  check('the answer is confirmed: the card goes', !k.shown, k);
  asks('ask-2', 'Bash', { command: 'ls' });
  await until(async () => (await card()).shown, 5000, 'the second card').catch(() => {});
  k = await card();
  if (k.deny) { await click(...k.deny); await until(() => stub.answers.length > 1, 5000, 'the answer to reach the stand-in').catch(() => {}); }
  check('Deny: answers the new ask with deny', /asks to run a command/.test(k.what ?? '') && stub.answers.length === 2 && stub.answers[1].request_id === 'ask-2' && stub.answers[1].decision === 'deny', { k, answers: stub.answers });

  // The bot asks the person to choose (claude's AskUserQuestion, seen live 2026-11-13).
  console.log('Behaviour · the bot asks a question (the live page, against the stand-in Barkpark)');
  const choices = () => ev(() => [...document.querySelectorAll('.ask-choice')].map((b) => { const r = b.getBoundingClientRect(); return { letter: b.querySelector('.ask-letter')?.textContent, label: b.querySelector('.ask-label')?.textContent, at: [r.x + r.width / 2, r.y + r.height / 2], pressed: b.getAttribute('aria-pressed') }; }));
  const sendAt = () => ev(() => { const b = document.querySelector('.ask .ask-allow'); const r = b?.getBoundingClientRect(); return b ? { at: [r.x + r.width / 2, r.y + r.height / 2], disabled: b.disabled } : null; });
  say('control_completed', { native: { kind: 'control_completed', operation: 'answer_approval' } });
  await until(async () => !(await card()).shown, 5000, 'the last card to go').catch(() => {});
  const posted = stub.answers.length;
  asks('q-1', 'AskUserQuestion', { questions: [{ question: 'Which fruit?', header: 'Fruit', multiSelect: false, options: [{ label: 'apple', description: 'red' }, { label: 'pear' }, { label: 'plum' }] }] });
  await until(async () => (await choices()).length === 3, 5000, 'the question card').catch(() => {});
  await wait(600);
  let c2 = await choices();
  check('a question: its choices are lettered A, B, C, and nothing is answered (control: the approval card has no choices)', c2.map((x) => x.letter + x.label).join() === 'Aapple,Bpear,Cplum' && stub.choices.length === 0 && !(await sendAt()), { c2, choices: stub.choices });
  if (c2[1]) { await click(...c2[1].at); await until(() => stub.choices.length > 0, 5000, 'the choice to reach the stand-in').catch(() => {}); await click(...c2[1].at); await wait(300); }
  check('pressing B answers that question once with "pear", as a choice and not as leave', stub.choices.length === 1 && stub.choices[0].request_id === 'q-1' && JSON.stringify(stub.choices[0].answers) === '{"Which fruit?":"pear"}' && stub.answers.length === posted, { choices: stub.choices, answers: stub.answers.length - posted });
  say('control_completed', { native: { kind: 'control_completed', operation: 'answer_approval' } });
  await until(async () => (await choices()).length === 0, 5000, 'the question card to go').catch(() => {});
  asks('q-2', 'AskUserQuestion', { questions: [{ question: 'Which days?', multiSelect: true, options: ['Mon', 'Tue', 'Wed'] }, { question: 'Morning or evening?', multiSelect: false, options: ['Morning', 'Evening'] }] });
  await until(async () => (await choices()).length === 5, 5000, 'the second question card').catch(() => {});
  c2 = await choices();
  const before = (await sendAt())?.disabled;
  if (c2.length === 5) { await click(...c2[0].at); await click(...c2[2].at); await click(...c2[4].at); await wait(200); }
  const ready = await sendAt();
  if (ready && !ready.disabled) { await click(...ready.at); await until(() => stub.choices.length > 1, 5000, 'the choices to reach the stand-in').catch(() => {}); }
  check('two questions, one pick-several: Send waits until each has a choice, then answers both', before === true && stub.choices.length === 2 && JSON.stringify(stub.choices[1]?.answers) === '{"Which days?":["Mon","Wed"],"Morning or evening?":"Evening"}', { before, ready, choices: stub.choices });

  // A reload in the middle of an ask: Barkpark's stored row brings the card back, but only while
  // the bot is waiting on the person (a stopped turn leaves its row "pending" for ever).
  console.log('Behaviour · an ask after a reload (the live page, against the stand-in Barkpark)');
  stub.rows = [{ seq: 1, role: 'user', source_markdown: 'please', metadata: {} }, { seq: 2, role: 'approval', source_markdown: 'Write', metadata: { request_id: 'ask-9', tool_name: 'Write', input: { file_path: '/bot/home/a.txt', content: 'x' }, approval_status: 'pending' } }];
  stub.fleet = 'idle';
  await open(`${base}/`);
  await until(async () => (await ev(() => document.querySelectorAll('.bubble').length)) === 1, 15000, 'the stored conversation').catch(() => {});
  await wait(800);
  k = await card();
  const idleShown = k.shown;
  stub.fleet = 'blocked';
  await open(`${base}/`);
  await until(async () => (await card()).shown, 10000, 'the card after the reload').catch(() => {});
  k = await card();
  const n = stub.answers.length;
  if (k.allow) { await click(...k.allow); await until(() => stub.answers.length > n, 5000, 'the answer').catch(() => {}); }
  check('a reload while the bot waits: the card is back and Allow answers that ask (control: no card when the bot is idle and the row is stale)', !idleShown && k.shown && /asks to write a\.txt/.test(k.what ?? '') && stub.answers.at(-1)?.request_id === 'ask-9' && stub.answers.length === n + 1, { idleShown, k, answers: stub.answers.slice(n) });

  // A picture goes with a message (Barkpark: store it for the conversation, then name it by id).
  console.log('Behaviour · a picture with a message (the live page, against the stand-in Barkpark)');
  // A 1x1 png, written for this run: the chooser is given a real file, as a person's pick is.
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const pngPath = path('.cache', `behaviour-picture-${CHROME_PORT}.png`); writeFileSync(pngPath, PNG);
  const pngId = createHash('sha256').update(PNG).digest('hex');
  stub.rows = []; stub.fleet = 'idle';
  await open(`${base}/`);
  await until(() => stub.streams.length > 0, 30000, 'the conversation stream').catch(() => {});
  await page.send('DOM.enable');
  const { root } = await page.send('DOM.getDocument');
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.composer-wrap input[type=file]' });
  precondition('the composer has a file chooser, and nothing has been stored or sent', !!nodeId && stub.uploads.length === 0 && stub.sent.length === 0, { nodeId, uploads: stub.uploads, sent: stub.sent });
  await page.send('DOM.setFileInputFiles', { nodeId, files: [pngPath] });
  const waiting = () => ev(() => ({ chips: [...document.querySelectorAll('.picture-chip .picture-name')].map((x) => x.textContent), send: document.querySelector('.composer .round.voice')?.getAttribute('aria-label') }));
  await until(async () => (await waiting()).chips.length === 1, 5000, 'the chip').catch(() => {});
  let w = await waiting();
  check('a picked picture waits as a chip, the round button says Send, and nothing is stored or sent yet', w.chips.length === 1 && /behaviour-picture/.test(w.chips[0]) && w.send === 'Send' && stub.uploads.length === 0 && stub.sent.length === 0, { w, uploads: stub.uploads.length, sent: stub.sent.length });
  await ev(() => document.querySelector('.prompt').focus());
  await page.send('Input.insertText', { text: 'look' }); await key('Enter');
  await until(() => stub.sent.length > 0, 8000, 'the message to reach the stand-in').catch(() => {});
  await until(async () => (await ev(() => document.querySelector('.picture-tiles img')?.naturalWidth ?? 0)) > 0, 8000, 'the picture to show above the bubble').catch(() => {});
  w = await waiting();
  const shown = await ev(() => ({ imgs: [...document.querySelectorAll('.turn-attached .picture-tiles img')].map((i) => [i.getAttribute('src'), i.naturalWidth]), text: [...document.querySelectorAll('.bubble-user .bubble-text')].at(-1)?.textContent }));
  check('Enter: the picture is stored once, the message names it by id, the chip is gone, and the picture shows as a tile above the message\'s words (oracle 1.0.3: its own row above the bubble)', stub.uploads.length === 1 && stub.uploads[0] === pngId && stub.sent.length === 1 && stub.sent[0].content === 'look' && JSON.stringify(stub.sent[0].attachments) === JSON.stringify([pngId]) && w.chips.length === 0 && shown.imgs.length === 1 && shown.imgs[0][0].endsWith(`/attachments/${pngId}`) && shown.imgs[0][1] === 1 && shown.text === 'look', { uploads: stub.uploads, sent: stub.sent, w, shown });
  await ev(() => document.querySelector('.prompt').focus());
  await page.send('Input.insertText', { text: 'words only' }); await key('Enter');
  await until(() => stub.sent.length > 1, 8000, 'the second message').catch(() => {});
  check('a message without a picture names none (control)', stub.sent.length === 2 && !('attachments' in stub.sent[1]) && stub.uploads.length === 1, { sent: stub.sent });
  rmSync(pngPath, { force: true });

  // A reload in the middle of a reply: the fresh page hears only the rest of the turn (Barkpark
  // replays stored rows, not a running turn's events; seen live 2026-11-13). The tail is not a
  // message; the stored row that follows the turn's end is the whole reply.
  console.log('Behaviour · a page that opens mid-reply (the live page, against the stand-in Barkpark)');
  const replies = () => ev(() => [...document.querySelectorAll('.bubble[data-role="assistant"] .bubble-text')].map((x) => x.textContent));
  const textItem = { native: { params: { item: { type: 'text' } } } };
  stub.rows = [{ seq: 1, role: 'user', source_markdown: 'tell me about tides' }];
  await open(`${base}/`);
  await until(() => stub.streams.length > 0, 30000, 'the fresh page to open its stream').catch(() => {});
  await until(async () => (await ev(() => document.querySelectorAll('.bubble').length)) === 1, 8000, 'the stored message').catch(() => {});
  say('text_delta', { native: { delta: 'and that is why the sea' } }); say('text_delta', { native: { delta: ' comes back.' } });
  say('item_completed', textItem);
  await wait(600);
  const tailOnly = await replies();
  // As Barkpark: the row is stored at the turn's end and not sent to the streams already open.
  stub.rows.push({ seq: 2, role: 'assistant', source_markdown: 'The moon pulls, and that is why the sea comes back.' });
  say('turn_completed');
  await until(async () => (await replies()).length > 0, 5000, 'the stored reply').catch(() => {});
  const wholeReply = await replies();
  check('a page opened mid-reply shows no half reply; when the turn ends it asks for the stored rows and the whole reply lands once, our own message not doubled', tailOnly.length === 0 && wholeReply.length === 1 && wholeReply[0] === 'The moon pulls, and that is why the sea comes back.' && (await ev(() => document.querySelectorAll('.bubble[data-role="user"]').length)) === 1, { tailOnly, wholeReply });
  say('turn_started'); say('item_started', textItem); say('text_delta', { native: { delta: 'Twice a day.' } }); say('item_completed', textItem); say('turn_completed');
  await until(async () => (await replies()).length > 1, 5000, 'the next turn\'s reply').catch(() => {});
  const next = await replies();
  check('the next turn, heard from its start, lands live as before (control)', next.length === 2 && next[1] === 'Twice a day.', { next });
}

console.log(failed ? `Behaviour: ${failed} of ${ran} rules fail` : `Behaviour: all ${ran} rules hold`);
process.exit(failed ? 1 : 0);
