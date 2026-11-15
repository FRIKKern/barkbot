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

// A stand-in Barkpark for the live page (/): it answers what loadChat asks (the computers, the
// sessions, the per-account prefs that hold the bots) and keeps every write, so the rules can count them.
// stub.sessions is every session Barkpark holds; its list answers fewer (below). stub.fail makes one
// pref call fail: 'GET barkbot.bots' → 500. stub.to is the session each message or answer went to.
const stub = { prefs: new Map(), reads: 0, writes: [], opened: [], other: [], hosts: [], sessions: [], answers: [], choices: [], streams: [], rows: [], fleet: null, uploads: [], sent: [], pictures: new Map(), refused: [], noFiles: false, fail: new Map(), shown: [], made: [], to: [], readKeys: [] };
// The stand-in's side of a conversation's event stream: say an event to every open page.
const say = (kind, more = {}) => stub.streams.forEach((res) => res.write(`event: runtime\ndata: ${JSON.stringify({ kind, ...more })}\n\n`));
// Per-account prefs, as Barkpark's (docs/contracts/user-prefs.md): GET, PUT, and PATCH add/remove on a list.
const PREFS = '/w/default/p/default/v1/prefs/production/';
// The bot store's writes, from stub.writes: a bot key's PUTs, the list's adds, and the legacy key.
const botPuts = () => stub.writes.filter((w) => w.method === 'PUT' && w.key.startsWith('barkbot.bot.'));
const listAdds = () => stub.writes.filter((w) => w.method === 'PATCH' && w.key === 'barkbot.bots' && w.body.op === 'add');
const legacyWrites = () => stub.writes.filter((w) => w.key === 'barkbot.bot');
const listed = () => stub.sessions.filter((x) => !x.archived_at).sort((a, b) => (b.last_active_at ?? b.inserted_at).localeCompare(a.last_active_at ?? a.inserted_at)).slice(0, 50).map(({ archived_at, ...x }) => x);
const freshStore = (legacy = null) => { stub.prefs.clear(); if (legacy) stub.prefs.set('barkbot.bot', legacy); };
const STUB_PORT = await freePort();
await new Promise((ok) => httpServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const json = (code, v) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
    if (req.url.startsWith(PREFS)) {
      const key = decodeURIComponent(req.url.slice(PREFS.length)); const got = () => json(200, { key, dataset: 'production', value: stub.prefs.get(key) ?? null });
      const failing = stub.fail.get(`${req.method} ${key}`);
      if (req.method === 'GET') { stub.reads++; stub.readKeys.push(key); return failing ? json(failing, { error: { code: 'internal', message: 'the stand-in fails this read' } }) : got(); }
      const b = body ? JSON.parse(body) : {}; stub.writes.push({ method: req.method, key, body: b, failed: !!failing });
      if (failing) return json(failing, { error: { code: 'internal', message: 'the stand-in fails this write' } });
      if (req.method === 'PUT') { stub.prefs.set(key, b.value); return got(); }
      if (req.method === 'DELETE') { stub.prefs.delete(key); return got(); }
      if (req.method === 'PATCH') {
        const v = { ...(stub.prefs.get(key) ?? {}) }; const list = Array.isArray(v[b.field]) ? v[b.field] : [];
        if (b.op === 'add') v[b.field] = list.includes(b.item) ? list : [...list, b.item];
        else if (b.op === 'remove') v[b.field] = list.filter((x) => x !== b.item);
        else return json(422, { error: { code: 'bad_request', message: 'unknown op' } });
        stub.prefs.set(key, v); return got();
      }
    }
    if (req.url.startsWith('/w/default/v1/chat-hosts')) return json(200, { hosts: stub.hosts });
    // As Barkpark (studio_chat.ex list_sessions): the list leaves out archived sessions and holds
    // only the 50 most recently active. A session's own read answers any session the admin token
    // can see, archived too, and 404 for an unknown id.
    if (req.url === '/v1/chat/sessions' && req.method === 'GET') return json(200, { sessions: listed() });
    if (/^\/v1\/chat\/sessions\/[^/?]+(\?.*)?$/.test(req.url) && req.method === 'GET') {
      const id = decodeURIComponent(req.url.split('?')[0].split('/')[4]); stub.shown.push(id); const x = stub.sessions.find((y) => y.id === id);
      return x ? json(200, { archived_at: null, ...x, messages: [] }) : json(404, { error: { code: 'not_found', message: 'chat session not found' } });
    }
    if (req.url === '/v1/chat/sessions' && req.method === 'POST') {
      const b = JSON.parse(body); const x = { id: `00000000-0000-4000-8000-${String(900000000000 + stub.made.length)}`, execution_target: b.execution_target, execution_host_id: b.execution_host_id, inserted_at: new Date().toISOString(), status: 'active' };
      stub.made.push(x.id); stub.sessions.push(x); return json(201, x);
    }
    if (/^\/v1\/chat\/sessions\/[^/]+\/events$/.test(req.url) || req.url === '/v1/chat/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }); res.write(': open\n\n');
      // As Barkpark: the stored rows first (a fresh page asks from 0), and the fleet's snapshot.
      if (req.url === '/v1/chat/events') { if (stub.fleet) res.write(`event: snapshot\ndata: ${JSON.stringify({ sessions: stub.sessions.map((x) => ({ session_id: x.id, agent_state: stub.fleet })) })}\n\n`); }
      else if (req.headers['last-event-id'] !== undefined) stub.rows.forEach((r) => res.write(`id: ${r.seq}\nevent: message\ndata: ${JSON.stringify(r)}\n\n`));
      if (req.url !== '/v1/chat/events') { stub.opened.push(req.url.split('/')[4]); stub.streams.push(res); res.on('close', () => stub.streams.splice(stub.streams.indexOf(res), 1)); }
      return;
    }
    // Pictures and files, as Barkpark: an upload's type is read from its bytes (png, PDF, UTF-8 text;
    // anything else is a 400 and is not stored) and it answers the sha256 of its bytes; a message
    // names a picture by id and a file by {id, name}. A computer that cannot take files: 422.
    if (/^\/v1\/chat\/sessions\/[^/]+\/attachments$/.test(req.url) && req.method === 'POST') {
      const { data } = JSON.parse(body); const bytes = Buffer.from(data, 'base64'); const id = createHash('sha256').update(bytes).digest('hex');
      const media_type = bytes[0] === 0x89 && bytes.subarray(1, 4).toString() === 'PNG' ? 'image/png' : bytes.subarray(0, 5).toString() === '%PDF-' ? 'application/pdf' : bytes.length && !bytes.includes(0) && Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes) ? 'text/plain' : null;
      if (!media_type) { stub.refused.push({ upload: id }); return json(400, { error: { code: 'invalid_request', message: 'attachment must be UTF-8 text, a PDF, or one of: image/png, image/jpeg, image/gif, image/webp' } }); }
      stub.uploads.push(id); stub.pictures.set(id, data); return json(201, { attachment: { id, media_type, byte_size: bytes.length, url: `/v1/chat/sessions/x/attachments/${id}` } });
    }
    if (/^\/v1\/chat\/sessions\/[^/]+\/attachments\/[0-9a-f]{64}$/.test(req.url) && req.method === 'GET') { const id = req.url.split('/').pop(); return stub.pictures.has(id) ? json(200, { attachment: { id, media_type: 'image/png', byte_size: 1, data: stub.pictures.get(id) } }) : json(404, { error: { code: 'not_found', message: 'chat attachment not found' } }); }
    if (/^\/v1\/chat\/sessions\/[^/]+\/messages$/.test(req.url) && req.method === 'POST') {
      const m = JSON.parse(body);
      if (stub.noFiles && (m.attachments ?? []).some((a) => typeof a === 'object')) { stub.refused.push({ message: m }); return json(422, { error: { code: 'host_cannot_receive_attachments', message: "this session's chat host cannot receive attachments of this type — update barkpark-chat-host, or send the text alone" } }); }
      stub.sent.push(m); stub.to.push(req.url.split('/')[4]); return json(202, { accepted: true });
    }
    if (/^\/v1\/chat\/sessions\/[^/]+\/answer$/.test(req.url) && req.method === 'POST') { stub.choices.push(JSON.parse(body)); stub.to.push(req.url.split('/')[4]); res.writeHead(204); return res.end(); }
    if (/^\/v1\/chat\/sessions\/[^/]+\/approval$/.test(req.url) && req.method === 'POST') { stub.answers.push(JSON.parse(body)); stub.to.push(req.url.split('/')[4]); res.writeHead(204); return res.end(); }
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
  // Loaded is not live: a cold dev server can take seconds more to hydrate (seen 2026-11-14: 3.4 s
  // after load on a first page), and a page read before React owns it fails on what it never ran.
  await until(() => ev(() => { const a = document.querySelector('.app'); return document.readyState === 'complete' && !!a && Object.keys(a).some((k) => k.startsWith('__reactFiber$')); }), 30000, url);
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

// ── Bots are known by id: two bots of one name stay two bots (task-e4dc0e4a8fca69b3) ───────
console.log('Behaviour · two bots of one name');
await open(`${base}/gate/oracle-turn-1040`);
await ev(async () => { const m = await import('/src/gate/behaviour.tsx'); document.body.innerHTML = '<div id="t"></div>'; window.__drive = m.mount(document.getElementById('t'), undefined, { bots: [{ id: 'grookie', name: 'Grookie', main: true }, { id: 'twin-1', name: 'Twin' }, { id: 'twin-2', name: 'Twin' }], active: 'twin-1', previews: {} }); });
await wait(300);
const twins = () => ev(() => ({ tiles: [...document.querySelectorAll('.rail-list .rail-tile')].map((b) => { const r = b.getBoundingClientRect(); return { label: b.getAttribute('aria-label'), current: b.getAttribute('aria-current'), at: [r.x + r.width / 2, r.y + r.height / 2] }; }), header: document.querySelector('.bot-pill [role=heading]')?.textContent }));
let tw = await twins();
precondition('two pinned bots, both named Twin', tw.tiles.length === 2 && tw.tiles.every((x) => x.label === 'Twin'), tw);
await click(...tw.tiles[1].at); await wait(100);
tw = await twins();
check('picking the second Twin marks only that tile current (control: the first was the open one before)', tw.tiles[0].current === null && tw.tiles[1].current === 'page' && tw.header === 'Twin', tw);
await ev(() => document.querySelector('.who-name').focus()); await clear(); await typeIn('Twin Two'); await key('Enter'); await nextFrame();
tw = await twins();
check('renaming the second Twin leaves the first tile\'s label as it was', tw.tiles[0].label === 'Twin' && tw.tiles[1].label === 'Twin Two' && tw.header === 'Twin Two', tw);

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
  // A bot is kept as its own record (task-735e6ba3d04f2b2c), and a record names its computer: so
  // these rules run with one enrolled computer. The first load makes the Main Bot's record.
  const host = (online) => [{ id: '00000000-0000-4000-8000-000000000001', name: 'BarkBot Mac', online, enrolled: true, revoked: false }];
  stub.hosts = host(true); freshStore();
  const reads = stub.reads;
  s = await reload('BarkBot');
  await until(() => botPuts().length > 0, 5000, 'the Main Bot record').catch(() => {});
  const made = botPuts().length;
  precondition('the live page read the store, shows BarkBot, made one Main Bot record and wrote the legacy key zero times',
    stub.reads > reads && made === 1 && legacyWrites().length === 0 && s.value === 'BarkBot' && s.placeholder === 'Message BarkBot' && s.tiles.includes('BarkBot'), { reads: stub.reads, writes: stub.writes, other: stub.other, s });
  const renames = () => botPuts().slice(made).map((w) => w.body.value);

  await into(); await key('End'); await typeIn(' Two'); await key('Escape'); await wait(300);
  await into(); await clear(); await key('Enter'); await wait(300);
  s = await live();
  check('Escape and an empty name write nothing to Barkpark (control: the next rule\'s rename writes)', renames().length === 0 && s.header === 'BarkBot', { writes: stub.writes, s });

  await into(); await key('End'); await typeIn(' Two'); await key('Enter');
  await until(async () => renames().length > 0, 5000, 'the rename to reach the stand-in').catch(() => {});
  s = await live();
  check('Enter: writes the name once, to the bot\'s own key, and the live composer says "Message BarkBot Two" at once', renames().length === 1 && renames()[0]?.name === 'BarkBot Two' && legacyWrites().length === 0 && s.placeholder === 'Message BarkBot Two' && s.header === 'BarkBot Two', { writes: stub.writes, s });

  s = await reload('BarkBot Two');
  check('reload: header, rail tile and placeholder show the saved name (control: "BarkBot" before the rename)', s.value === 'BarkBot Two' && s.tiles.includes('BarkBot Two') && s.placeholder === 'Message BarkBot Two' && renames().length === 1, { writes: stub.writes, s });

  await into(); await key('End'); await typeIn('X'); await click(400, 300);
  await until(async () => renames().length > 1, 5000, 'the click-away rename to reach the stand-in').catch(() => {});
  s = await reload('BarkBot TwoX');
  check('click away: writes too, and a reload keeps it', renames().length === 2 && renames()[1]?.name === 'BarkBot TwoX' && s.tiles.includes('BarkBot TwoX') && legacyWrites().length === 0, { writes: stub.writes, s });

  // ── The bot store: today's bot moves in, additively; a record is checked, never trusted ─────
  console.log('Behaviour · the bot store (the live page, against the stand-in Barkpark)');
  const HOST_ID = host(true)[0].id;
  const S1 = '00000000-0000-4000-8000-0000000000c1', S2 = '00000000-0000-4000-8000-0000000000c2', FOREIGN = '00000000-0000-4000-8000-0000000000ff';
  const session = (id, hostId = HOST_ID) => ({ id, execution_target: 'registered_host', execution_host_id: hostId, inserted_at: '2026-11-15T09:00:00Z', status: 'active' });
  const ids = () => stub.prefs.get('barkbot.bots')?.ids ?? [];
  const botKeys = () => [...stub.prefs.keys()].filter((k) => k.startsWith('barkbot.bot.'));
  const showing = async (want) => { stub.opened = []; await open(`${base}/`); await until(async () => (await live()).header === want, 15000, `the page to show "${want}"`).catch(() => {}); await wait(500); return live(); };
  stub.sessions = [session(S1)]; stub.rows = [];
  freshStore({ name: 'Legacy Name' }); let w0 = stub.writes.length;
  s = await showing('Legacy Name');
  const moved = stub.writes.slice(w0);
  check('today\'s bot moves in: one bot with the legacy name and its conversation; one bot key and one add written, the legacy key never', s.tiles.filter((t) => !t.startsWith('Open account')).length === 1 && s.tiles.includes('Legacy Name') && stub.opened.includes(S1) && moved.filter((w) => w.method === 'PUT' && w.key.startsWith('barkbot.bot.')).length === 1 && moved.filter((w) => w.method === 'PATCH' && w.key === 'barkbot.bots').length === 1 && moved.filter((w) => w.key === 'barkbot.bot').length === 0 && stub.prefs.get('barkbot.bot')?.name === 'Legacy Name', { moved, opened: stub.opened, s });
  // Two first loads at once (two tabs) against an empty store: the same id, so one bot.
  freshStore({ name: 'Legacy Name' });
  await Promise.all([fetch(`${base}/`).then((r) => r.text()), fetch(`${base}/`).then((r) => r.text())]);
  check('two page loads at once against an empty store leave one bot, the same id, not two', ids().length === 1 && botKeys().length === 1 && botKeys()[0] === `barkbot.bot.${ids()[0]}`, { ids: ids(), keys: botKeys() });
  // A record is a claim: one naming a session not on its own computer, or a computer not the caller's, is dropped.
  const main = ids()[0]; const B = '7b0e1f2a-3c4d-4e5f-8a6b-7c8d9e0f1a2b', C = '8c1f2a3b-4d5e-4f6a-9b7c-8d9e0f1a2b3c';
  const rec = (name, host_id, session_id) => ({ name, host_id, session_id, created_at: '2026-11-15T09:00:00Z' });
  // Barkpark's list holds only the 50 most recently active sessions: 50 newer ones on another
  // computer push S1 and FOREIGN out of it, so each is judged by its own read.
  const OTHER_HOST = '00000000-0000-4000-8000-00000000beef';
  const fillers = Array.from({ length: 50 }, (_, i) => ({ ...session(`00000000-0000-4000-8000-1000000000${String(i).padStart(2, '0')}`, OTHER_HOST), last_active_at: `2026-11-15T10:${String(i).padStart(2, '0')}:00Z` }));
  const MANAGED = '00000000-0000-4000-8000-0000000000ee', D = '9d2a3b4c-5e6f-4a7b-8c8d-9e0f1a2b3c4d';
  stub.sessions = [session(S1), session(FOREIGN, OTHER_HOST), { ...session(MANAGED, null), execution_target: 'managed' }, ...fillers];
  stub.prefs.set('barkbot.bots', { ids: [B, D, C, main] });
  stub.prefs.set(`barkbot.bot.${D}`, rec('Managed', HOST_ID, MANAGED));
  stub.prefs.set(`barkbot.bot.${B}`, rec('Stranger', HOST_ID, FOREIGN));
  stub.prefs.set(`barkbot.bot.${C}`, rec('Elsewhere', OTHER_HOST, null));
  s = await showing('Legacy Name');
  const sentTo = () => [...stub.other, ...stub.to].filter((x) => x.includes(FOREIGN) || x.includes(MANAGED));
  check('a bot key naming a session Barkpark shows on another computer or as managed, or a computer not the caller\'s, is not shown and nothing is sent to that session (control below: a gone session keeps the bot)', !s.tiles.some((t) => /Stranger|Elsewhere|Managed/.test(t)) && s.header === 'Legacy Name' && !stub.opened.includes(FOREIGN) && !stub.opened.includes(MANAGED) && stub.opened.includes(S1) && sentTo().length === 0 && !listed().some((x) => x.id === FOREIGN || x.id === S1 || x.id === MANAGED), { tiles: s.tiles, opened: stub.opened, other: stub.other, to: stub.to });
  stub.sessions = [session(S1), session(S2), session(FOREIGN, OTHER_HOST), { ...session(MANAGED, null), execution_target: 'managed' }, ...fillers];
  stub.prefs.set(`barkbot.bot.${B}`, rec('Stranger', HOST_ID, S2));
  s = await showing('Stranger');
  check('control: the same bot with its own session is shown, first in the rail and open on that session', s.tiles.some((t) => t === 'Stranger') && s.header === 'Stranger' && stub.opened.includes(S2) && !s.tiles.some((t) => /Elsewhere|Managed/.test(t)), { tiles: s.tiles, opened: stub.opened });

  // A good bot is kept whatever Barkpark's list leaves out, and a failed pref read or write never
  // fails the page and never saves a guess (the review of #59: B1, B2, B3).
  const KEY = `barkbot.bot.${main}`;
  const alertLine = () => ev(() => document.querySelector('.chat-error')?.textContent ?? null);
  const since = (n) => stub.writes.slice(n);
  stub.sessions = [session(S1), ...fillers];
  freshStore({ name: 'Legacy Name' }); stub.prefs.set('barkbot.bots', { ids: [main] }); stub.prefs.set(KEY, rec('Renamed Later', HOST_ID, S1));
  w0 = stub.writes.length; stub.shown = [];
  s = await showing('Renamed Later'); field = s.rect;
  check('a bot whose conversation is past Barkpark\'s 50 most recent keeps its name and opens that conversation, read on its own (control: the list leaves it out)', s.header === 'Renamed Later' && stub.opened.includes(S1) && stub.shown.includes(S1) && !listed().some((x) => x.id === S1) && since(w0).length === 0, { header: s.header, opened: stub.opened, shown: stub.shown, writes: since(w0) });
  await into(); await key('End'); await typeIn(' Again'); await key('Enter');
  await until(() => since(w0).length > 0, 5000, 'the rename to reach the stand-in').catch(() => {});
  check('… and a rename of it still saves, to its own key, keeping its conversation', since(w0).length === 1 && since(w0)[0].key === KEY && stub.prefs.get(KEY)?.name === 'Renamed Later Again' && stub.prefs.get(KEY)?.session_id === S1, { writes: since(w0), alert: await alertLine() });
  stub.sessions = [{ ...session(S1), archived_at: '2026-11-15T11:00:00Z' }];
  stub.prefs.set(KEY, rec('Renamed Later', HOST_ID, S1));
  s = await showing('Renamed Later');
  const shut = { header: s.header, opened: [...stub.opened] };
  const shut0 = stub.sent.length;
  await ev(() => document.querySelector('.prompt').focus()); await page.send('Input.insertText', { text: 'hello again' }); await key('Enter');
  await until(() => stub.sent.length > shut0, 10000, 'the message to reach the stand-in').catch(() => {});
  const newSid = stub.made.at(-1), madeOn = stub.sessions.find((x) => x.id === newSid)?.execution_host_id;
  check('a bot whose conversation was archived keeps its name and opens none; the next message starts a fresh one on its computer and saves its id in the bot', shut.header === 'Renamed Later' && shut.opened.length === 0 && !!newSid && madeOn === HOST_ID && stub.to.at(-1) === newSid && stub.prefs.get(KEY)?.session_id === newSid && stub.prefs.get(KEY)?.name === 'Renamed Later', { shut, newSid, madeOn, to: stub.to.slice(-1), record: stub.prefs.get(KEY) });
  stub.prefs.set(KEY, rec('Renamed Later', HOST_ID, '00000000-0000-4000-8000-0000000000d9'));
  w0 = stub.writes.length; s = await showing('Renamed Later');
  check('a bot whose conversation Barkpark does not know (404) keeps its name, opens none and writes nothing', s.header === 'Renamed Later' && stub.opened.length === 0 && since(w0).length === 0, { header: s.header, opened: stub.opened, writes: since(w0) });

  stub.sessions = [session(S1)];
  freshStore({ name: 'Legacy Name' }); stub.fail.set('GET barkbot.bot', 500);
  w0 = stub.writes.length;
  s = await showing('BarkBot');
  const failedRead = { header: s.header, alert: await alertLine(), writes: since(w0) };
  stub.fail.clear();
  s = await showing('Legacy Name');
  check('one failed read of today\'s name writes nothing and says so; the next load, whose read works, moves the bot in with that name (control: the first load showed BarkBot)', failedRead.header === 'BarkBot' && failedRead.writes.length === 0 && /could not be read/.test(failedRead.alert ?? '') && s.header === 'Legacy Name' && stub.prefs.get(KEY)?.name === 'Legacy Name' && ids().join() === main, { failedRead, header: s.header, record: stub.prefs.get(KEY), ids: ids() });

  stub.fail.set('GET barkbot.bots', 500); w0 = stub.writes.length;
  let status = (await fetch(`${base}/`)).status;
  s = await showing('Legacy Name');
  check('a failed read of the bot list: the page still opens, on today\'s bot from memory, says so in one plain line, and writes nothing', status === 200 && s.header === 'Legacy Name' && /could not be read/.test((await alertLine()) ?? '') && since(w0).length === 0, { status, header: s.header, alert: await alertLine(), writes: since(w0) });

  stub.fail.clear(); freshStore({ name: 'Legacy Name' }); stub.fail.set(`PUT ${KEY}`, 500); w0 = stub.writes.length;
  status = (await fetch(`${base}/`)).status;
  s = await showing('Legacy Name');
  check('a failed save of the Main Bot: the page still opens with it, says it was not saved, and adds no id for a record that is not there', status === 200 && s.header === 'Legacy Name' && /could not be saved/.test((await alertLine()) ?? '') && ids().length === 0 && !stub.prefs.has(KEY) && since(w0).every((w) => w.method === 'PUT'), { status, header: s.header, alert: await alertLine(), ids: ids(), writes: since(w0) });

  stub.fail.clear(); freshStore({ name: 'Legacy Name' }); stub.fail.set('PATCH barkbot.bots', 500);
  s = await showing('Legacy Name');
  const left = { header: s.header, alert: await alertLine(), record: stub.prefs.get(KEY)?.name, ids: [...ids()] };
  stub.fail.clear();
  stub.prefs.set(KEY, { ...stub.prefs.get(KEY), name: 'Kept Name' }); // as a rename in between would save it
  w0 = stub.writes.length;
  s = await showing('Kept Name');
  check('a save whose list add failed leaves a record with no list entry and says so; the next load adds its id and keeps the record as it is now, never written over', left.header === 'Legacy Name' && /could not be saved/.test(left.alert ?? '') && left.record === 'Legacy Name' && left.ids.length === 0 && ids().join() === main && s.header === 'Kept Name' && stub.prefs.get(KEY)?.name === 'Kept Name' && since(w0).filter((w) => w.method === 'PUT').length === 0, { left, header: s.header, ids: ids(), writes: since(w0) });

  stub.prefs.set('barkbot.bots', { ids: [main, main] });
  s = await showing('Kept Name');
  check('an id twice in the list is one bot in the rail', s.tiles.filter((t) => t === 'Kept Name').length === 1, { tiles: s.tiles });
  const many = Array.from({ length: 60 }, (_, i) => `a0000000-0000-4000-8000-0000000000${i.toString(16).padStart(2, '0')}`);
  many.forEach((id, i) => stub.prefs.set(`barkbot.bot.${id}`, rec(`Bot ${i}`, HOST_ID, null)));
  stub.prefs.set('barkbot.bots', { ids: [main, ...many] });
  const r0 = stub.readKeys.length; w0 = stub.writes.length;
  s = await showing('Kept Name');
  const recordReads = stub.readKeys.slice(r0).filter((k) => k.startsWith('barkbot.bot.')).length, tiles = s.tiles.filter((t) => t === 'Kept Name' || /^Bot \d+$/.test(t));
  check('one page load reads at most 50 bot records: the first 50 in the list are shown, the rest stay in the list untouched', recordReads === 50 && tiles.length === 50 && tiles.at(-1) === 'Bot 48' && ids().length === 61 && since(w0).length === 0, { recordReads, tiles: tiles.length, last: tiles.at(-1), ids: ids().length, writes: since(w0) });
  stub.sessions = []; freshStore(); stub.fail.clear(); stub.sent = []; stub.to = []; stub.made = []; stub.shown = [];

  // The bot's computer stops and comes back while the page is open (seen live 2026-11-11: a
  // message sent to a stopped computer showed no reply and no reason).
  console.log('Behaviour · the computer goes away (the live page, against the stand-in Barkpark)');
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
  freshStore(); // the Main Bot is made again from this session, as today's bot moves in
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
  const kept = () => ev(() => [...document.querySelectorAll('.turn-card [aria-label="Your answer"]')].map((g) => ({ q: g.closest('.qcard')?.querySelector('.qcard-q')?.textContent, letter: g.querySelector('.ask-letter')?.textContent, label: g.querySelector('.ask-label')?.textContent, rows: g.querySelectorAll('.qcard-row').length })));
  await until(async () => (await kept()).length > 0, 3000, 'the answered card').catch(() => {});
  const k1 = await kept();
  check('once the bot has the answer, the card stays in the conversation answered: the question and only B pear (control: no choices left to press)', k1.length === 1 && k1[0].q === 'Which fruit?' && k1[0].letter === 'B' && k1[0].label === 'pear' && k1[0].rows === 1 && (await choices()).length === 0, { k1 });
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
  const waiting = () => ev(() => ({ chips: [...document.querySelectorAll('.composer-attachments [role=listitem]')].map((x) => x.getAttribute('aria-label')), send: document.querySelector('.composer .round.voice')?.getAttribute('aria-label') }));
  await until(async () => (await waiting()).chips.length === 1, 5000, 'the chip').catch(() => {});
  let w = await waiting();
  check('a picked picture waits as a thumbnail in the box, the round button says Send message, and nothing is stored or sent yet', w.chips.length === 1 && /behaviour-picture/.test(w.chips[0]) && w.send === 'Send message' && stub.uploads.length === 0 && stub.sent.length === 0, { w, uploads: stub.uploads.length, sent: stub.sent.length });
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

  // A text file goes with a message as a picture does, named by its id and its name; the sent
  // message shows it as a file card (oracle 1.0.3, oracle-file-sent), also after a reload.
  console.log('Behaviour · a text file with a message (the live page, against the stand-in Barkpark)');
  const NOTE = Buffer.from('The code is K7-PLUM-42.\n'); const noteId = createHash('sha256').update(NOTE).digest('hex');
  const notePath = path('.cache', `note-${CHROME_PORT}.txt`); writeFileSync(notePath, NOTE);
  const zipPath = path('.cache', `bundle-${CHROME_PORT}.zip`); writeFileSync(zipPath, Buffer.from('504b0304140000000000', 'hex'));
  const binPath = path('.cache', `blob-${CHROME_PORT}`); /* no extension: the browser gives it no type, so Barkpark judges it */ writeFileSync(binPath, Buffer.from([0, 1, 2, 3, 0xff, 0]));
  const pick = async (file) => { const { root: r } = await page.send('DOM.getDocument'); const { nodeId: n } = await page.send('DOM.querySelector', { nodeId: r.nodeId, selector: '.composer-wrap input[type=file]' }); await page.send('DOM.setFileInputFiles', { nodeId: n, files: [file] }); };
  const box = () => ev(() => ({ chips: [...document.querySelectorAll('.composer-attachments [role=listitem]')].map((x) => x.getAttribute('aria-label')), size: document.querySelector('.composer-attachments .file-size')?.textContent ?? null, words: document.querySelector('.prompt')?.innerText.trim() ?? '', line: document.querySelector('.composer-refused')?.textContent ?? null, cards: [...document.querySelectorAll('.turn-attached .file-card')].map((x) => [x.getAttribute('aria-label'), x.querySelector('.file-size')?.textContent]), bubbles: document.querySelectorAll('.bubble-user').length }));
  const type = async (text) => { await ev(() => document.querySelector('.prompt').focus()); await page.send('Input.insertText', { text }); };
  const sent0 = stub.sent.length; const up0 = stub.uploads.length;
  await pick(zipPath);
  await until(async () => (await box()).line !== null, 5000, 'the refusal line').catch(() => {});
  let f = await box();
  check('a zip is refused in a plain line, and nothing is stored or sent', /bundle-\d+\.zip is not a picture, a text file or a PDF/.test(f.line ?? '') && f.chips.length === 0 && stub.uploads.length === up0 && stub.sent.length === sent0 && stub.refused.length === 0, { f, uploads: stub.uploads.length - up0, sent: stub.sent.length - sent0 });
  await pick(notePath);
  await until(async () => (await box()).chips.length === 1, 5000, 'the file chip').catch(() => {});
  f = await box();
  check('a picked text file waits in the box by name and size, and nothing is stored or sent yet', f.chips.length === 1 && /^note-\d+\.txt$/.test(f.chips[0]) && f.size === `${NOTE.length}B` && f.line === null && stub.uploads.length === up0 && stub.sent.length === sent0, { f });
  await type('read it'); await key('Enter');
  await until(() => stub.sent.length > sent0, 8000, 'the message to reach the stand-in').catch(() => {});
  await until(async () => (await box()).cards.length > 0, 8000, 'the file card').catch(() => {});
  f = await box();
  const named = stub.sent[sent0]?.attachments;
  check('Enter: the file is stored once, the message names it by id and name, and the sent message shows it as a file card above its words', stub.uploads.length === up0 + 1 && stub.uploads.at(-1) === noteId && stub.sent.length === sent0 + 1 && stub.sent[sent0].content === 'read it' && JSON.stringify(named) === JSON.stringify([{ id: noteId, name: notePath.split('/').pop() }]) && f.chips.length === 0 && f.cards.length === 1 && f.cards[0][0] === `Open ${notePath.split('/').pop()}` && f.cards[0][1] === `${NOTE.length}B`, { uploads: stub.uploads.slice(up0), named, f });
  // Barkpark refuses what is not text, a PDF or a picture: the line says so and nothing is sent.
  await pick(binPath);
  await until(async () => (await box()).chips.length === 1, 5000, 'the unknown file chip').catch(() => {});
  await type('and this'); await key('Enter');
  await until(() => stub.refused.length > 0, 8000, 'the upload to be refused').catch(() => {});
  await until(async () => (await box()).line !== null, 5000, 'the refusal line').catch(() => {});
  f = await box();
  check('a file Barkpark refuses: the line says it was not taken, nothing is sent, and the words and the file stay in the box', stub.refused.length === 1 && stub.refused[0].upload && stub.sent.length === sent0 + 1 && /blob-\d+ was not taken/.test(f.line ?? '') && f.words === 'and this' && f.chips.length === 1, { refused: stub.refused, sent: stub.sent.length - sent0, f });
  await ev(() => document.querySelector('.attach-file-remove')?.click());
  await ev(() => { const p = document.querySelector('.prompt'); p.replaceChildren(); p.dispatchEvent(new InputEvent('input', { bubbles: true })); });
  // A computer that cannot take files (Barkpark's 422): a plain line, the draft kept; once it can, the same draft goes.
  const b0 = (await box()).bubbles;
  stub.noFiles = true;
  await pick(notePath);
  await until(async () => (await box()).chips.length === 1, 5000, 'the file chip').catch(() => {});
  await type('try again'); await key('Enter');
  await until(() => stub.refused.length > 1, 8000, 'the message to be refused').catch(() => {});
  await until(async () => (await box()).line !== null, 5000, 'the refusal line').catch(() => {});
  f = await box();
  check("a computer that cannot take files: a plain line says so, nothing is sent, and the words and the file stay in the box", stub.refused.length === 2 && stub.refused[1].message?.content === 'try again' && stub.sent.length === sent0 + 1 && /cannot take this file/.test(f.line ?? '') && f.words === 'try again' && f.chips.length === 1 && f.bubbles === b0, { refused: stub.refused, b0, f });
  stub.noFiles = false;
  await ev(() => document.querySelector('.prompt').focus()); await key('Enter');
  await until(() => stub.sent.length > sent0 + 1, 8000, 'the kept draft to go').catch(() => {});
  await wait(300);
  f = await box();
  check('the kept draft is a real one: Enter sends those words and that file (control)', stub.sent.length === sent0 + 2 && stub.sent.at(-1).content === 'try again' && JSON.stringify(stub.sent.at(-1).attachments) === JSON.stringify([{ id: noteId, name: notePath.split('/').pop() }]) && f.line === null && f.chips.length === 0 && f.bubbles === b0 + 1, { sent: stub.sent.slice(sent0), f });
  // After a reload the card comes from the stored row: Barkpark's attachments[] carries the file's name.
  stub.rows = [{ seq: 1, role: 'user', source_markdown: 'read it', attachments: [{ id: noteId, media_type: 'text/plain', byte_size: NOTE.length, url: `/v1/chat/sessions/${SESSION}/attachments/${noteId}`, name: 'note.txt' }] }, { seq: 2, role: 'user', source_markdown: 'words only' }];
  await open(`${base}/`);
  await until(async () => (await box()).bubbles >= 2, 30000, 'the stored rows').catch(() => {});
  f = await box();
  check('a reload: the stored row shows its file card by name and size, once (control: the row with no attachments shows none)', f.bubbles === 2 && f.cards.length === 1 && f.cards[0][0] === 'Open note.txt' && f.cards[0][1] === `${NOTE.length}B`, { f });
  stub.rows = [];
  [notePath, zipPath, binPath].forEach((x) => rmSync(x, { force: true }));

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

  // The bot's own summary of the turn (Barkpark #26296: event runtime, kind status, once a turn
  // after turn_started and before the first text): the working line says it, as plain words.
  console.log('Behaviour · the working line says the bot\'s summary (the live page, against the stand-in Barkpark)');
  const line = () => ev(() => { const r = document.querySelector('.working:not(.leaving)'); return r ? (r.querySelector('.work-label')?.textContent ?? '') : null; });
  stub.rows = []; stub.fleet = 'working';
  await open(`${base}/`);
  await until(() => stub.streams.length > 0, 30000, 'the fresh page to open its stream').catch(() => {});
  await wait(300);
  say('turn_started');
  await until(async () => (await line()) !== null, 5000, 'the working line').catch(() => {});
  await wait(400);
  const bare = await line();
  say('status', { native: { kind: 'status', label: 'Explaining <b>ocean</b> tides' } });
  await until(async () => (await line()) === 'Explaining <b>ocean</b> tides', 3000, 'the label').catch(() => {});
  const said = await line();
  const html = await ev(() => !!document.querySelector('.work-label b'));
  check('a status event shows its words on the working line, as text and not markup (control: before it the line has none)', bare === '' && said === 'Explaining <b>ocean</b> tides' && !html, { bare, said, html });
  say('item_started', textItem); say('text_delta', { native: { delta: 'The moon pulls.' } });
  await until(async () => (await line()) === 'Typing…', 3000, 'Typing…').catch(() => {});
  say('status', { native: { kind: 'status', label: 'Too late' } });
  await wait(400);
  const late = await line();
  check('once its text streams the line says Typing…, and a status after that is ignored', late === 'Typing…', { late });
  say('item_completed', textItem); say('turn_completed');
}

console.log(failed ? `Behaviour: ${failed} of ${ran} rules fail` : `Behaviour: all ${ran} rules hold`);
process.exit(failed ? 1 : 0);
