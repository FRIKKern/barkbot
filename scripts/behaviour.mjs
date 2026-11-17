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
import { queueProbe } from './lib/queue-probe.mjs';

const args = process.argv.slice(2);
const opt = (k) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
const freePort = () => new Promise((ok, no) => { const s = createServer().once('error', no).listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); });
const APP_PORT = await freePort(), CHROME_PORT = await freePort();
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = path('.cache', `behaviour-chrome-${CHROME_PORT}`);
// The ids the app's Create tries first, one per line (app/src/chat/api.ts minter); absent: random.
const MINT = path('.cache', `behaviour-mint-${CHROME_PORT}`);
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
// pref call fail: 'GET barkbot.bots' → 500; stub.failShow (session id, or '*' for every one → status) makes a session's own read fail. stub.to is the session each message or answer went to.
const stub = { bodies: [], noFolders: false, unsupported: false, prefs: new Map(), reads: 0, writes: [], opened: [], other: [], hosts: [], sessions: [], answers: [], choices: [], streams: [], rows: [], rowsBy: new Map(), fleet: null, stateBy: new Map(), fleets: [], fleetOpens: 0, uploads: [], sent: [], pictures: new Map(), refused: [], noFiles: false, createDelay: 0, holdSend: false, heldSends: [], slowNew: false, slow: new Set(), readDelay: 0, failCreate: false, failSend: false, failedSends: [], dropAnswer: false, afterTake: null, deafNew: false, deaf: new Set(), fail: new Map(), failShow: new Map(), hangPut: null, hung: [], readAs: new Map(), slowReads: 0, dropPatch: null, failAfterPatch: null, latePatch: null, holdShow: new Set(), heldShows: [], shown: [], made: [], to: [], readKeys: [] };
// The stand-in's side of a conversation's event stream: say an event to every open page.
const say = (kind, more = {}) => stub.streams.forEach((res) => res.write(`event: runtime\ndata: ${JSON.stringify({ kind, ...more })}\n\n`));
// The fleet stream's side: one session's state flips, said to every open fleet stream (Barkpark's `event: state`).
const flip = (sid, state) => { stub.stateBy.set(sid, state); stub.fleets.forEach((res) => res.write(`event: state\ndata: ${JSON.stringify({ session_id: sid, agent_state: state })}\n\n`)); };
// Per-account prefs, as Barkpark's (docs/contracts/user-prefs.md): GET, PUT, and PATCH add/remove on a list.
const PREFS = '/w/default/p/default/v1/prefs/production/';
// The bot store's writes, from stub.writes: a bot key's PUTs, the list's adds, and the legacy key.
const botPuts = () => stub.writes.filter((w) => w.method === 'PUT' && w.key.startsWith('barkbot.bot.'));
// The name a write to a bot's record writes, whole (PUT) or as one field (PATCH set), else undefined.
const nameIn = (w) => (!w.key.startsWith('barkbot.bot.') ? undefined : w.method === 'PUT' ? w.body?.value?.name : w.method === 'PATCH' && w.body?.op === 'set' && w.body?.field === 'name' ? w.body.item : undefined);
const listAdds = () => stub.writes.filter((w) => w.method === 'PATCH' && w.key === 'barkbot.bots' && w.body.op === 'add');
const legacyWrites = () => stub.writes.filter((w) => w.key === 'barkbot.bot');
// As Barkpark's sidebar shape (chat_controller.ex sidebar_json): the list carries no bot_folder.
const listed = () => stub.sessions.filter((x) => !x.archived_at).sort((a, b) => (b.last_active_at ?? b.inserted_at).localeCompare(a.last_active_at ?? a.inserted_at)).slice(0, 50).map(({ archived_at, bot_folder, ...x }) => x);
const freshStore = (legacy = null) => { stub.prefs.clear(); if (legacy) stub.prefs.set('barkbot.bot', legacy); };
const STUB_PORT = await freePort();
let madeN = 0; // every conversation the stand-in makes gets its own id for the whole run, as in Barkpark
await new Promise((ok) => httpServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    // `slowReads`: every JSON read (GET) answers, after that many ms (a slow but working Barkpark).
    const json = (code, v) => { const go = () => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); }; return stub.slowReads && req.method === 'GET' ? void setTimeout(go, stub.slowReads) : go(); };
    if (req.url.startsWith(PREFS)) {
      const key = decodeURIComponent(req.url.slice(PREFS.length)); const got = () => json(200, { key, dataset: 'production', value: stub.prefs.get(key) ?? null });
      const failing = stub.fail.get(`${req.method} ${key}`);
      // `readAs` (key → how) answers one key's read oddly: 'hang' never answers (BarkBot's 8 s read
      // bound calls it off); 'otherKey' / 'otherDataset' answer 200 value:null for another key or
      // dataset; 'empty' answers 200 {} (no prefs answer at all). Hung reads go to stub.hung.
      const readAs = req.method === 'GET' ? stub.readAs.get(key) : undefined;
      if (readAs) { stub.reads++; stub.readKeys.push(key); }
      if (readAs === 'hang') return void stub.hung.push(res);
      if (readAs === 'otherKey') return json(200, { key: 'barkbot.other', dataset: 'production', value: null });
      if (readAs === 'otherDataset') return json(200, { key, dataset: 'staging', value: null });
      if (readAs === 'empty') return json(200, {});
      if (req.method === 'GET') { stub.reads++; stub.readKeys.push(key); const answer = () => (failing ? json(failing, { error: { code: 'internal', message: 'the stand-in fails this read' } }) : got()); return stub.readDelay ? setTimeout(answer, stub.readDelay) : answer(); }
      const b = body ? JSON.parse(body) : {}; stub.writes.push({ method: req.method, key, body: b, failed: !!failing });
      if (failing) return json(failing, { error: { code: 'internal', message: 'the stand-in fails this write' } });
      // A record write: a whole-record PUT, or a PATCH set of one top-level field (Barkpark's row-locked
      // op, docs/contracts/user-prefs.md: a missing key is created with that one field; item null is 422).
      const isSet = req.method === 'PATCH' && b.op === 'set';
      if (isSet && (typeof b.field !== 'string' || !b.field || b.item === undefined || b.item === null)) return json(422, { error: { code: 'bad_request', message: 'set needs a field and a non-null item' } });
      const record = req.method === 'PUT' || isSet;
      const land = () => { if (req.method === 'PUT') stub.prefs.set(key, b.value); else stub.prefs.set(key, { ...(stub.prefs.get(key) ?? {}), [b.field]: b.item }); };
      // Whether this write changes `field` of the record as it is now.
      const changes = (field) => JSON.stringify(req.method === 'PUT' ? b.value?.[field] : b.field === field ? b.item : stub.prefs.get(key)?.[field]) !== JSON.stringify(stub.prefs.get(key)?.[field]);
      // `holdPut` {key, field, max}: the first record write to `key` that changes `field` waits
      // until another write to `key` has landed (or `max` ms), then lands after it: two writers that
      // each read the record before either wrote.
      // `hangPut`: every record write to that key is taken and never answered, and never lands
      // (a Barkpark that hangs on the write). Released by destroying stub.hung at the end of the rule.
      // `lateWrite` {key, field, ms}: the first record write to `key` that changes `field` is taken and
      // never answered, and Barkpark applies it `ms` later (a commit stuck behind a slow database).
      // `goneBeforeWrite`: the record at that key is removed just before the first record write to it
      // lands (removed after the writer read it).
      if (record && stub.hangPut === key) return void stub.hung.push(res);
      const lw = stub.lateWrite;
      if (record && lw?.key === key && !lw.taken && changes(lw.field)) { lw.taken = true; stub.hung.push(res); return void setTimeout(() => { land(); lw.landed = true; }, lw.ms); }
      if (record && stub.goneBeforeWrite === key) { stub.goneBeforeWrite = null; stub.prefs.delete(key); }
      const h = stub.holdPut;
      if (record && h?.key === key) {
        if (!h.pending && !h.done && changes(h.field)) {
          h.pending = () => { h.pending = null; h.done = true; clearTimeout(h.timer); land(); got(); };
          h.timer = setTimeout(() => h.pending?.(), h.max); return;
        }
        land(); got(); h.pending?.(); return;
      }
      // A set is held by `createDelay` as a PUT is (both are record writes).
      if (isSet) { land(); return stub.createDelay ? setTimeout(got, stub.createDelay) : got(); }
      if (req.method === 'PUT') { stub.prefs.set(key, b.value); return stub.createDelay ? setTimeout(got, stub.createDelay) : got(); }
      if (req.method === 'DELETE') { stub.prefs.delete(key); return got(); }
      if (req.method === 'PATCH') {
        if (!['add', 'remove'].includes(b.op)) return json(422, { error: { code: 'bad_request', message: 'unknown op' } });
        const apply = () => {
          const v = { ...(stub.prefs.get(key) ?? {}) }; const list = Array.isArray(v[b.field]) ? v[b.field] : [];
          v[b.field] = b.op === 'add' ? (list.includes(b.item) ? list : [...list, b.item]) : list.filter((x) => x !== b.item);
          stub.prefs.set(key, v);
        };
        // `latePatch` {key, ms}: the answer is lost at once (the socket drops), and Barkpark applies
        // the list op `ms` later (a commit that waited on the row lock or a slow database).
        if (stub.latePatch?.key === key) { setTimeout(apply, stub.latePatch.ms); return void req.socket.destroy(); }
        apply();
        // `dropPatch`: Barkpark applies the list op, then the answer is lost (the socket drops).
        // `failAfterPatch` ('GET <key>' → status): from then on that read fails too.
        if (stub.dropPatch === key) { if (stub.failAfterPatch) stub.fail.set(...stub.failAfterPatch); return void req.socket.destroy(); }
        return got();
      }
    }
    if (req.url.startsWith('/w/default/v1/chat-hosts')) return json(200, { hosts: stub.hosts });
    // As Barkpark (studio_chat.ex list_sessions): the list leaves out archived sessions and holds
    // only the 50 most recently active. A session's own read answers any session the admin token
    // can see, archived too, and 404 for an unknown id; it always carries bot_folder, null when none
    // (chat_controller.ex full_session_json).
    if (req.url === '/v1/chat/sessions' && req.method === 'GET') return json(200, { sessions: listed() });
    if (/^\/v1\/chat\/sessions\/[^/?]+(\?.*)?$/.test(req.url) && req.method === 'GET') {
      const id = decodeURIComponent(req.url.split('?')[0].split('/')[4]); stub.shown.push(id); const x = stub.sessions.find((y) => y.id === id);
      // `holdShow`: a read of that session that Barkpark never answers (released by destroying it).
      if (stub.holdShow.has(id)) return void stub.heldShows.push(res);
      if (stub.failShow.has(id) || stub.failShow.has('*')) return json(stub.failShow.get(id) ?? stub.failShow.get('*'), { error: { code: 'internal', message: 'the stand-in fails this read' } });
      return x ? json(200, { archived_at: null, bot_folder: null, ...x, messages: [] }) : json(404, { error: { code: 'not_found', message: 'chat session not found' } });
    }
    // A new conversation on a computer, as Barkpark. `createDelay` holds the answer (Create's Creating…).
    if (req.url === '/v1/chat/sessions' && req.method === 'POST') {
      // `failCreate`: Barkpark cannot make the conversation (after the same hold).
      if (stub.failCreate) return setTimeout(() => json(500, { error: { code: 'internal_error', message: 'the stand-in could not make it' } }), stub.createDelay);
      const b = JSON.parse(body); const x = { id: `00000000-0000-4000-8000-${String(900000000000 + madeN++)}`, execution_target: b.execution_target, execution_host_id: b.execution_host_id, inserted_at: new Date().toISOString(), status: 'active' };
      x.bot_folder = b.bot_folder ?? null; stub.bodies.push({ id: x.id, body: b }); stub.made.push(x.id); stub.sessions.push(x); if (stub.deafNew) stub.deaf.add(x.id); if (stub.slowNew) stub.slow.add(x.id); return setTimeout(() => json(201, x), stub.createDelay);
    }
    if (/^\/v1\/chat\/sessions\/[^/]+\/events$/.test(req.url) || req.url === '/v1/chat/events') {
      // `deafNew`: a conversation made meanwhile never opens its stream (Barkpark refuses it).
      if (stub.deaf.has(req.url.split('/')[4])) { res.writeHead(503, { 'content-type': 'text/plain' }); return res.end('unavailable'); }
      // `slowNew`: a conversation made meanwhile opens its stream only when the rule takes its id out of stub.slow.
      const go = () => {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }); res.write(': open\n\n');
        // As Barkpark: the stored rows first (a fresh page asks from 0), and the fleet's snapshot.
        if (req.url === '/v1/chat/events') {
          stub.fleetOpens++; stub.fleets.push(res); res.on('close', () => stub.fleets.splice(stub.fleets.indexOf(res), 1));
          if (stub.fleet) res.write(`event: snapshot\ndata: ${JSON.stringify({ sessions: stub.sessions.map((x) => ({ session_id: x.id, agent_state: stub.stateBy.get(x.id) ?? stub.fleet })) })}\n\n`);
        }
        else if (req.headers['last-event-id'] !== undefined) (stub.rowsBy.get(req.url.split('/')[4]) ?? stub.rows).forEach((r) => res.write(`id: ${r.seq}\nevent: message\ndata: ${JSON.stringify(r)}\n\n`));
        if (req.url !== '/v1/chat/events') { stub.opened.push(req.url.split('/')[4]); stub.streams.push(res); res.on('close', () => stub.streams.splice(stub.streams.indexOf(res), 1)); }
      };
      const sid = req.url.split('/')[4];
      if (stub.slow.has(sid)) { const t = setInterval(() => { if (!stub.slow.has(sid)) { clearInterval(t); go(); } }, 50); res.on('close', () => clearInterval(t)); return; }
      return go();
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
      // `holdSend`: Barkpark takes the message and does not answer until the rule lets it: 503 then,
      // or, when let go with `true`, it goes (202).
      if (stub.holdSend) { stub.heldSends.push((ok) => (ok ? (stub.sent.push(m), stub.to.push(req.url.split('/')[4]), json(202, { accepted: true })) : json(503, { error: { code: 'unavailable', message: 'the stand-in gave up' } }))); return; }
      // `dropAnswer`: Barkpark takes the message, then the answer is lost (the socket drops).
      if (stub.dropAnswer) { stub.sent.push(m); stub.to.push(req.url.split('/')[4]); return void req.socket.destroy(); }
      // `afterTake` {status, body}: Barkpark takes the message, then answers that (a 500 from storing the
      // user's turn after it went, chat_controller.ex create_message; a gateway's empty 502).
      if (stub.afterTake) { const { status, body: b } = stub.afterTake; stub.sent.push(m); stub.to.push(req.url.split('/')[4]); res.writeHead(status, b ? { 'content-type': 'application/json' } : {}); return res.end(b ? JSON.stringify(b) : ''); }
      // `failSend`: Barkpark refuses before the turn goes (503 runtime_unavailable): nothing is sent.
      if (stub.failSend) { stub.failedSends.push(m); return json(503, { error: { code: 'runtime_unavailable', message: 'the stand-in could not take it' } }); }
      // Barkpark's shared 422 chat_unsupported for any session (a revoked host, a provider not ready, …).
      if (stub.unsupported) { stub.refused.push({ unsupported: m }); return json(422, { error: { code: 'chat_unsupported', message: "chat is not supported for this session's provider or operation" } }); }
      // A host that does not advertise bot_folders: Barkpark's 422 chat_unsupported for a session with a folder.
      if (stub.noFolders && stub.sessions.find((x) => x.id === req.url.split('/')[4])?.bot_folder) { stub.refused.push({ folder: m }); return json(422, { error: { code: 'chat_unsupported', message: "chat is not supported for this session's provider or operation" } }); }
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
  const env = { ...process.env, BARKPARK_URL: `http://127.0.0.1:${STUB_PORT}`, BARKPARK_TOKEN: 'stand-in', BARKPARK_WORKSPACE: 'default', BARKPARK_PROJECT: 'default', BARKPARK_DATASET: 'production', BARKBOT_NAME: 'BarkBot', BARKBOT_TEST_MINT_FILE: MINT };
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
// The hover is a real mouse move (a page cannot hover itself), so the page is armed first: the
// background-color transition the hover starts is caught by its own transitionrun, its timing is
// read from it, and its fill at 60 ms is read by seeking it there, not by Node waiting 60 ms.
await ev(() => {
  const el = document.querySelector('.who-name'); window.__hover = null;
  const seen = (e) => {
    if (e.propertyName !== 'background-color') return;
    el.removeEventListener('transitionrun', seen);
    const a = el.getAnimations().find((x) => x.transitionProperty === 'background-color');
    if (!a) return void (window.__hover = { found: false });
    const { duration, easing } = a.effect.getComputedTiming(); const keyEasing = a.effect.getKeyframes()[0]?.easing;
    a.pause(); a.currentTime = 60; const at60 = getComputedStyle(el).backgroundColor; a.play();
    window.__hover = { found: true, duration, easing, keyEasing, at60 };
  };
  el.addEventListener('transitionrun', seen);
});
{ const [x, y, w, h] = field; await mouse('mouseMoved', x + w / 2, y + h / 2); }
await until(() => ev(() => window.__hover !== null), 5000, 'the hover transition').catch(() => {});
await wait(250); s = await name();
const hover = { ...(await ev(() => window.__hover)), settled: s.bg };
// 'ease' at half its time is 0.8024 of the way: alpha 0.08 × 0.8024 = 0.0642.
const alpha60 = Number(/rgba\(245, 245, 245, ([\d.]+)\)/.exec(hover.at60 ?? '')?.[1] ?? NaN);
check('hover: fills to rgba(245,245,245,0.08) through a 120 ms ease transition (control: at 60 ms it is part way, alpha 0.0642)', s.bg === 'rgba(245, 245, 245, 0.08)' && hover.found && hover.duration === 120 && (hover.easing === 'ease' || hover.keyEasing === 'ease') && Math.abs(alpha60 - 0.0642) <= 0.004, hover);

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
  // Every write of a name after the Main Bot's record was made: whole or as the one field.
  const named0 = stub.writes.length;
  const renames = () => stub.writes.slice(named0).filter((w) => nameIn(w) !== undefined).map((w) => ({ name: nameIn(w) }));

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
  // A page that fails to load (a 500) is a failed rule below, not a crash here.
  const showing = async (want) => {
    stub.opened = [];
    try { await open(`${base}/`); } catch {}
    await until(async () => (await live()).header === want, 15000, `the page to show "${want}"`).catch(() => {}); await wait(500);
    return live().catch(() => ({ header: null, tiles: [], rect: null }));
  };
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
  check('the Main Bot\'s new conversation names no bot folder: it works in the computer\'s shared root, as today\'s bot always has', !!newSid && stub.bodies.findLast((x) => x.id === newSid) && !('bot_folder' in stub.bodies.findLast((x) => x.id === newSid).body), { body: stub.bodies.findLast((x) => x.id === newSid) });
  // The same shared code for the Main Bot, whose conversation has no folder: never the folder line.
  stub.unsupported = true; const un0 = stub.sent.length, unRef0 = stub.refused.length;
  await ev(() => document.querySelector('.prompt').focus()); await page.send('Input.insertText', { text: 'hello host' }); await key('Enter');
  await until(async () => (await ev(() => document.querySelector('.composer-refused, .chat-error')?.textContent ?? null)) !== null, 10000, "the Main Bot's refused message to answer").catch(() => {}); await wait(300);
  const un = { refusedLine: await ev(() => document.querySelector('.composer-refused')?.textContent ?? null), errorLine: await ev(() => document.querySelector('.chat-error')?.textContent ?? null), sent: stub.sent.slice(un0).length, refused: stub.refused.slice(unRef0).length };
  stub.unsupported = false;
  check("the Main Bot refused with Barkpark's shared chat_unsupported: the page says what Barkpark said, never the bot-folder line, and nothing is sent", un.refused === 1 && un.sent === 0 && !/folder|newer chat host/.test(`${un.refusedLine ?? ''} ${un.errorLine ?? ''}`) && /not supported/.test(un.errorLine ?? ''), un);
  await ev(() => { const p = document.querySelector('.prompt'); p.replaceChildren(); p.dispatchEvent(new InputEvent('input', { bubbles: true })); });
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
  check('… and, the store being there, it opens no conversation: the newest one on the computer may be another bot\'s', stub.opened.length === 0, { opened: stub.opened });

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
  stub.sessions = []; freshStore(); stub.fail.clear(); stub.sent = []; stub.to = []; stub.made = []; stub.shown = []; stub.bodies = [];

  // The bot's computer stops and comes back while the page is open (seen live 2026-11-11: a
  // message sent to a stopped computer showed no reply and no reason).
  // ── Create makes a bot (task-b7245cbd7634c631; traces/2026-11-08-create-oracle.json) ──────
  console.log('Behaviour · Create makes a bot (the live page, against the stand-in Barkpark)');
  stub.sessions = [session(S1)]; stub.rows = []; freshStore();
  await showing('BarkBot');
  const pinned = () => ev(() => [...document.querySelectorAll('.rail-list .rail-tile')].map((t) => t.getAttribute('aria-label')));
  const dialog = () => ev(() => !!document.querySelector('.dialog.new-bot'));
  const openDialog = async () => { const at = await ev(() => { const r = document.querySelector('button[aria-label="New Bot"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); await click(...at); await until(dialog, 5000, 'the New Bot dialog').catch(() => {}); };
  const press = async (label) => { const at = await ev((l) => { const b = [...document.querySelectorAll('.dialog.new-bot button')].find((x) => x.textContent.trim() === l || x.getAttribute('aria-label') === l); const r = b?.getBoundingClientRect(); return r ? [r.x + r.width / 2, r.y + r.height / 2] : null; }, label); if (at) await click(...at); };
  const typeName = async (t) => { await ev(() => document.querySelector('.new-bot-name').focus()); await page.send('Input.insertText', { text: t }); await wait(30); };
  const w1 = stub.writes.length, c1 = stub.made.length, railBefore = await pinned();
  await openDialog(); await key('Escape'); await wait(200);
  await openDialog(); await press('Close dialog'); await wait(200);
  await openDialog(); await typeName('Pip'); await press('Cancel'); await wait(200);
  await openDialog(); await typeName('   '); await press('Create'); await key('Enter'); await wait(300);
  const quiet = stub.writes.slice(w1);
  check('Cancel, Close dialog, Escape and Create with only spaces write nothing (control: the next rule\'s Create writes)', quiet.length === 0 && stub.made.length === c1 && JSON.stringify(await pinned()) === JSON.stringify(railBefore), { quiet, created: stub.made.slice(c1), railBefore });
  await key('Escape'); await wait(200);
  // The real Create. Barkpark's answer is held 400 ms, so the label in flight can be seen.
  stub.createDelay = 400;
  await openDialog(); await typeName('Pip');
  // The span is the click on Create to the tile's node in the rail, as the oracle trace measured it
  // (traces/2026-11-08-create-oracle.json: add rail listitem at 1150.9 ms). It is armed inside the
  // page in the same evaluate that clicks, so no CDP round trip from Node sits inside it; the label
  // in flight is seen by the same observer, not read by Node after a wait.
  const w2 = stub.writes.length;
  await ev(() => {
    window.__tileAt = null; window.__creating = false;
    const button = [...document.querySelectorAll('.dialog.new-bot button')].find((b) => b.textContent.trim() === 'Create');
    const t0 = performance.now(); window.__t0 = t0;
    new MutationObserver((_, o) => {
      if ([...document.querySelectorAll('.dialog.new-bot button')].some((b) => b.textContent.trim() === 'Creating…')) window.__creating = true;
      if ([...document.querySelectorAll('.rail-tile')].some((t) => t.getAttribute('aria-label') === 'Pip')) { window.__tileAt = performance.now() - t0; o.disconnect(); }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    button.click();
  });
  await until(() => ev(() => window.__tileAt !== null), 10000, 'the new tile').catch(() => {});
  const label = (await ev(() => window.__creating)) ? 'Creating…' : null;
  // Where the span went: each request in it, from the click (ms in, ms long).
  const tileNet = await ev(() => performance.getEntriesByType('resource').filter((e) => e.startTime >= window.__t0 && e.startTime <= window.__t0 + (window.__tileAt ?? 0)).map((e) => [e.name.replace(location.origin, '').slice(0, 60), Math.round(e.startTime - window.__t0), Math.round(e.duration)]));
  await until(async () => (await live()).header === 'Pip', 10000, 'the new bot to open').catch(() => {});
  await wait(500);
  stub.createDelay = 0;
  const pipId = await ev(() => new URLSearchParams(location.search).get('bot'));
  const made2 = stub.writes.slice(w2);
  const railAfter = await pinned(), tileAt = await ev(() => window.__tileAt);
  const empty = await ev(() => document.querySelectorAll('.bubble').length === 0);
  check('Create with a name adds one tile at the end of Pinned Bots and opens that bot\'s empty conversation', railAfter.length === railBefore.length + 1 && railAfter.at(-1) === 'Pip' && (await live()).header === 'Pip' && empty && !(await dialog()), { before: railBefore, after: railAfter, pipId });
  check('control: that Create wrote one bot key and one add, and made no Barkpark conversation (its first message makes it)', made2.filter((w) => w.method === 'PUT' && w.key === `barkbot.bot.${pipId}`).length === 1 && made2.filter((w) => w.method === 'PATCH' && w.key === 'barkbot.bots').length === 1 && made2.length === 2 && stub.made.length === c1 && stub.prefs.get(`barkbot.bot.${pipId}`)?.session_id === null, { made2, made: stub.made.slice(c1) });
  check('Create reads Creating… while the writes are in flight, and the tile lands no later than the oracle\'s 1151 ms', label === 'Creating…' && typeof tileAt === 'number' && tileAt <= 1151, { label, tileAt, tileNet });
  const here = await ev(() => location.href);
  stub.opened = []; await open(here);
  await until(async () => (await live()).header === 'Pip', 15000, 'the reloaded page').catch(() => {}); await wait(500);
  const again = await pinned();
  check('a reload shows the tile and the bot, still with no conversation made', again.at(-1) === 'Pip' && (await live()).header === 'Pip' && stub.opened.length === 0 && stub.made.length === c1, { again, opened: stub.opened, here });
  const pipMade0 = stub.made.length, pipSent0 = stub.sent.length;
  await ev(() => document.querySelector('.prompt').focus()); await page.send('Input.insertText', { text: 'hello pip' }); await key('Enter');
  await until(() => stub.sent.length > pipSent0, 10000, 'Pip\'s first message').catch(() => {});
  const pipSession = stub.made.at(-1);
  check('Pip\'s first message makes its one conversation on the computer, saves it in Pip\'s record, and goes there', stub.made.length === pipMade0 + 1 && stub.prefs.get(`barkbot.bot.${pipId}`)?.session_id === pipSession && stub.to.at(-1) === pipSession, { made: stub.made.slice(pipMade0), record: stub.prefs.get(`barkbot.bot.${pipId}`), to: stub.to.slice(-1) });

  const pipBody = stub.bodies.findLast((x) => x.id === pipSession)?.body;
  check('a made bot\'s first conversation asks for its own folder: bot- and the first 8 hex of its id, one segment Barkpark takes', pipBody?.bot_folder === `bot-${pipId.slice(0, 8)}` && /^[a-z0-9][a-z0-9-]{0,39}$/.test(pipBody.bot_folder) && pipBody.provider === 'claude' && pipBody.execution_target === 'registered_host', { pipBody, pipId });
  // A computer whose chat host cannot run a bot in its folder: a plain line, the draft kept, never sent without the folder.
  await openDialog(); await typeName('Fern'); await press('Create');
  await until(async () => (await live()).header === 'Fern', 10000, 'Fern to open').catch(() => {}); await wait(500);
  stub.noFolders = true;
  const fernMade0 = stub.made.length, fernSent0 = stub.sent.length, fernRef0 = stub.refused.length;
  await ev(() => document.querySelector('.prompt').focus()); await page.send('Input.insertText', { text: 'hello fern' }); await key('Enter');
  await until(async () => (await ev(() => document.querySelector('.composer-refused')?.textContent ?? null)) !== null || stub.sent.length > fernSent0, 10000, 'Fern\'s first message to answer').catch(() => {}); await wait(500);
  const fern = { line: await ev(() => document.querySelector('.composer-refused')?.textContent ?? null), words: await ev(() => document.querySelector('.prompt')?.innerText.trim() ?? ''), made: stub.bodies.filter((x) => stub.made.slice(fernMade0).includes(x.id)).map((x) => x.body.bot_folder ?? null), sent: stub.sent.slice(fernSent0), refused: stub.refused.slice(fernRef0).length };
  stub.noFolders = false;
  check('a chat host that cannot run a bot in its own folder: one plain line says so, the words stay, nothing is sent, and it is never tried without the folder', /newer chat host/.test(fern.line ?? '') && fern.words === 'hello fern' && fern.sent.length === 0 && fern.refused === 1 && fern.made.length === 1 && /^bot-[0-9a-f]{8}$/.test(fern.made[0] ?? ''), fern);
  await ev(() => { const p = document.querySelector('.prompt'); p.replaceChildren(); p.dispatchEvent(new InputEvent('input', { bubbles: true })); });

  // What Create refuses, and a Create that fails half-way: nothing is left behind.
  const failLine = () => ev(() => document.querySelector('.new-bot-failed')?.textContent ?? null);
  const tryCreate = async (name) => { const w = stub.writes.length, m = stub.made.length; await openDialog(); await typeName(name); await press('Create'); await until(async () => (await failLine()) !== null || !(await dialog()), 10000, `Create ${name} to answer`).catch(() => {}); await wait(300); const out = { line: await failLine(), open: await dialog(), writes: stub.writes.slice(w), made: stub.made.slice(m), keys: [...stub.prefs].filter(([k, v]) => k.startsWith('barkbot.bot.') && v?.name === name).length }; await key('Escape'); await wait(200); return out; };
  stub.fail.set('PATCH barkbot.bots', 500);
  let tc = await tryCreate('Ghost');
  stub.fail.clear();
  check('a Create whose list add fails says so in the dialog, makes no Barkpark conversation, and leaves no record behind', /not made/.test(tc.line ?? '') && tc.open && tc.made.length === 0 && tc.keys === 0 && tc.writes.some((w) => w.method === 'DELETE'), tc);
  const odd = await ev(async (id) => { const m = await import('/src/chat/api.ts'); const out = []; for (const d of [{ name: 'Odd', shape: '<svg onload=x>' }, { name: 'Odd', colour: 'url(javascript:x)' }]) { try { await m.createBot({ data: d }); out.push('made'); } catch (e) { out.push(String(e?.message ?? e)); } } return out; });
  check('Create refuses a shape or colour that is not one of the dialog\'s own, and writes nothing', odd.length === 2 && odd.every((x) => x !== 'made') && ![...stub.prefs].some(([k, v]) => k.startsWith('barkbot.bot.') && v?.name === 'Odd'), { odd });
  // A made bot's folder comes from its id: an id that gives none makes no conversation (never the
  // shared root in its place); upper-case hex is read as lower.
  const folderMade0 = stub.made.length;
  const folderTry = await ev(async ([hostId, upper]) => { const m = await import('/src/chat/api.ts'); const out = []; for (const botId of ['not-a-bot-id', upper]) { try { await m.startChat({ data: { hostId, botId } }); out.push('made'); } catch (e) { out.push(String(e?.message ?? e)); } } return out; }, [stub.hosts[0].id, pipId.toUpperCase()]);
  const folderBodies = stub.made.slice(folderMade0).map((id) => stub.bodies.findLast((x) => x.id === id)?.body.bot_folder ?? null);
  check("a made bot whose id gives no folder makes no conversation and says so plainly; an upper-case id is read as lower and gets the bot's own folder", /no folder/.test(folderTry[0]) && folderTry[1] === 'made' && JSON.stringify(folderBodies) === JSON.stringify([`bot-${pipId.slice(0, 8)}`]), { folderTry, folderBodies });
  // 50 bots that each show: a listed id with no record is no bot (task-c95974b430641fe6).
  const full = [...ids()]; for (let i = full.length; i < 50; i++) { const id = crypto.randomUUID(); full.push(id); stub.prefs.set(`barkbot.bot.${id}`, rec(`Full ${i}`, HOST_ID, null)); }
  stub.prefs.set('barkbot.bots', { ids: full });
  tc = await tryCreate('Over');
  check('with 50 bots listed (the most one load shows), Create refuses in one plain line and writes nothing, makes no conversation', /50 bots/.test(tc.line ?? '') && tc.open && tc.writes.length === 0 && tc.made.length === 0, tc);
  stub.hosts = []; stub.opened = []; await open(`${base}/`); await until(async () => (await live()).header === 'BarkBot', 15000, 'the page with no computer').catch(() => {}); await wait(300);
  tc = await tryCreate('Lonely');
  stub.hosts = host(true);
  check('with no computer enrolled, Create refuses in one plain line (a bot works on a computer) and writes nothing', /no(ne)? .*enrolled|npm run host:enroll/.test(tc.line ?? '') && tc.open && tc.writes.length === 0 && tc.made.length === 0, tc);

  // ── Two bots never share a folder (task-c7929f26e51c447a) ──────────────────────────────────
  // A folder is bot- and the first 8 hex of the bot's id, so Create's new id must not share them
  // with a bot already listed. MINT seeds the ids Create tries first; Create takes up to 8.
  {
    const A = 'abcdef12-1111-4111-8111-111111111111', clash = (n) => `abcdef12-${String(n).padStart(4, '0')}-4222-8222-222222222222`, C = '0badc0de-3333-4333-8333-333333333333';
    const folder = (id) => `bot-${id.slice(0, 8)}`;
    const make = async (lines, seed = () => {}) => {
      writeFileSync(MINT, lines.join('\n'));
      freshStore(); stub.prefs.set('barkbot.bots', { ids: [A] }); stub.prefs.set(`barkbot.bot.${A}`, rec('Ada', HOST_ID, null)); seed(); const w = stub.writes.length;
      const out = await ev(async () => { const m = await import('/src/chat/api.ts'); try { return { id: (await m.createBot({ data: { name: 'Twin' } })).id }; } catch (e) { return { refused: String(e?.message ?? e) }; } });
      return { ...out, ids: ids(), writes: stub.writes.slice(w).map((x) => `${x.method} ${x.key}`) };
    };
    let t = await make([C]);
    check('control: Create takes the first id it is given when its folder is free', t.id === C && t.ids.join() === [A, C].join(), t);
    t = await make([clash(1), C]);
    check("Create's first id shares its folder with a listed bot's: Create takes the next id, and the two bots work in two folders", t.id === C && folder(t.id) !== folder(A) && t.ids.join() === [A, C].join() && !stub.prefs.has(`barkbot.bot.${clash(1)}`), t);
    t = await make(Array.from({ length: 8 }, (_, i) => clash(i + 1)));
    check('every id Create tries shares a listed bot\'s folder: Create refuses in one plain line and writes nothing', /folder/.test(t.refused ?? '') && t.ids.join() === A && t.writes.length === 0, t);
    // A new id is a lower-case v4 UUID, whatever gives it: a v5, a v1 or an upper-case one is passed over.
    t = await make(['12345678-aaaa-5aaa-8aaa-aaaaaaaaaaaa', '23456789-bbbb-1bbb-8bbb-bbbbbbbbbbbb', 'ABCDEF99-CCCC-4CCC-8CCC-CCCCCCCCCCCC', C]);
    check('Create passes over an id that is not a lower-case v4 UUID (v5, v1, upper case) and takes the next', t.id === C && t.ids.join() === [A, C].join(), t);
    // The seeded ids never overwrite a record, even one off the list.
    const O = 'fedcba98-7777-4777-8777-777777777777', orphan = rec('Orphan', HOST_ID, '00000000-0000-4000-8000-0000000000aa');
    t = await make([O, C], () => stub.prefs.set(`barkbot.bot.${O}`, orphan));
    check('a seeded id whose record is there, off the list, is passed over: Create takes the next, and that record is untouched', t.id === C && JSON.stringify(stub.prefs.get(`barkbot.bot.${O}`)) === JSON.stringify(orphan) && !t.writes.includes(`PUT barkbot.bot.${O}`), { ...t, orphan: stub.prefs.get(`barkbot.bot.${O}`) });
    rmSync(MINT, { force: true }); freshStore();
  }
  // A bot already listed when today's bot has not moved in yet: today's bot still moves in.
  const OTHER = '9d2a3b4c-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
  freshStore({ name: 'Legacy Name' }); stub.sessions = [session(S1)];
  stub.prefs.set('barkbot.bots', { ids: [OTHER] }); stub.prefs.set(`barkbot.bot.${OTHER}`, rec('Other', HOST_ID, null));
  w0 = stub.writes.length; s = await showing('Other');
  const moved2 = stub.writes.slice(w0);
  check('one other bot already listed and a computer enrolled: today\'s bot still moves in, with its name and its conversation; the legacy key is never written', s.tiles.includes('Other') && s.tiles.includes('Legacy Name') && stub.prefs.get(KEY)?.name === 'Legacy Name' && stub.prefs.get(KEY)?.session_id === S1 && ids().join() === [OTHER, main].join() && moved2.filter((w) => w.key === 'barkbot.bot').length === 0, { tiles: s.tiles, record: stub.prefs.get(KEY), ids: ids(), moved2 });
  // Today's bot moving in late takes today's conversation only when it is surely no other bot's
  // (task-b910d6ee3d466fd1): a record that is dropped, or one beyond what a load reads, may name it.
  const S_NEW = '00000000-0000-4000-8000-0000000000e1', S_OLD = '00000000-0000-4000-8000-0000000000e0';
  const DROPPED = '6e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b';
  freshStore({ name: 'Legacy Name' }); stub.sessions = [{ ...session(S_OLD), inserted_at: '2026-11-15T08:00:00Z' }, { ...session(S_NEW), inserted_at: '2026-11-15T10:00:00Z' }];
  stub.prefs.set('barkbot.bots', { ids: [DROPPED] }); stub.prefs.set(`barkbot.bot.${DROPPED}`, { name: '', host_id: HOST_ID, session_id: S_NEW, created_at: '2026-11-15T10:00:00Z' });
  w0 = stub.writes.length; s = await showing('Legacy Name');
  check('a dropped record naming the newest conversation on the computer: today\'s bot moves in with no conversation, and opens none', stub.prefs.has(KEY) && stub.prefs.get(KEY)?.session_id === null && !stub.opened.includes(S_NEW) && stub.writes.slice(w0).filter((w) => w.key === 'barkbot.bot').length === 0, { record: stub.prefs.get(KEY), opened: stub.opened });
  const BEYOND = '7f2a3b4c-5d6e-4f7a-8b9c-0d1e2f3a4b5c', fifty = Array.from({ length: 50 }, () => crypto.randomUUID());
  freshStore({ name: 'Legacy Name' });
  stub.prefs.set('barkbot.bots', { ids: [...fifty, BEYOND] }); stub.prefs.set(`barkbot.bot.${BEYOND}`, rec('Beyond', HOST_ID, S_NEW));
  w0 = stub.writes.length; s = await showing('Legacy Name');
  check('a bot beyond the 50 a load reads, naming the newest conversation: today\'s bot is not saved with it, the list does not grow past 50, nothing is opened', !(stub.prefs.get(KEY)?.session_id === S_NEW) && ids().length === 51 && !stub.opened.includes(S_NEW) && stub.writes.slice(w0).length === 0, { record: stub.prefs.get(KEY) ?? null, ids: ids().length, opened: stub.opened, writes: stub.writes.slice(w0) });
  // A made bot's conversation asks for its folder (bot_folder); one whose record never saved it
  // names no bot. The Main Bot works in the shared root, so its move-in never takes a session with
  // a folder, newest or not. Barkpark's list does not carry bot_folder: only a session's own read does.
  const S_FOLD = '00000000-0000-4000-8000-0000000000f1', PIP = 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
  const foldered = { ...session(S_FOLD), inserted_at: '2026-11-15T10:00:00Z', bot_folder: `bot-${PIP.slice(0, 8)}` };
  freshStore({ name: 'Legacy Name' }); stub.sessions = [foldered];
  stub.prefs.set('barkbot.bots', { ids: [PIP] }); stub.prefs.set(`barkbot.bot.${PIP}`, rec('Pip', HOST_ID, null));
  s = await showing('Pip');
  check('a made bot\'s conversation with its folder, that no record saved, is the newest on the computer: today\'s bot moves in without it and never opens it', stub.prefs.has(KEY) && stub.prefs.get(KEY)?.session_id === null && !stub.opened.includes(S_FOLD) && ids().join() === [PIP, main].join(), { record: stub.prefs.get(KEY) ?? null, ids: ids(), opened: stub.opened });
  freshStore({ name: 'Legacy Name' }); stub.sessions = [{ ...session(S_OLD), inserted_at: '2026-11-15T08:00:00Z' }, foldered];
  stub.prefs.set('barkbot.bots', { ids: [PIP] }); stub.prefs.set(`barkbot.bot.${PIP}`, rec('Pip', HOST_ID, null));
  s = await showing('Pip');
  check('the same, with an older conversation with no folder: today\'s bot moves in with the older one, never the folder\'s', stub.prefs.get(KEY)?.session_id === S_OLD && !stub.opened.includes(S_FOLD), { record: stub.prefs.get(KEY) ?? null, opened: stub.opened });
  const S_PLAIN = '00000000-0000-4000-8000-0000000000f2';
  freshStore({ name: 'Legacy Name' }); stub.sessions = [{ ...foldered, id: S_PLAIN, bot_folder: null }];
  stub.prefs.set('barkbot.bots', { ids: [PIP] }); stub.prefs.set(`barkbot.bot.${PIP}`, rec('Pip', HOST_ID, null));
  s = await showing('Pip');
  check('control: the same newest conversation with no folder is today\'s bot\'s, as before', stub.prefs.get(KEY)?.session_id === S_PLAIN, { record: stub.prefs.get(KEY) ?? null });
  // A read that fails is not "no folder": the newest conversation's own read answers 500, then 503,
  // and today's bot moves in with no conversation, never that one (it may be a made bot's).
  for (const code of [500, 503]) {
    // A session never read before: a read that worked is kept (app/src/chat/api.ts folderKnown).
    const unread = { ...foldered, id: code === 500 ? '00000000-0000-4000-8000-0000000000f5' : '00000000-0000-4000-8000-0000000000f6' };
    freshStore({ name: 'Legacy Name' }); stub.sessions = [{ ...session(S_OLD), inserted_at: '2026-11-15T08:00:00Z' }, unread]; stub.failShow.set(unread.id, code);
    stub.prefs.set('barkbot.bots', { ids: [PIP] }); stub.prefs.set(`barkbot.bot.${PIP}`, rec('Pip', HOST_ID, null));
    stub.shown = []; s = await showing('Pip');
    check(`the newest conversation has a folder and its own read answers ${code}: today's bot moves in with no conversation, not that one and not an older one`, stub.prefs.has(KEY) && stub.prefs.get(KEY)?.session_id === null && stub.shown.includes(unread.id) && !stub.opened.includes(unread.id), { record: stub.prefs.get(KEY) ?? null, shown: stub.shown, opened: stub.opened });
  }
  stub.failShow.clear();
  stub.sessions = []; freshStore(); stub.fail.clear(); stub.sent = []; stub.to = []; stub.made = []; stub.refused = []; stub.bodies = [];

  // ── Picking a bot shows its own conversation (task-92087f34f4eeeb43) ──────────────────────
  // Two bots on one computer, each with its own session and its own rows. One fleet stream tells
  // the page every bot's state; a tile says Working and Unread activity for its own bot only.
  console.log('Behaviour · picking a bot (the live page, against the stand-in Barkpark)');
  const SA = '00000000-0000-4000-8000-0000000000a1', SB = '00000000-0000-4000-8000-0000000000b1';
  const ADA = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', BEA = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
  stub.sessions = [session(SA), session(SB)]; stub.rows = []; freshStore(); stub.fleet = 'idle'; stub.stateBy.clear();
  stub.prefs.set('barkbot.bots', { ids: [ADA, BEA] });
  stub.prefs.set(`barkbot.bot.${ADA}`, rec('Ada', HOST_ID, SA));
  stub.prefs.set(`barkbot.bot.${BEA}`, rec('Bea', HOST_ID, SB));
  stub.rowsBy.set(SA, [{ seq: 1, role: 'user', source_markdown: 'apples please' }, { seq: 2, role: 'assistant', source_markdown: 'Here are the apples.' }]);
  stub.rowsBy.set(SB, [{ seq: 1, role: 'user', source_markdown: 'bananas please' }, { seq: 2, role: 'assistant', source_markdown: 'Here are the bananas.' }]);
  await windowFocus(true);
  const fleets0 = stub.fleetOpens;
  const words = () => ev(() => document.querySelector('.transcript')?.textContent ?? '');
  // Every pinned tile: Ada, Bea, and today's bot, which moves in after them (#60).
  const labels = () => ev(() => [...document.querySelectorAll('.rail-list .rail-tile')].map((t) => t.getAttribute('aria-label')));
  const tileOf = (n) => ev((n) => { const t = [...document.querySelectorAll('.rail-list .rail-tile')].find((x) => x.getAttribute('aria-label').split(', ')[0] === n); const r = t?.getBoundingClientRect(); return r ? [r.x + r.width / 2, r.y + r.height / 2] : null; }, n);
  const pickTile = async (n, want) => { const at = await tileOf(n); if (at) await click(...at); await until(async () => (await live()).header === n && want.test(await words()), 10000, `${n}'s conversation`).catch(() => {}); await wait(500); return { header: (await live()).header, t: await words(), url: await ev(() => location.search) }; };
  await showing('Ada');
  await until(async () => /apples/.test(await words()), 10000, "Ada's rows").catch(() => {});
  precondition("the live page opens on Ada with Ada's rows, and Bea's tile is there", /apples please/.test(await words()) && (await labels()).includes('Bea'), { labels: await labels(), words: await words(), other: stub.other });
  let p = await pickTile('Bea', /bananas/);
  check("picking Bea shows Bea's conversation and none of Ada's (control: Ada's rows before)", p.header === 'Bea' && /bananas please/.test(p.t) && /Here are the bananas/.test(p.t) && !/apples/.test(p.t) && stub.opened.includes(SB), { p, opened: stub.opened });
  p = await pickTile('Ada', /apples/);
  check("picking Ada again shows Ada's conversation and none of Bea's", p.header === 'Ada' && /apples please/.test(p.t) && /Here are the apples/.test(p.t) && !/bananas/.test(p.t), p);
  check('two bots and two picks, one fleet stream', stub.fleetOpens - fleets0 === 1 && stub.fleets.length === 1, { opens: stub.fleetOpens - fleets0, open: stub.fleets.length });
  // Ada is open. Bea works, then replies while the window has no focus. A click gives the
  // headless page real focus, which focus emulation off does not take away; a fresh load does not
  // have it (the unread rules above), so Ada's page is loaded again first.
  await open(`${base}/?bot=${ADA}`); await until(async () => (await live()).header === 'Ada', 15000, "Ada's page").catch(() => {});
  await windowFocus(false);
  precondition("Ada's page is open and the window has no focus", (await live()).header === 'Ada' && !(await ev(() => document.hasFocus())), { header: (await live()).header });
  flip(SB, 'working'); await until(async () => (await labels()).includes('Bea, Working'), 5000, "Bea's Working").catch(() => {});
  const during = await labels();
  flip(SB, 'idle'); await until(async () => (await labels()).some((l) => l.startsWith('Bea, Unread')), 5000, "Bea's dot").catch(() => {});
  await wait(300);
  const after = await labels();
  check("Bea works while Ada is open: only Bea's tile says Working, then, with no focus, only Bea's says Unread activity", JSON.stringify(during) === JSON.stringify(['Ada', 'Bea, Working', 'BarkBot']) && JSON.stringify(after) === JSON.stringify(['Ada', 'Bea, Unread activity', 'BarkBot']) && (await live()).header === 'Ada', { during, after });
  await windowFocus(true);
  check('control: the window getting focus clears the dot', JSON.stringify(await labels()) === JSON.stringify(['Ada', 'Bea', 'BarkBot']), await labels());
  // A first message still opening its conversation, then a pick (task-f954370021fb60fb): the
  // message goes once, to the bot it was written to, and never to the bot picked.
  const CLEO = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f';
  stub.prefs.set(`barkbot.bot.${CLEO}`, rec('Cleo', HOST_ID, null)); stub.prefs.set('barkbot.bots', { ids: [...ids(), CLEO] });
  await open(`${base}/?bot=${CLEO}`); await until(async () => (await live()).header === 'Cleo', 15000, "Cleo's page").catch(() => {}); await wait(500);
  const cleoSent0 = stub.sent.length, cleoTo0 = stub.to.length, cleoMade0 = stub.made.length;
  stub.createDelay = 700; // Barkpark holds the new conversation's answer: the pick lands while it opens
  await ev(() => document.querySelector('.prompt').focus()); await page.send('Input.insertText', { text: 'hello cleo' }); await key('Enter');
  await wait(150);
  const beaAt = await tileOf('Bea'); if (beaAt) await click(...beaAt);
  await until(async () => (await live()).header === 'Bea' && /bananas/.test(await words()), 15000, "Bea's page after the pick").catch(() => {});
  await until(() => stub.sent.length > cleoSent0, 5000, "Cleo's message").catch(() => {}); await wait(800);
  stub.createDelay = 0;
  const cleoSession = stub.made.slice(cleoMade0)[0];
  const cleo = { header: (await live()).header, sent: stub.sent.slice(cleoSent0).map((m) => m.content), to: stub.to.slice(cleoTo0), made: stub.made.slice(cleoMade0), saved: stub.prefs.get(`barkbot.bot.${CLEO}`)?.session_id ?? null };
  check('a pick while a new bot\'s first message is still opening: the message is sent once, to that bot\'s new conversation, never to the bot picked, and the pick still lands', cleo.header === 'Bea' && cleo.made.length === 1 && JSON.stringify(cleo.sent) === JSON.stringify(['hello cleo']) && JSON.stringify(cleo.to) === JSON.stringify([cleoSession]) && cleo.saved === cleoSession && !cleo.to.includes(SB), cleo);
  // The same, when the new conversation's stream never opens: the pick still lands, after its hold.
  const DOT = 'd4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f70';
  stub.prefs.set(`barkbot.bot.${DOT}`, rec('Dot', HOST_ID, null)); stub.prefs.set('barkbot.bots', { ids: [...ids(), DOT] });
  await open(`${base}/?bot=${DOT}`); await until(async () => (await live()).header === 'Dot', 15000, "Dot's page").catch(() => {}); await wait(500);
  const dotSent0 = stub.sent.length;
  stub.deafNew = true;
  await ev(() => document.querySelector('.prompt').focus()); await page.send('Input.insertText', { text: 'hello dot' }); await key('Enter');
  await until(() => stub.deaf.size > 0, 5000, "Dot's conversation").catch(() => {}); await wait(300);
  const beaAgain = await tileOf('Bea'); const pickedAt = Date.now(); if (beaAgain) await click(...beaAgain);
  await until(async () => (await live()).header === 'Bea' && /bananas/.test(await words()), 20000, "Bea's page after the held pick").catch(() => {});
  const dot = { header: (await live()).header, ms: Date.now() - pickedAt, beasRows: /bananas/.test(await words()), sent: stub.sent.slice(dotSent0).map((m) => m.content) };
  check("a pick while a new bot's first message waits on a stream that never opens: the pick still lands, after its hold, and nothing is sent", dot.header === 'Bea' && dot.beasRows && dot.ms >= 5000 && dot.ms < 20000 && dot.sent.length === 0, dot);
  const onBot = () => ev(() => new URLSearchParams(location.search).get('bot'));
  const promptText = () => ev(() => document.querySelector('.prompt')?.innerText.trim() ?? '');
  const refusedLine = () => ev(() => document.querySelector('.composer-refused')?.textContent ?? null);
  const clearPrompt = () => ev(() => { const p = document.querySelector('.prompt'); p.replaceChildren(); p.dispatchEvent(new InputEvent('input', { bubbles: true })); });
  const typeSend = async (t) => { await ev(() => document.querySelector('.prompt').focus()); await page.send('Input.insertText', { text: t }); await key('Enter'); };
  // With many bots the rail scrolls to the open one: the tile is scrolled into view first.
  const clickTile = async (n) => { await ev((n) => [...document.querySelectorAll('.rail-list .rail-tile')].find((x) => x.getAttribute('aria-label').split(', ')[0] === n)?.scrollIntoView({ block: 'nearest' }), n); await wait(100); const at = await tileOf(n); if (at) await click(...at); };
  // … and back on Dot: the words given up on wait in its box, with a line that they were not sent.
  await clickTile('Dot');
  await until(async () => (await onBot()) === DOT && (await promptText()) !== '', 15000, "Dot's page with its words").catch(() => {}); await wait(1000);
  const dotBack = { bot: await onBot(), prompt: await promptText(), line: await refusedLine(), sent: stub.sent.slice(dotSent0).map((m) => m.content) };
  stub.deafNew = false; stub.deaf.clear();
  check("… back on that bot, its unsent words wait in the box with one plain line that they were not sent, and they are not sent on their own", dotBack.bot === DOT && dotBack.prompt === 'hello dot' && /not sent/.test(dotBack.line ?? '') && dotBack.sent.length === 0, dotBack);
  await clearPrompt();
  const newBot = async (n, id) => { stub.prefs.set(`barkbot.bot.${id}`, rec(n, HOST_ID, null)); stub.prefs.set('barkbot.bots', { ids: [...ids(), id] }); await open(`${base}/?bot=${id}`); await until(async () => (await live()).header === n, 15000, `${n}'s page`).catch(() => {}); await wait(500); };
  // Pick Bea while Eve's first message is held, then Eve again: the pick is taken back, the last pick wins.
  const EVE = 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7081';
  await newBot('Eve', EVE);
  const eveSent0 = stub.sent.length, eveMade0 = stub.made.length;
  stub.createDelay = 700;
  await typeSend('hello eve'); await wait(150); await clickTile('Bea'); await wait(150); await clickTile('Eve');
  await until(() => stub.sent.length > eveSent0, 8000, "Eve's message").catch(() => {}); await wait(1500);
  stub.createDelay = 0;
  const eve = { bot: await onBot(), header: (await live()).header, sent: stub.sent.slice(eveSent0).map((m) => m.content), to: stub.to.slice(eveSent0), made: stub.made.slice(eveMade0), shown: /hello eve/.test(await words()) };
  check("a held pick taken back by picking the first bot again: the page stays on it, its message goes once, to it, and shows", eve.bot === EVE && eve.header === 'Eve' && JSON.stringify(eve.sent) === JSON.stringify(['hello eve']) && JSON.stringify(eve.to) === JSON.stringify(eve.made) && eve.made.length === 1 && eve.shown, eve);
  // A held pick when the conversation cannot be made: the pick is taken back; the page says why, with the words.
  const FAY = 'f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f708192';
  await newBot('Fay', FAY);
  const fayMade0 = stub.made.length;
  stub.createDelay = 700; stub.failCreate = true;
  await typeSend('hello fay'); await wait(150); await clickTile('Bea');
  await until(async () => (await refusedLine()) !== null, 8000, "Fay's line").catch(() => {}); await wait(1500);
  stub.createDelay = 0; stub.failCreate = false;
  const fay = { bot: await onBot(), header: (await live()).header, prompt: await promptText(), line: await refusedLine(), made: stub.made.slice(fayMade0) };
  check("a held pick when the first message's conversation cannot be made: the pick is taken back, the page stays, says why, and keeps the words", fay.bot === FAY && fay.header === 'Fay' && fay.prompt === 'hello fay' && /could not make it/.test(fay.line ?? '') && fay.made.length === 0, fay);
  await clearPrompt();
  // A held pick when the first message itself fails: the same.
  const GUS = 'a7b8c9d0-e1f2-4a3b-8c4d-5e6f708192a3';
  await newBot('Gus', GUS);
  const gusSent0 = stub.sent.length, gusRef0 = stub.failedSends.length;
  stub.createDelay = 700; stub.failSend = true;
  await typeSend('hello gus'); await wait(150); await clickTile('Bea');
  await until(() => stub.failedSends.length > gusRef0, 8000, "Gus's message to fail").catch(() => {}); await wait(1500);
  stub.createDelay = 0; stub.failSend = false;
  const gus = { bot: await onBot(), header: (await live()).header, prompt: await promptText(), line: await refusedLine(), sent: stub.sent.slice(gusSent0).length, failed: stub.failedSends.slice(gusRef0).length };
  check("a held pick when the first message fails to send: the pick is taken back, the page stays, says why, and keeps the words", gus.bot === GUS && gus.header === 'Gus' && gus.prompt === 'hello gus' && !!gus.line && gus.sent === 0 && gus.failed === 1, gus);
  await clearPrompt();
  // A held pick when the made bot's computer refuses its folder (Barkpark's 422 chat_unsupported): the same, with the folder line.
  const HAL = 'b8c9d0e1-f2a3-4b4c-8d5e-6f708192a3b4';
  await newBot('Hal', HAL);
  const halSent0 = stub.sent.length, halRef0 = stub.refused.length;
  stub.createDelay = 700; stub.noFolders = true;
  await typeSend('hello hal'); await wait(150); await clickTile('Bea');
  await until(async () => (await refusedLine()) !== null, 8000, "Hal's line").catch(() => {}); await wait(1500);
  stub.createDelay = 0; stub.noFolders = false;
  const hal = { bot: await onBot(), header: (await live()).header, prompt: await promptText(), line: await refusedLine(), sent: stub.sent.slice(halSent0).length, refused: stub.refused.slice(halRef0).length };
  check("a held pick when the made bot's computer cannot run it in its own folder: the pick is taken back, the page stays, shows the folder line, and keeps the words", hal.bot === HAL && hal.header === 'Hal' && hal.prompt === 'hello hal' && /newer chat host/.test(hal.line ?? '') && hal.sent === 0 && hal.refused === 1, hal);
  await clearPrompt();
  // A held pick whose first message is on its way and gets no answer: the 6 s cap holds; back on the bot,
  // its words wait in the box with a line that they may have been sent.
  const IAN = 'c9d0e1f2-a3b4-4c5d-8e6f-708192a3b4c5';
  await newBot('Ian', IAN);
  const ianHeld0 = stub.heldSends.length;
  stub.holdSend = true;
  await typeSend('hello ian');
  await until(() => stub.heldSends.length > ianHeld0, 8000, "Ian's message on its way").catch(() => {}); await wait(200);
  const ianAt = Date.now(); await clickTile('Bea');
  await until(async () => (await onBot()) === BEA && /bananas/.test(await words()), 20000, "Bea's page after the hung send").catch(() => {});
  const ianMs = Date.now() - ianAt;
  await clickTile('Ian');
  await until(async () => (await onBot()) === IAN && (await promptText()) !== '', 15000, "Ian's page with its words").catch(() => {}); await wait(500);
  const ian = { ms: ianMs, bot: await onBot(), prompt: await promptText(), line: await refusedLine() };
  stub.holdSend = false; stub.heldSends.splice(0).forEach((answer) => answer());
  check("a held pick whose first message is on its way with no answer: the pick still lands after its hold; back on the bot, the words wait with a line that they may have been sent", ian.ms >= 5000 && ian.ms < 20000 && ian.bot === IAN && ian.prompt === 'hello ian' && /may have been sent/.test(ian.line ?? ''), ian);
  await clearPrompt();
  // A first message that fails with no pick held: the line says so until the next send, which clears it.
  const JO = 'd0e1f2a3-b4c5-4d6e-8f70-8192a3b4c5d6';
  await newBot('Jo', JO);
  const joF0 = stub.failedSends.length, joSent0 = stub.sent.length;
  stub.failSend = true;
  await typeSend('hello jo');
  await until(() => stub.failedSends.length > joF0, 8000, "Jo's message to fail").catch(() => {}); await wait(800);
  const joLine1 = await ev(() => document.querySelector('.chat-error')?.textContent ?? null);
  stub.failSend = false;
  await clearPrompt(); await typeSend('again jo');
  await until(() => stub.sent.length > joSent0, 8000, "Jo's second message").catch(() => {}); await wait(800);
  const jo = { line1: joLine1, line2: await ev(() => document.querySelector('.chat-error')?.textContent ?? null), sent: stub.sent.slice(joSent0).map((m) => m.content) };
  check('a failed first message (no pick held) says why, and the next send that goes clears the line', /could not take it/.test(jo.line1 ?? '') && !/could not take it/.test(jo.line2 ?? '') && JSON.stringify(jo.sent) === JSON.stringify(['again jo']), jo);
  // A held pick given up on whose stream opens late, while the page is still leaving: the message must not go then.
  const KIM = 'e1f2a3b4-c5d6-4e7f-8081-92a3b4c5d6e7';
  await newBot('Kim', KIM);
  const kimSent0 = stub.sent.length;
  stub.slowNew = true;
  await typeSend('hello kim');
  await until(() => stub.slow.size > 0, 8000, "Kim's conversation").catch(() => {}); await wait(300);
  // The give-up comes 6 s after the pick; the stream opens at 7.5 s; reads held 4 s keep Kim's page up past it.
  const kimAt = Date.now(); await clickTile('Bea'); stub.readDelay = 4000;
  const kimTrace = [];
  while (Date.now() - kimAt < 7500) { kimTrace.push([Date.now() - kimAt, (await onBot()) === KIM ? 'kim' : 'other', (await words()).trim() === '' ? 'blank' : 'rows', stub.sent.length - kimSent0, stub.readKeys.length]); await wait(500); }
  // Still leaving: Kim's page is up with its rows hidden, Bea's rows not yet shown (the URL moves at once).
  const kimEarly = { leaving: (await words()).trim() === '', sent: stub.sent.slice(kimSent0).length, held: kimTrace.some(([, , t]) => t === 'blank') };
  stub.slow.clear(); stub.slowNew = false; // Kim's stream opens now, while Kim's page is still up
  await wait(1000); stub.readDelay = 0;
  await until(async () => (await onBot()) === BEA && /bananas/.test(await words()), 20000, "Bea's page after the give-up").catch(() => {}); await wait(1000);
  const kimLeft = stub.sent.slice(kimSent0).map((m) => m.content);
  await clickTile('Kim');
  await until(async () => (await onBot()) === KIM && (await promptText()) !== '', 15000, "Kim's page with its words").catch(() => {}); await wait(1000);
  const kim = { trace: kimTrace, early: kimEarly, left: kimLeft, bot: await onBot(), prompt: await promptText(), line: await refusedLine(), sent: stub.sent.slice(kimSent0).map((m) => m.content) };
  check("a given-up message whose stream opens late, while the page is leaving: it is never sent then or after; back on the bot, the words wait with the not-sent line", kim.early.leaving && kim.early.sent === 0 && kim.early.held && kim.left.length === 0 && kim.sent.length === 0 && kim.bot === KIM && kim.prompt === 'hello kim' && /not sent/.test(kim.line ?? ''), kim);
  await clearPrompt();
  stub.sessions = []; stub.rowsBy.clear(); stub.stateBy.clear(); stub.fleet = null; freshStore(); stub.sent = []; stub.to = []; stub.made = []; stub.refused = [];

  console.log('Behaviour · picking the open bot again (the live page, against the stand-in Barkpark)');
  // task-4a719948e5ff5b80: pick Bea with nothing held, then Ada (the open bot) again while Bea's page
  // is still loading (its reads held): the last click wins, and the rail and the page agree.
  stub.sessions = [session(SA), session(SB)]; stub.rows = []; freshStore(); stub.fleet = 'idle'; stub.stateBy.clear();
  stub.prefs.set('barkbot.bots', { ids: [ADA, BEA] });
  stub.prefs.set(`barkbot.bot.${ADA}`, rec('Ada', HOST_ID, SA));
  stub.prefs.set(`barkbot.bot.${BEA}`, rec('Bea', HOST_ID, SB));
  stub.rowsBy.set(SA, [{ seq: 1, role: 'user', source_markdown: 'apples please' }, { seq: 2, role: 'assistant', source_markdown: 'Here are the apples.' }]);
  stub.rowsBy.set(SB, [{ seq: 1, role: 'user', source_markdown: 'bananas please' }, { seq: 2, role: 'assistant', source_markdown: 'Here are the bananas.' }]);
  await open(`${base}/?bot=${ADA}`);
  await until(async () => (await live()).header === 'Ada' && /apples/.test(await words()), 15000, "Ada's page").catch(() => {}); await wait(500);
  const railOn = () => ev(() => document.querySelector('.rail-list .rail-tile[aria-current="page"]')?.getAttribute('aria-label').split(', ')[0] ?? null);
  precondition("the page opens on Ada with Ada's rows, and the rail shows Ada open", /apples please/.test(await words()) && (await railOn()) === 'Ada', { words: await words(), rail: await railOn() });
  const backKeys0 = stub.readKeys.length;
  stub.readDelay = 3000;
  await clickTile('Bea');
  await until(() => stub.readKeys.length > backKeys0, 5000, "Bea's page to start loading").catch(() => {}); await wait(300);
  const backMid = { rail: await railOn(), url: await onBot() };
  await clickTile('Ada');
  await wait(1000); stub.readDelay = 0;
  await wait(6000);
  const back = { mid: backMid, url: await onBot(), header: (await live()).header, rail: await railOn(), t: await words() };
  check("picking the open bot again while another bot's page is still loading: the last click wins, the page shows the open bot's rows, and the rail agrees", back.mid.rail === 'Bea' && back.url === ADA && back.header === 'Ada' && back.rail === 'Ada' && /apples please/.test(back.t) && !/bananas/.test(back.t), back);
  // The same when the pick was held for a new bot's first message and goes once that message went.
  const LYN = 'f2a3b4c5-d6e7-4f80-8192-a3b4c5d6e7f8';
  await newBot('Lyn', LYN);
  const lynSent0 = stub.sent.length, lynTo0 = stub.to.length, lynMade0 = stub.made.length;
  stub.createDelay = 700;
  await typeSend('hello lyn'); await wait(150); await clickTile('Bea'); stub.readDelay = 3000;
  await until(() => stub.sent.length > lynSent0, 15000, "Lyn's message").catch(() => {}); await wait(300);
  const lynMid = { rail: await railOn(), sent: stub.sent.length - lynSent0 };
  await clickTile('Lyn');
  await wait(1000); stub.readDelay = 0; stub.createDelay = 0;
  await wait(6000);
  const lyn = { mid: lynMid, url: await onBot(), header: (await live()).header, rail: await railOn(), shown: /hello lyn/.test(await words()), bea: /bananas/.test(await words()), sent: stub.sent.slice(lynSent0).map((m) => m.content), to: stub.to.slice(lynTo0), made: stub.made.slice(lynMade0) };
  check("a held pick that goes once the first message went, then the open bot picked again while that page loads: the page and the rail end on the open bot, and the message went once, to it", lyn.mid.rail === 'Bea' && lyn.mid.sent === 1 && lyn.url === LYN && lyn.header === 'Lyn' && lyn.rail === 'Lyn' && lyn.shown && !lyn.bea && JSON.stringify(lyn.sent) === JSON.stringify(['hello lyn']) && JSON.stringify(lyn.to) === JSON.stringify(lyn.made) && lyn.made.length === 1, lyn);
  stub.sessions = []; stub.rowsBy.clear(); stub.stateBy.clear(); stub.fleet = null; freshStore(); stub.sent = []; stub.to = []; stub.made = []; stub.refused = [];

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

  // ── A send that fails keeps its words; the Main Bot is the Main Bot whatever the host id's case
  // (task-2f356974eb9722b6) ──────────────────────────────────────────────────────────────────────
  console.log('Behaviour · a failed send keeps its words; the host id\'s case (the live page, against the stand-in Barkpark)');
  {
    const errLine = () => ev(() => document.querySelector('.chat-error')?.textContent ?? null);
    const SF = '00000000-0000-4000-8000-0000000000d7';
    stub.fleet = null; stub.rows = []; freshStore(); stub.sessions = [session(SF)]; stub.failShow.clear();
    stub.opened = []; await open(`${base}/`);
    await until(() => stub.opened.includes(SF), 15000, "the Main Bot's conversation to open").catch(() => {}); await wait(800);
    // A conversation that is open: Barkpark refuses the send before it goes (503 runtime_unavailable).
    let f0 = stub.failedSends.length, s0 = stub.sent.length;
    stub.failSend = true; await typeSend('keep these words');
    await until(() => stub.failedSends.length > f0, 8000, 'the send to fail').catch(() => {}); await wait(800);
    const kept1 = { prompt: await promptText(), line: await errLine(), refused: await refusedLine(), sent: stub.sent.slice(s0).length };
    stub.failSend = false;
    check('a send that Barkpark refuses, in an open conversation: the words stay in the box and one plain line says why, never that it may have been sent; nothing is sent', kept1.prompt === 'keep these words' && /could not take it/.test(kept1.line ?? '') && kept1.refused === null && kept1.sent === 0 && !/may have been sent/.test(`${kept1.line} ${kept1.refused}`), kept1);
    await clearPrompt(); s0 = stub.sent.length; await typeSend('now it goes');
    await until(() => stub.sent.length > s0, 8000, 'the next send').catch(() => {}); await wait(500);
    const went = { prompt: await promptText(), sent: stub.sent.slice(s0).map((m) => m.content) };
    check('control: the next send goes, and the box is empty after it', went.prompt === '' && JSON.stringify(went.sent) === JSON.stringify(['now it goes']), went);
    // A made bot's first message: refused 422 chat_unsupported, and the read that asks whether it
    // has a folder fails too (review F5), so the send throws.
    const FEN = 'f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f708193';
    await newBot('Fen', FEN);
    const r0 = stub.refused.length; s0 = stub.sent.length;
    stub.noFolders = true; stub.failShow.set('*', 503); await typeSend('hello fen');
    await until(() => stub.refused.length > r0, 8000, "Fen's message to be refused").catch(() => {}); await wait(1000);
    const kept2 = { prompt: await promptText(), line: await errLine(), refused: await refusedLine(), sent: stub.sent.slice(s0).length, shown: stub.refused.slice(r0).length };
    stub.noFolders = false; stub.failShow.clear();
    check("a made bot's first message refused as chat_unsupported, whose folder read fails too: the words stay in the box and one plain line says what Barkpark said, never that it may have been sent; nothing is sent", kept2.prompt === 'hello fen' && /not supported/.test(kept2.line ?? '') && kept2.refused === null && kept2.sent === 0 && kept2.shown === 1 && !/may have been sent/.test(`${kept2.line} ${kept2.refused}`), kept2);
    await clearPrompt();
    // Barkpark takes a message and its answer is lost (the socket drops): it may have gone. The words
    // stay, and the one line says so, so one Enter does not send it twice without a word.
    const lost = async (words, how = () => (stub.dropAnswer = true)) => {
      const at = stub.sent.length; await how(); await typeSend(words);
      await until(() => stub.sent.length > at, 8000, 'the message to reach the stand-in').catch(() => {}); await wait(1500);
      stub.dropAnswer = false; stub.afterTake = null; await ev(() => (window.__lose = null));
      return { prompt: await promptText(), refused: await refusedLine(), line: await errLine(), sent: stub.sent.slice(at).map((m) => m.content) };
    };
    stub.opened = []; await open(`${base}/`);
    await until(() => stub.opened.includes(SF), 15000, "the Main Bot's conversation to open again").catch(() => {}); await wait(800);
    const lost1 = await lost('did this go');
    check('in an open conversation, a message Barkpark took whose answer was lost: the words stay and one line says it may have been sent, to look before sending again', lost1.prompt === 'did this go' && /may have been sent/.test(lost1.refused ?? '') && /look in the conversation/.test(lost1.refused ?? '') && lost1.line === null && JSON.stringify(lost1.sent) === JSON.stringify(['did this go']), lost1);
    await clearPrompt();
    // The same "may have gone" for every answer that can come after the turn went: Barkpark's 500
    // (it stores the user's turn after it sends it on), a gateway's empty 502, and the page's own
    // call lost on its way back after the stand-in took the message.
    const mayHaveGone = (x, words) => x.prompt === words && /may have been sent/.test(x.refused ?? '') && x.line === null && JSON.stringify(x.sent) === JSON.stringify([words]);
    const crash = await lost('crash after take', () => (stub.afterTake = { status: 500, body: { error: { code: 'internal_error', message: 'Internal server error (DBConnection.ConnectionError)' } } }));
    check('a 500 from Barkpark after it took the message: the words stay and one line says it may have been sent', mayHaveGone(crash, 'crash after take'), crash);
    await clearPrompt();
    const gate = await lost('gateway gave up', () => (stub.afterTake = { status: 502, body: null }));
    check("a gateway's empty 502 after the message was taken: the words stay and one line says it may have been sent", mayHaveGone(gate, 'gateway gave up'), gate);
    await clearPrompt();
    // The page's own call to its server is lost after the stand-in took the message (fetch rejects).
    await ev(() => { if (window.__loseOn) return; window.__loseOn = true; const real = window.fetch; window.fetch = async (u, init) => { const r = await real(u, init); if (window.__lose && typeof init?.body === 'string' && init.body.includes(window.__lose)) { window.__lose = null; throw new TypeError('Failed to fetch'); } return r; }; });
    const own = await lost('lost on the way back', () => ev(() => (window.__lose = 'lost on the way back')));
    check("the page's own call is lost after the message was taken: the words stay and one line says it may have been sent", mayHaveGone(own, 'lost on the way back'), own);
    await clearPrompt();
    const GIL = 'a7b8c9d0-e1f2-4a3b-8c4d-5e6f70819203';
    await newBot('Gil', GIL);
    const lost2 = await lost('hello gil');
    check("a new bot's first message Barkpark took whose answer was lost: the words stay and one line says it may have been sent, to look before sending again", lost2.prompt === 'hello gil' && /may have been sent/.test(lost2.refused ?? '') && /look in the conversation/.test(lost2.refused ?? '') && lost2.line === null && JSON.stringify(lost2.sent) === JSON.stringify(['hello gil']), lost2);
    await clearPrompt();
    // The Main Bot's id comes from its computer's id, whatever its case: a host id in upper case
    // still names the Main Bot, so its conversation asks for no folder, and no second Main Bot appears.
    const LETTERS = 'abcdef00-0000-4000-8000-0000000000ab';
    stub.hosts = [{ ...host(true)[0], id: LETTERS }]; stub.sessions = []; freshStore({ name: 'Legacy Name' });
    s = await showing('Legacy Name');
    const mainL = ids()[0], m0 = stub.made.length;
    const upper = await ev(async ([hostId, botId]) => { const m = await import('/src/chat/api.ts'); try { await m.startChat({ data: { hostId, botId } }); return 'made'; } catch (e) { return String(e?.message ?? e); } }, [LETTERS.toUpperCase(), mainL]);
    const upBody = stub.made.length > m0 ? stub.bodies.findLast((x) => x.id === stub.made.at(-1))?.body : null;
    check("a host id that differs only in case still names the Main Bot: its conversation asks for no folder", upper === 'made' && !!upBody && !('bot_folder' in upBody), { upper, upBody, mainL });
    s = await showing('Legacy Name');
    check('control: the Main Bot made from the lower-case host id is still the one Main Bot after a reload (no second one)', ids().join() === mainL && s.tiles.filter((t) => !t.startsWith('Open account')).length === 1 && botKeys().length === 1, { ids: ids(), tiles: s.tiles, keys: botKeys() });
    stub.hosts = host(true); freshStore();
  }

  // ── A Barkpark read is bounded; the move-in does not ask again what it knows (task-b7cd665a7b162544) ──
  console.log('Behaviour · bounded reads (the live page, against the stand-in Barkpark)');
  {
    const at = (iso, x) => ({ ...x, inserted_at: iso });
    // A read held open costs the page one bound (8 s, app/src/server/barkpark.ts READ_MS), then it is
    // a failed read: the move-in takes no conversation, not that one and not an older one.
    // Each load has its own sessions: a read that worked is kept (app/src/chat/api.ts folderKnown).
    const HOLD = '00000000-0000-4000-8000-0000000001b1', OLDER = '00000000-0000-4000-8000-0000000001b0';
    const CTL_NEW = '00000000-0000-4000-8000-0000000001b3', CTL_OLD = '00000000-0000-4000-8000-0000000001b2';
    const twoOnHost = (newer, older) => [at('2026-11-15T08:00:00Z', session(older)), at('2026-11-15T10:00:00Z', session(newer))];
    freshStore({ name: 'Legacy Name' }); stub.sessions = twoOnHost(CTL_NEW, CTL_OLD);
    let t0 = Date.now(); s = await showing('Legacy Name'); const baseMs = Date.now() - t0;
    const ctl = { header: s.header, session: stub.prefs.get(KEY)?.session_id ?? null, ms: baseMs };
    check('control: with every read answered, the move-in takes the newest conversation', ctl.header === 'Legacy Name' && ctl.session === CTL_NEW, ctl);
    freshStore({ name: 'Legacy Name' }); stub.sessions = twoOnHost(HOLD, OLDER); stub.holdShow.add(HOLD);
    // At most 20 s here: a page with no bound waits out Node's own 300 s, so this rule fails in 20 s.
    t0 = Date.now(); const shown = await Promise.race([showing('Legacy Name'), wait(20000).then(() => null)]); const heldMs = Date.now() - t0;
    const held = { header: shown?.header ?? null, record: stub.prefs.get(KEY) ?? null, ms: heldMs, baseMs };
    stub.holdShow.clear(); stub.heldShows.splice(0).forEach((r) => r.destroy()); await wait(1000);
    check('a session read Barkpark never answers holds the page about 8 s, not forever; then the move-in takes no conversation, not that one and not an older one', held.header === 'Legacy Name' && held.ms >= 7500 && held.ms - baseMs < 12000 && !!held.record && held.record.session_id === null, held);
    // With no bot list and the saved name unreadable, each load shows the Main Bot from memory and
    // picks its conversation again. What a read showed (a folder or none) is known: not asked again.
    const F = (n) => `00000000-0000-4000-8000-0000000001c${n}`;
    const folderOf = (n) => ({ ...at(`2026-11-15T1${n}:00:00Z`, session(F(n))), bot_folder: `bot-0000000${n}` });
    stub.sessions = [at('2026-11-15T08:00:00Z', session(F(1))), folderOf(2), folderOf(3), folderOf(4)];
    freshStore(); stub.fail.set('GET barkbot.bot', 500);
    const reads = () => stub.shown.filter((id) => /-0000000001c\d$/.test(id)).length;
    stub.shown = []; s = await showing('BarkBot'); const first = { reads: reads(), opened: [...stub.opened] };
    stub.shown = []; s = await showing('BarkBot'); const second = { reads: reads(), opened: [...stub.opened] };
    check('the second load with no bot list and the saved name unreadable asks Barkpark nothing it already knows, and opens the same conversation (control: the first load read all four)', first.reads === 4 && second.reads === 0 && first.opened.includes(F(1)) && second.opened.includes(F(1)), { first, second });
    // A read that failed is never remembered: the next load asks again, and never takes that one.
    stub.sessions = [at('2026-11-15T08:00:00Z', session(F(5))), folderOf(6)]; stub.failShow.set(F(6), 500);
    stub.shown = []; s = await showing('BarkBot'); const failedLoad = { opened: [...stub.opened] };
    stub.failShow.clear();
    stub.shown = []; s = await showing('BarkBot'); const nextLoad = { opened: [...stub.opened], asked: stub.shown.includes(F(6)) };
    check('control: a read that failed is not remembered: that load opens nothing, the next asks again and takes the conversation with no folder, never the one with a folder', !failedLoad.opened.includes(F(5)) && !failedLoad.opened.includes(F(6)) && nextLoad.asked && nextLoad.opened.includes(F(5)) && !nextLoad.opened.includes(F(6)), { failedLoad, nextLoad });
    stub.fail.clear(); freshStore();
    // A 503 storage_unavailable after Barkpark took the message (its turn went before it was stored):
    // the words stay, and one line says it may have been sent (the 500 case is #69's rule).
    const SX = '00000000-0000-4000-8000-0000000001d1';
    stub.sessions = [session(SX)]; stub.opened = []; await open(`${base}/`);
    await until(() => stub.opened.includes(SX), 15000, "the Main Bot's conversation to open").catch(() => {}); await wait(800);
    const s0 = stub.sent.length;
    stub.afterTake = { status: 503, body: { error: { code: 'storage_unavailable', message: 'storage is unavailable' } } };
    await typeSend('stored or not');
    await until(() => stub.sent.length > s0, 8000, 'the message to reach the stand-in').catch(() => {}); await wait(1500);
    stub.afterTake = null;
    const st = { prompt: await promptText(), refused: await refusedLine(), line: await ev(() => document.querySelector('.chat-error')?.textContent ?? null), sent: stub.sent.slice(s0).map((m) => m.content) };
    check('a 503 storage_unavailable after Barkpark took the message: the words stay and one line says it may have been sent', st.prompt === 'stored or not' && /may have been sent/.test(st.refused ?? '') && st.line === null && JSON.stringify(st.sent) === JSON.stringify(['stored or not']), st);
    await clearPrompt(); stub.sessions = []; freshStore();
  }

  // ── The online dot is the open bot's own computer (task-658f2a8b5536d7ec) ──
  console.log("Behaviour · the open bot's own computer (the live page, against the stand-in Barkpark)");
  {
    // Two of the owner's computers. The open bot lives on the one NOT named BARKBOT_HOST_NAME.
    const NAMED = '00000000-0000-4000-8000-000000000001', OTHER = '00000000-0000-4000-8000-0000000000a2', GONE = '00000000-0000-4000-8000-0000000000a3';
    const OLA = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
    const two = (named, other) => [
      { id: NAMED, name: 'BarkBot Mac', online: named, enrolled: true, revoked: false },
      { id: OTHER, name: 'Other Mac', online: other, enrolled: true, revoked: false },
      { id: GONE, name: 'Old Mac', online: true, enrolled: true, revoked: true },
    ];
    const machine = () => ev(() => ({ state: document.querySelector('.computer-state')?.textContent ?? null, alert: document.querySelector('.chat-error')?.textContent ?? null }));
    stub.sessions = []; freshStore(); stub.prefs.set('barkbot.bots', { ids: [OLA] }); stub.prefs.set(`barkbot.bot.${OLA}`, rec('Ola', OTHER, null));
    stub.hosts = two(true, true);
    await open(`${base}/?bot=${OLA}`); await until(async () => (await live()).header === 'Ola' && (await machine()).state === 'Asleep', 20000, "Ola's page").catch(() => {});
    const on = { header: (await live()).header, ...(await machine()) };
    precondition("Ola's page is open, its computer reachable, no alert", on.header === 'Ola' && on.state === 'Asleep' && on.alert === null, on);
    stub.hosts = two(true, false);
    await until(async () => (await machine()).state === 'Unreachable', 10000, 'the page to notice').catch(() => {});
    const otherOff = await machine();
    check("Ola's own computer stops (the named one is on): within 10 s the card says Unreachable and the conversation says why", otherOff.state === 'Unreachable' && /unreachable/.test(otherOff.alert ?? ''), otherOff);
    stub.hosts = two(true, true);
    await until(async () => (await machine()).state === 'Asleep', 10000, 'the page to notice').catch(() => {});
    const back = await machine();
    stub.hosts = two(false, true); await wait(11000);
    const namedOff = { ...(await machine()), before: back };
    check("control: the computer named BARKBOT_HOST_NAME stops, Ola's does not: from Asleep with no alert, after 11 s still Asleep and no alert", back.state === 'Asleep' && back.alert === null && namedOff.state === 'Asleep' && namedOff.alert === null, namedOff);
    // The answer is only ever about one of the caller's own enrolled, unrevoked computers.
    stub.hosts = two(true, true);
    const asked = await ev(async ([ids]) => { const m = await import('/src/chat/api.ts'); const out = []; for (const hostId of ids) { try { out.push(await m.computerOnline({ data: { hostId } })); } catch (e) { out.push('threw: ' + e.message); } } return out; }, [[OTHER, GONE, '00000000-0000-4000-8000-0000000000ff']]);
    check('asked about a revoked computer that is on, or one not the caller\'s, the answer is "not reachable" (control: the open bot\'s own computer is reachable)', JSON.stringify(asked) === JSON.stringify([true, false, false]), { asked });
    // A pick across computers: while the picked bot loads, the panel already shows its name, so it must
    // not show the state of the computer it is leaving. The page records every name and state pair it
    // shows, from before the click until the picked bot's own state is up.
    stub.hosts = two(false, true);
    await open(`${base}/?bot=${OLA}`); await until(async () => (await live()).header === 'Ola' && (await machine()).state === 'Asleep', 20000, "Ola's page").catch(() => {});
    const watch = () => ev(() => {
      const seen = window.__pairs = [];
      const note = () => { const n = document.querySelector('.who-name'); const p = { name: n ? n.value : null, state: document.querySelector('.computer-state')?.textContent ?? null }; const last = seen.at(-1); if (!last || last.name !== p.name || last.state !== p.state) seen.push(p); };
      note(); window.__pairsStop?.(); const o = new MutationObserver(note); o.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true }); window.__pairsStop = () => o.disconnect();
    });
    const across = async (bot, own) => {
      await watch(); stub.readDelay = 3000; await clickTile(bot);
      await until(async () => (await live()).header === bot && (await machine()).state === own, 15000, `${bot}'s own state`).catch(() => {});
      stub.readDelay = 0;
      return ev(() => { window.__pairsStop(); return window.__pairs; });
    };
    const toMain = await across('BarkBot', 'Unreachable');
    await wait(1000);
    const toOla = await across('Ola', 'Asleep');
    const mixed = [...toMain.filter((p) => p.name === 'BarkBot' && p.state === 'Asleep'), ...toOla.filter((p) => p.name === 'Ola' && p.state === 'Unreachable')];
    check("a slow pick across computers never shows one bot's name with the other computer's state, and each shows its own after the load (Ola's on, the Main Bot's off)", mixed.length === 0 && toMain.at(-1)?.name === 'BarkBot' && toMain.at(-1)?.state === 'Unreachable' && toOla.at(-1)?.name === 'Ola' && toOla.at(-1)?.state === 'Asleep', { mixed, toMain, toOla });
    stub.hosts = host(true); freshStore();
  }

  // ── A new chat that is not saved to its bot says so (task-2f10df6041bfdf8e) ──
  console.log('Behaviour · a new chat not saved to its bot (the live page, against the stand-in Barkpark)');
  {
    const PIA = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', OTHER_TAB = '00000000-0000-4000-8000-0000000002a1';
    const KEYP = `barkbot.bot.${PIA}`, NOT_KEPT = /not saved to the bot/;
    const line = () => ev(() => document.querySelector('.chat-error')?.textContent ?? null);
    // Pia's page opens with no conversation; then `meanwhile` changes her record; then her first message.
    const firstMessage = async (words, meanwhile) => {
      stub.sessions = [session(OTHER_TAB)]; freshStore(); stub.prefs.set('barkbot.bots', { ids: [PIA] }); stub.prefs.set(KEYP, rec('Pia', HOST_ID, null));
      await open(`${base}/?bot=${PIA}`); await until(async () => (await live()).header === 'Pia', 15000, "Pia's page").catch(() => {}); await wait(500);
      const before = await line();
      meanwhile(); const m0 = stub.made.length;
      await typeSend(words);
      await until(() => stub.made.length > m0, 8000, 'the new conversation').catch(() => {}); await wait(1500);
      return { before, line: await line(), made: stub.made.slice(m0), record: stub.prefs.get(KEYP) ?? null };
    };
    const ok = await firstMessage('hello pia', () => {});
    check("control: Pia's first message makes a conversation that is saved to her record, and no line", ok.before === null && ok.made.length === 1 && ok.record?.session_id === ok.made[0] && ok.line === null, ok);
    const taken = await firstMessage('hello again', () => stub.prefs.set(KEYP, rec('Pia', HOST_ID, OTHER_TAB)));
    check("another tab saved a conversation to Pia meanwhile: hers stays, and the page says in one line that this one was not saved to the bot", taken.before === null && taken.made.length === 1 && taken.record?.session_id === OTHER_TAB && NOT_KEPT.test(taken.line ?? ''), taken);
    const gone = await firstMessage('hello there', () => stub.prefs.delete(KEYP));
    check("Pia's record is gone meanwhile: nothing is written for her, and the page says in one line that this conversation was not saved to the bot", gone.before === null && gone.made.length === 1 && gone.record === null && NOT_KEPT.test(gone.line ?? ''), gone);
    // Every other way the new chat is not saved (from the review of #73): the line shows, the first
    // message goes once to the new conversation and the box empties, the next send goes there too with
    // no second create, and the record is not written.
    const H2 = '00000000-0000-4000-8000-0000000000b2', S_UNS = '00000000-0000-4000-8000-0000000002b9';
    const cases = [
      ['unsure', () => { stub.prefs.set(KEYP, rec('Pia', HOST_ID, S_UNS)); stub.failShow.set(S_UNS, 503); }, (r) => r?.session_id === S_UNS],
      ['read fails', () => { stub.fail.set(`GET ${KEYP}`, 500); }, (r) => r?.session_id === null],
      ['write fails', () => { stub.fail.set(`PATCH ${KEYP}`, 500); }, (r) => r?.session_id === null],
      ['other computer', () => { stub.hosts = [...host(true), { id: H2, name: 'Other Mac', online: true, enrolled: true, revoked: false }]; stub.prefs.set(KEYP, rec('Pia', H2, null)); }, (r) => r?.host_id === H2 && r?.session_id === null],
      ['not own (bad record)', () => { stub.prefs.set(KEYP, { name: '', host_id: HOST_ID }); }, (r) => r?.name === ''],
      ['timed-out read', () => { stub.readDelay = 9000; }, (r) => r?.session_id === null],
    ];
    for (const [what, meanwhile, recOk] of cases) {
      const t0 = stub.to.length;
      const r = await firstMessage(`first ${what}`, meanwhile);
      stub.readDelay = 0; stub.fail.clear(); stub.failShow.clear();
      await until(() => stub.to.length > t0, 12000, 'the first message').catch(() => {}); await wait(800);
      const lineNow = await line();
      const firstTo = stub.to.slice(t0); const sentFirst = stub.sent.slice(-1)[0]?.content ?? null; const box1 = await promptText();
      const m1 = stub.made.length, t1 = stub.to.length; await typeSend(`next ${what}`);
      await until(() => stub.to.length > t1, 8000, 'the next send').catch(() => {}); await wait(800);
      const nextTo = stub.to.slice(t1), newMade = stub.made.length - m1;
      const d = { ...r, lineNow, firstTo, sentFirst, box1, nextTo, newMade, recNow: stub.prefs.get(KEYP) ?? null };
      check(`not saved (${what}): one line says so; the first message goes once to the new conversation; the next send goes there too, no second create; the record is not written`, NOT_KEPT.test(lineNow ?? '') && r.made.length === 1 && JSON.stringify(firstTo) === JSON.stringify([r.made[0]]) && sentFirst === `first ${what}` && box1 === '' && JSON.stringify(nextTo) === JSON.stringify([r.made[0]]) && newMade === 0 && recOk(stub.prefs.get(KEYP)), d);
      await clearPrompt(); stub.hosts = host(true);
    }
    await clearPrompt(); stub.sessions = []; freshStore();
  }

  // ── A rename and a new conversation at the same moment both stay (task-815065d27591f624) ──
  console.log('Behaviour · a rename and a new chat at once (the live page, against the stand-in Barkpark)');
  {
    const RIA = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f', KEYR = `barkbot.bot.${RIA}`;
    const atOnce = async (first, held) => {
      stub.hosts = host(true); stub.sessions = []; freshStore(); stub.prefs.set('barkbot.bots', { ids: [RIA] }); stub.prefs.set(KEYR, rec('Ria', HOST_ID, null));
      await open(`${base}/?bot=${RIA}`); await until(async () => (await live()).header === 'Ria', 15000, "Ria's page").catch(() => {}); await wait(500);
      const m0 = stub.made.length, w0 = stub.writes.length;
      stub.holdPut = { key: KEYR, field: held, max: 4000 };
      await ev(() => { window.__call = (which, botId, hostId) => import('/src/chat/api.ts').then((m) => (which === 'start' ? m.startChat({ data: { hostId, botId } }) : m.renameBot({ data: { id: botId, name: 'Ria Two' } }))).then((v) => ({ v }), (e) => ({ e: String(e?.message ?? e) })); });
      // The first call reads the record and its write is held; then the second runs to its end.
      await ev(([w, id, h]) => { window.__first = window.__call(w, id, h); }, [first, RIA, HOST_ID]);
      await until(() => !!stub.holdPut.pending, 8000, 'the first write to be held').catch(() => {});
      const heldSeen = !!stub.holdPut.pending;
      const second = await ev(([w, id, h]) => window.__call(w, id, h), [first === 'start' ? 'rename' : 'start', RIA, HOST_ID]);
      const firstOut = await ev(() => window.__first);
      const ops = stub.writes.slice(w0).filter((x) => x.key === KEYR).map((x) => (x.method === 'PATCH' ? `${x.body?.op} ${x.body?.field}` : x.method)).sort();
      const out = { heldSeen, ops, first: firstOut, second, made: stub.made.slice(m0), record: stub.prefs.get(KEYR) ?? null };
      stub.holdPut = null; return out;
    };
    const a = await atOnce('start', 'session_id');
    const twoSets = (x) => JSON.stringify(x.ops) === JSON.stringify(['set name', 'set session_id']);
    check("a new chat's record write is held until a rename of the same bot has been written: two set ops, one per field, and the record ends with the new name and the new conversation", a.heldSeen && twoSets(a) && a.made.length === 1 && a.record?.name === 'Ria Two' && a.record?.session_id === a.made[0], a);
    const b = await atOnce('rename', 'name');
    check("a rename's record write is held until a new chat of the same bot has been written: two set ops, one per field, and the record ends with the new name and the new conversation", b.heldSeen && twoSets(b) && b.made.length === 1 && b.record?.name === 'Ria Two' && b.record?.session_id === b.made[0], b);
    // A new chat's write for Ria that Barkpark never answers holds her queue for at most 10 s
    // (app/src/server/bots.ts WRITE_MS): a new chat for another bot is never held by it, and a rename
    // of Ria (a set of its own field, not queued) is not held by it either. A queued change that waits
    // past its own 15 s (WAIT_MS) is given up, with nothing written later.
    const ZED = '3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6a', KEYZ = `barkbot.bot.${ZED}`;
    const hungStart = async () => {
      stub.hosts = host(true); stub.sessions = []; freshStore(); stub.prefs.set('barkbot.bots', { ids: [RIA, ZED] });
      stub.prefs.set(KEYR, rec('Ria', HOST_ID, null)); stub.prefs.set(KEYZ, rec('Zed', HOST_ID, null));
      await open(`${base}/?bot=${RIA}`); await until(async () => (await live()).header === 'Ria', 15000, "Ria's page").catch(() => {}); await wait(500);
      await ev(() => { window.__call = (which, botId, hostId, name) => { const t0 = performance.now(); return import('/src/chat/api.ts').then((m) => (which === 'start' ? m.startChat({ data: { hostId, botId } }) : m.renameBot({ data: { id: botId, name } }))).then((v) => ({ v, ms: Math.round(performance.now() - t0) }), (e) => ({ e: String(e?.message ?? e), ms: Math.round(performance.now() - t0) })); }; });
      stub.hangPut = KEYR; const w0 = stub.writes.length;
      await ev(([id, h]) => { window.__hung = window.__call('start', id, h); }, [RIA, HOST_ID]);
      await until(() => stub.hung.length > 0, 8000, "Ria's write to hang").catch(() => {});
      return w0;
    };
    const release = () => { stub.hangPut = null; stub.hung.splice(0).forEach((r) => r.destroy()); };
    let w0 = await hungStart();
    const zed = await Promise.race([ev(([id, h]) => window.__call('start', id, h), [ZED, HOST_ID]), wait(30000).then(() => 'still waiting after 30 s')]);
    const zedRec = stub.prefs.get(KEYZ) ?? null;
    stub.hangPut = null; // Ria's next write is answered
    const ria = await Promise.race([ev(([id, h]) => window.__call('rename', id, h, 'Ria Two'), [RIA, HOST_ID]), wait(30000).then(() => 'still waiting after 30 s')]);
    // The hung change answers at its own bound (10 s from its write), not held by the rename.
    const first = await Promise.race([ev(() => window.__hung), wait(15000).then(() => 'still waiting')]);
    const one = { hung: stub.hung.length, first, zed, zedRec, ria, record: stub.prefs.get(KEYR) ?? null };
    release();
    check("a new chat's write for Ria that Barkpark never answers: a new chat for Zed is not held by it, a rename of Ria is not held by it and is saved, and the hung change itself says it was not saved", one.hung === 1
      && typeof zed === 'object' && zed.v?.kept === true && zed.ms < 5000 && zedRec?.session_id === zed.v.sessionId
      && typeof ria === 'object' && ria.v?.name === 'Ria Two' && ria.ms < 5000 && one.record?.name === 'Ria Two'
      && typeof first === 'object' && first.v?.kept === false, one);
    // Two of Ria's new-chat writes hang in a row: a third new chat gives up at its own bound
    // (not kept) and never writes.
    w0 = await hungStart();
    await ev(([id, h]) => { window.__second = window.__call('start', id, h); }, [RIA, HOST_ID]);
    const third = await Promise.race([ev(([id, h]) => window.__call('start', id, h), [RIA, HOST_ID]), wait(30000).then(() => 'still waiting after 30 s')]);
    await wait(12000); // past the second change's bound: the third, given up, still writes nothing
    const two = { third, writes: stub.writes.slice(w0).filter((x) => x.key === KEYR).length, record: stub.prefs.get(KEYR) ?? null };
    release();
    check("a new chat for Ria that waits behind two hung writes gives up at its own bound, not kept, and is never written after (control: the two hung writes reached Barkpark)", typeof third === 'object' && third.v?.kept === false && third.ms >= 14000 && third.ms < 18000
      && two.writes === 2 && two.record?.name === 'Ria' && two.record?.session_id === null, two);
    // A rename that Barkpark takes and does not answer is called off at 10 s; Barkpark applies it at
    // 12 s. A new chat saved meanwhile keeps its conversation: the late write changes the name only.
    w0 = await hungStart(); release();
    stub.lateWrite = { key: KEYR, field: 'name', ms: 12000 };
    await ev(([id, h]) => { window.__late = window.__call('rename', id, h, 'Ria Late'); }, [RIA, HOST_ID]);
    await until(() => stub.lateWrite.taken, 8000, 'the rename to be taken').catch(() => {});
    const started = await Promise.race([ev(([id, h]) => window.__call('start', id, h), [RIA, HOST_ID]), wait(20000).then(() => 'still waiting after 20 s')]);
    const calledOff = await Promise.race([ev(() => window.__late), wait(15000).then(() => 'still waiting')]);
    await until(() => !!stub.lateWrite.landed, 15000, 'the late rename to land').catch(() => {}); await wait(300);
    const late = { taken: stub.lateWrite.taken, landed: !!stub.lateWrite.landed, started, calledOff, record: stub.prefs.get(KEYR) ?? null };
    stub.lateWrite = null; release();
    check("a rename called off at its bound that Barkpark applies late changes only the name: a new conversation saved after it stays", late.taken && late.landed && typeof calledOff === 'object' && !!calledOff.e
      && typeof started === 'object' && started.v?.kept === true && late.record?.name === 'Ria Late' && late.record?.session_id === started.v.sessionId, late);
    // The record is removed after a rename read it: the rename is not kept, and no record of the name
    // alone is left behind (control: the name in it before was the whole record's).
    await hungStart(); release();
    stub.goneBeforeWrite = KEYR;
    const gone = await ev(([id, h]) => window.__call('rename', id, h, 'Ria Gone'), [RIA, HOST_ID]);
    const after = { gone, record: stub.prefs.has(KEYR) ? stub.prefs.get(KEYR) : 'no key' };
    stub.goneBeforeWrite = null;
    check("a rename whose record is removed after the rename read it: the page is told the name is not kept, and no half record is left", typeof gone === 'object' && /not kept/.test(gone.e ?? '') && after.record === 'no key', after);
    stub.sessions = []; freshStore();
  }

  // ── A first conversation not saved while a pick is held keeps its line (task-97a57c9b49a06691) ──
  console.log('Behaviour · a held pick and a first conversation not saved (the live page, against the stand-in Barkpark)');
  {
    const KAI = '4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b', LOU = '5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c';
    const KEYK = `barkbot.bot.${KAI}`;
    const errLine = () => ev(() => document.querySelector('.chat-error')?.textContent ?? null);
    // Kai's first message; while its conversation opens (Barkpark holds the answer 700 ms), Lou is picked.
    const heldPick = async (words, saveFails) => {
      stub.hosts = host(true); stub.sessions = []; freshStore(); stub.prefs.set('barkbot.bots', { ids: [KAI, LOU] });
      stub.prefs.set(KEYK, rec('Kai', HOST_ID, null)); stub.prefs.set(`barkbot.bot.${LOU}`, rec('Lou', HOST_ID, null));
      await open(`${base}/?bot=${KAI}`); await until(async () => (await live()).header === 'Kai', 15000, "Kai's page").catch(() => {}); await wait(500);
      if (saveFails) stub.fail.set(`PATCH ${KEYK}`, 500);
      const s0 = stub.sent.length, t0 = stub.to.length, m0 = stub.made.length;
      stub.createDelay = 700;
      await typeSend(words); await wait(150); await clickTile('Lou');
      await until(() => stub.sent.length > s0, 8000, "Kai's message").catch(() => {}); await wait(2500);
      stub.createDelay = 0; stub.fail.clear();
      return { header: (await live()).header, bot: await onBot(), line: await errLine(), sent: stub.sent.slice(s0).map((m) => m.content), to: stub.to.slice(t0), made: stub.made.slice(m0), box: await promptText() };
    };
    const NOT_KEPT = /not saved to the bot/;
    const ok = await heldPick('hello kai', false);
    check("control: Kai's first conversation is saved while Lou's pick is held: the message goes once to it, then the pick goes to Lou", ok.header === 'Lou' && ok.bot === LOU && ok.made.length === 1 && JSON.stringify(ok.sent) === JSON.stringify(['hello kai']) && JSON.stringify(ok.to) === JSON.stringify(ok.made), ok);
    const lost = await heldPick('hello again kai', true);
    check("Kai's first conversation cannot be saved while Lou's pick is held: the pick is taken back, Kai's page shows the not-saved line, and the message went once to the new conversation", lost.header === 'Kai' && lost.bot === KAI && NOT_KEPT.test(lost.line ?? '') && lost.made.length === 1 && JSON.stringify(lost.sent) === JSON.stringify(['hello again kai']) && JSON.stringify(lost.to) === JSON.stringify(lost.made) && lost.box === '', lost);
    stub.sessions = []; freshStore();
  }

  // ── Create while a first message is opening (task-37b324b9e0b5b768) ──
  console.log('Behaviour · Create while a first message is opening (the live page, against the stand-in Barkpark)');
  {
    const CLEO = '8c9d0e1f-2a3b-4c4d-8e5f-6a7b8c9d0e1f', DEX = '9d0e1f2a-3b4c-4d5e-9f6a-7b8c9d0e1f2a';
    // A bot with no conversation yet; its first message is typed, then Create makes another bot.
    const firstThenCreate = async (id, n, words, made) => {
      stub.hosts = host(true); stub.sessions = []; freshStore(); stub.prefs.set('barkbot.bots', { ids: [id] }); stub.prefs.set(`barkbot.bot.${id}`, rec(n, HOST_ID, null));
      await open(`${base}/?bot=${id}`); await until(async () => (await live()).header === n, 15000, `${n}'s page`).catch(() => {}); await wait(500);
      const s0 = stub.sent.length, h0 = stub.heldSends.length;
      await typeSend(words);
      await until(() => stub.slow.size > 0 || stub.heldSends.length > h0, 8000, `${n}'s message to park`).catch(() => {}); await wait(300);
      await openDialog(); await typeName(made); await press('Create');
      await until(async () => (await live()).header === made, 15000, `${made}'s page`).catch(() => {}); await wait(500);
      // Whatever was holding the first message lets go now, while the page is on the new bot.
      stub.slow.clear(); stub.slowNew = false; stub.holdSend = false; stub.heldSends.splice(0).forEach((answer) => answer());
      await wait(3000);
      const away = { header: (await live()).header, sent: stub.sent.slice(s0).map((m) => m.content) };
      await clickTile(n);
      await until(async () => (await onBot()) === id && (await promptText()) !== '', 15000, `${n}'s page with its words`).catch(() => {}); await wait(1000);
      const back = { away, bot: await onBot(), prompt: await promptText(), line: await refusedLine(), sent: stub.sent.slice(s0).map((m) => m.content) };
      await clearPrompt();
      return back;
    };
    // Its conversation is made but its stream never opens before Create: the message was never sent.
    stub.slowNew = true;
    const opening = await firstThenCreate(CLEO, 'Cleo', 'hello cleo', 'Newt');
    check("Create while a first message's conversation is still opening: the new bot opens, the message is never sent, and back on its bot the words wait with the not-sent line", opening.away.header === 'Newt' && opening.sent.length === 0 && opening.bot === CLEO && opening.prompt === 'hello cleo' && /was not sent/.test(opening.line ?? ''), opening);
    // Its stream is open and the message is on its way with no answer yet: it may have gone.
    stub.holdSend = true;
    const onItsWay = await firstThenCreate(DEX, 'Dex', 'hello dex', 'Nell');
    check("Create while a first message is on its way with no answer: the new bot opens, and back on its bot the words wait with the line that it may have been sent", onItsWay.away.header === 'Nell' && onItsWay.bot === DEX && onItsWay.prompt === 'hello dex' && /may have been sent/.test(onItsWay.line ?? ''), onItsWay);
    stub.sessions = []; freshStore(); stub.sent = []; stub.to = []; stub.made = []; stub.refused = [];
  }

  // ── A name typed while a pick loads is written to no bot ──
  console.log('Behaviour · renaming while a pick loads (the live page, against the stand-in Barkpark)');
  {
    const RIA = '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d', SAM = '7b8c9d0e-1f2a-4b3c-9d4e-5f6a7b8c9d0e';
    const nameOf = (id) => stub.prefs.get(`barkbot.bot.${id}`)?.name;
    // Every write of the typed name, to any bot's record: "<id> <name>".
    const zeds = (w0) => stub.writes.slice(w0).filter((w) => nameIn(w) === 'Zed').map((w) => `${w.key.slice('barkbot.bot.'.length)} Zed`);
    const field = () => ev(() => document.querySelector('.who-name')?.value ?? null);
    const typeZed = async () => {
      const at = await ev(() => { const r = document.querySelector('.who-name').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
      await click(...at); await ev(() => document.querySelector('.who-name').select()); await key('Backspace'); await page.send('Input.insertText', { text: 'Zed' }); await wait(100); await key('Enter');
    };
    const openOn = async (id, want) => {
      stub.hosts = host(true); stub.sessions = []; freshStore(); stub.prefs.set('barkbot.bots', { ids: [RIA, SAM] });
      stub.prefs.set(`barkbot.bot.${RIA}`, rec('Ria', HOST_ID, null)); stub.prefs.set(`barkbot.bot.${SAM}`, rec('Sam', HOST_ID, null));
      await open(`${base}/?bot=${id}`); await windowFocus(true); await until(async () => (await live()).header === want, 15000, `${want}'s page`).catch(() => {}); await wait(500);
    };
    // Ria open, Sam picked with every read held 3 s: the panel already shows Sam's name.
    await openOn(RIA, 'Ria');
    let w0 = stub.writes.length;
    stub.readDelay = 3000; await clickTile('Sam'); await wait(400);
    const mid = { header: (await live()).header, field: await field() };
    await typeZed(); await wait(300);
    const typed = await field();
    await wait(5000); stub.readDelay = 0; await wait(1500);
    const during = { mid, typed, zeds: zeds(w0), ria: nameOf(RIA), sam: nameOf(SAM), header: (await live()).header, field: await field() };
    check("a name typed into the panel while a pick loads is written to no bot: both records keep their names, and after the load the picked bot shows its own (control: the field showed the picked bot's name)", mid.field === 'Sam' && during.zeds.length === 0 && during.ria === 'Ria' && during.sam === 'Sam' && during.header === 'Sam' && during.field === 'Sam', during);
    // The same window, the change made by a script rather than typed (as an extension or a tool would:
    // focus, React's value setter and an input event, blur). The field being read-only does not stop
    // that, so the save path itself must write to no bot (review of #77, P2b).
    await openOn(RIA, 'Ria');
    w0 = stub.writes.length;
    const progs = () => stub.writes.slice(w0).filter((w) => nameIn(w) === 'Prog').map((w) => w.key.slice('barkbot.bot.'.length));
    stub.readDelay = 4000; await clickTile('Sam'); await wait(300);
    const progMid = { header: (await live()).header, field: await field(), readOnly: await ev(() => document.querySelector('.who-name')?.readOnly ?? null) };
    await ev(() => { const f = document.querySelector('.who-name'); f.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(f, 'Prog'); f.dispatchEvent(new Event('input', { bubbles: true })); f.blur(); });
    await wait(5000); stub.readDelay = 0; await wait(1500);
    const prog = { mid: progMid, progs: progs(), ria: nameOf(RIA), sam: nameOf(SAM), header: (await live()).header };
    check("a change made by a script on the panel's name field while a pick loads is written to no bot either: both records keep their names (control: the field showed the picked bot, read-only)", progMid.field === 'Sam' && progMid.readOnly === true && prog.progs.length === 0 && prog.ria === 'Ria' && prog.sam === 'Sam' && prog.header === 'Sam', prog);
    // Control: with nothing loading, the same typing renames the open bot, once.
    await openOn(SAM, 'Sam');
    w0 = stub.writes.length;
    await typeZed(); await until(() => zeds(w0).length > 0, 5000, 'the rename').catch(() => {}); await wait(300);
    const plain = { zeds: zeds(w0), ria: nameOf(RIA), sam: nameOf(SAM), header: (await live()).header };
    check('control: with nothing loading, a name typed into the panel is written once, to the open bot', JSON.stringify(plain.zeds) === JSON.stringify([`${SAM} Zed`]) && plain.ria === 'Ria' && plain.sam === 'Zed' && plain.header === 'Zed', plain);
  }

  // ── Create's two writes end in step whatever answer is lost (task-4338079c878d4cc7) ──
  console.log("Behaviour · Create's list add with a lost answer (the live page, against the stand-in Barkpark)");
  {
    const create = (name) => ev(async (n) => { const m = await import('/src/chat/api.ts'); return m.createBot({ data: { name: n } }).then((v) => ({ v }), (e) => ({ e: String(e?.message ?? e) })); }, name);
    const listed = () => stub.prefs.get('barkbot.bots')?.ids ?? [];
    const dangling = () => listed().filter((id) => !stub.prefs.has(`barkbot.bot.${id}`));
    const fresh = async () => { stub.hosts = host(true); stub.sessions = []; freshStore(); await open(`${base}/`); await until(async () => (await live()).header === 'BarkBot', 15000, 'the page').catch(() => {}); await wait(500); };
    // Control: Barkpark refuses the add (500): the record is removed, the list is as it was, Create says no.
    await fresh(); let ids0 = [...listed()];
    stub.fail.set('PATCH barkbot.bots', 500); const refused = await create('Ula'); stub.fail.clear();
    const no = { refused, listed: listed(), dangling: dangling(), botKeys: [...stub.prefs.keys()].filter((k) => k.startsWith('barkbot.bot.')).length, before: ids0 };
    check('control: Barkpark refuses Create\'s list add: Create says it was not made, the list is as it was, and no id is left without a record', !!refused.e && JSON.stringify(no.listed) === JSON.stringify(ids0) && no.dangling.length === 0, no);
    // Barkpark applies the add, then the answer is lost: the bot is made (its id is in the list), with its record.
    await fresh(); ids0 = [...listed()];
    stub.dropPatch = 'barkbot.bots'; const lost = await create('Vic'); stub.dropPatch = null;
    const made = { lost, listed: listed(), dangling: dangling(), before: ids0 };
    const id = lost.v?.id;
    check("Create's list add is applied and its answer lost: no id is left without a record, and the bot is made with its record (Create answers its id)", made.dangling.length === 0 && !!id && made.listed.includes(id) && stub.prefs.get(`barkbot.bot.${id}`)?.name === 'Vic', made);
    // Through the dialog: Create's line, its Create button, and the store after it.
    const UNSURE = 'Barkpark did not say whether the bot was made. Reload to see if it is there before you make it again.';
    const viaDialog = async (name) => {
      await openDialog(); await typeName(name); await press('Create');
      await until(async () => (await failLine()) !== null || !(await dialog()), 15000, `Create ${name} to answer`).catch(() => {});
      const out = { line: await failLine(), open: await dialog(), createOff: await ev(() => [...document.querySelectorAll('.dialog.new-bot button')].find((x) => x.textContent.trim() === 'Create')?.disabled ?? null) };
      if (out.open) await press('Cancel');
      return out;
    };
    // The add's answer is lost and the list cannot be read after it: nothing proves the id is not
    // listed, so the record is kept; the dialog says so in a true line, never "not made", and its
    // Create is off, so no second bot is made blind.
    await fresh(); ids0 = [...listed()];
    stub.dropPatch = 'barkbot.bots'; stub.failAfterPatch = ['GET barkbot.bots', 500];
    const blind = await viaDialog('Wyn'); stub.dropPatch = null; stub.failAfterPatch = null; stub.fail.clear();
    const kept = { blind, listed: listed(), dangling: dangling(), before: ids0 };
    check("Create's list add answer is lost and the list cannot be read after it: no record is deleted (no id is left without a record), and the dialog says Barkpark did not say whether the bot was made, never \"not made\", with Create off", kept.dangling.length === 0 && blind.line === UNSURE && blind.createOff === true, kept);
    // The add's answer is lost before Barkpark has applied it, and it lands after Create's re-read:
    // the re-read shows no id, but a lost answer is no answer, so the record is kept and the dialog says so.
    await fresh(); ids0 = [...listed()];
    stub.latePatch = { key: 'barkbot.bots', ms: 1500 };
    const late = await viaDialog('Xan'); await wait(2000); stub.latePatch = null;
    const landed = { late, listed: listed(), dangling: dangling(), before: ids0 };
    check("Create's list add answer is lost and the add lands after Create's re-read: no id is left without a record, and the dialog says Barkpark did not say whether the bot was made, with Create off", landed.dangling.length === 0 && landed.listed.length === ids0.length + 1 && late.line === UNSURE && late.createOff === true, landed);
  }

  // ── A slow but working Barkpark: a rename is saved (task-80e76dcfeebc7a1a) ──
  console.log('Behaviour · a rename on a slow Barkpark (the live page, against the stand-in Barkpark)');
  {
    // A rename reads the record, the computers and the conversation, then writes. Each read is bounded
    // on its own (8 s); only the write has the queue's 10 s bound (app/src/server/bots.ts WRITE_MS).
    const PAX = '8c9d0e1f-2a3b-4c4d-9e5f-6a7b8c9d0e1f', KEYX = `barkbot.bot.${PAX}`, SPAX = '00000000-0000-4000-8000-0000000002c1';
    const renameAt = async (ms, to) => {
      stub.hosts = host(true); stub.sessions = [session(SPAX)]; freshStore(); stub.prefs.set('barkbot.bots', { ids: [PAX] }); stub.prefs.set(KEYX, rec('Pax', HOST_ID, SPAX));
      await open(`${base}/?bot=${PAX}`); await until(async () => (await live()).header === 'Pax', 15000, "Pax's page").catch(() => {}); await wait(500);
      stub.slowReads = ms;
      const out = await Promise.race([ev(async ([id, name]) => { const t0 = performance.now(); const m = await import('/src/chat/api.ts'); return m.renameBot({ data: { id, name } }).then((v) => ({ v, ms: Math.round(performance.now() - t0) }), (e) => ({ e: String(e?.message ?? e), ms: Math.round(performance.now() - t0) })); }, [PAX, to]), wait(40000).then(() => 'still waiting after 40 s')]);
      stub.slowReads = 0;
      return { out, record: stub.prefs.get(KEYX) ?? null };
    };
    const quick = await renameAt(2000, 'Pax Two');
    check('control: every Barkpark read answers in 2 s: a rename of a bot with a conversation is saved', quick.out?.v?.name === 'Pax Two' && quick.record?.name === 'Pax Two' && quick.record?.session_id === SPAX, quick);
    const slow = await renameAt(3500, 'Pax Three');
    check('every Barkpark read answers in 3.5 s: a rename of a bot with a conversation is still saved, with no "did not answer" line', slow.out?.v?.name === 'Pax Three' && slow.record?.name === 'Pax Three' && slow.record?.session_id === SPAX, slow);
    stub.sessions = []; freshStore();
  }

  // ── The 50-bot cap counts bots that show (task-c95974b430641fe6) ──
  console.log('Behaviour · the 50-bot cap and ids that show no bot (the live page, against the stand-in Barkpark)');
  {
    const create = (name) => ev(async (n) => { const m = await import('/src/chat/api.ts'); return m.createBot({ data: { name: n } }).then((v) => ({ v }), (e) => ({ e: String(e?.message ?? e) })); }, name);
    const listed = () => stub.prefs.get('barkbot.bots')?.ids ?? [];
    const dangling = () => listed().filter((id) => !stub.prefs.has(`barkbot.bot.${id}`));
    const GONE_HOST = '00000000-0000-4000-8000-0000000000ff';
    stub.hosts = host(true); stub.sessions = []; freshStore(); await open(`${base}/`); await until(async () => (await live()).header === 'BarkBot', 15000, 'the page').catch(() => {}); await wait(500);
    // 45 bots that show, then 5 listed ids of `kind`: 'none' (no record), 'gone' (a record on a computer no longer enrolled), 'shown' (5 more that show).
    const fill = (kind) => {
      freshStore(); const all = [], extra = [];
      for (let i = 0; i < 45; i++) { const id = crypto.randomUUID(); all.push(id); stub.prefs.set(`barkbot.bot.${id}`, rec(`Shown ${i}`, HOST_ID, null)); }
      for (let i = 0; i < 5; i++) { const id = crypto.randomUUID(); all.push(id); extra.push(id); if (kind === 'gone') stub.prefs.set(`barkbot.bot.${id}`, rec(`Old ${i}`, GONE_HOST, null)); if (kind === 'shown') stub.prefs.set(`barkbot.bot.${id}`, rec(`More ${i}`, HOST_ID, null)); }
      stub.prefs.set('barkbot.bots', { ids: all }); return { all, extra };
    };
    // 45 that show and 5 ids with no record: the 5 are proven gone (their read answered "unset"), so they leave the list and the bot is made.
    let f = fill('none'); let w0 = stub.writes.length; let out = await create('Ada');
    const none = { out, listed: listed().length, dangling: dangling().length, kept45: f.all.slice(0, 45).every((id) => listed().includes(id)), removed: stub.writes.slice(w0).filter((w) => w.method === 'PATCH' && w.body.op === 'remove').map((w) => w.body.item) };
    check('45 bots that show and 5 listed ids with no record: Create makes the bot, the 5 ids leave the list (their reads answered "unset"), and the 45 stay', !!none.out.v?.id && listed().includes(none.out.v.id) && none.dangling === 0 && none.kept45 && none.listed === 46, none);
    // 45 that show and 5 records on a computer no longer enrolled: not proven gone, so nothing is removed; Create says plainly why it is not made, never "you have 50 bots".
    f = fill('gone'); w0 = stub.writes.length; out = await create('Bea');
    const gone = { out, writes: stub.writes.slice(w0).map((w) => `${w.method} ${w.key}`), same: JSON.stringify(listed()) === JSON.stringify(f.all) };
    check('45 bots that show and 5 listed bots on a computer no longer enrolled: nothing is written or removed, and Create says 45 show, never "you have 50 bots"', !!gone.out.e && !/you have 50 bots/.test(gone.out.e) && /\b45\b/.test(gone.out.e) && gone.writes.length === 0 && gone.same, gone);
    // 45 that show and 5 ids with no record whose reads fail: a failed read proves nothing, so nothing is removed, and Create says the bots could not all be read.
    f = fill('none'); for (const id of f.extra) stub.fail.set(`GET barkbot.bot.${id}`, 500);
    w0 = stub.writes.length; out = await create('Cy'); stub.fail.clear();
    const blind = { out, writes: stub.writes.slice(w0).map((w) => `${w.method} ${w.key}`), same: JSON.stringify(listed()) === JSON.stringify(f.all) };
    check('45 bots that show and 5 listed ids whose reads fail: nothing is removed or written, and Create says they could not be read, never "you have 50 bots"', !!blind.out.e && !/you have 50 bots/.test(blind.out.e) && /could not be read/.test(blind.out.e) && blind.writes.length === 0 && blind.same, blind);
    // Present records whose reads time out (8 s): a read that did not answer proves nothing, so no
    // id is removed and Create says they could not be read. (Mutant: a timeout counted as gone.)
    f = fill('shown'); for (const id of f.extra) stub.readAs.set(`barkbot.bot.${id}`, 'hang');
    w0 = stub.writes.length; out = await create('Dee'); stub.readAs.clear(); stub.hung.splice(0).forEach((r) => r.destroy());
    const hung = { out, writes: stub.writes.slice(w0).map((w) => `${w.method} ${w.key}`), same: JSON.stringify(listed()) === JSON.stringify(f.all) };
    check('45 bots that show and 5 present records whose reads time out: nothing is removed or written, and Create says they could not be read', !!hung.out.e && /could not be read/.test(hung.out.e) && hung.writes.length === 0 && hung.same, hung);
    // An answer counts as "unset" only for the key and dataset it was asked for: value:null under
    // another key or another dataset says nothing about this record, and a 200 {} is no answer.
    f = fill('shown'); f.extra.forEach((id, n) => stub.readAs.set(`barkbot.bot.${id}`, ['otherKey', 'otherKey', 'otherDataset', 'otherDataset', 'empty'][n]));
    w0 = stub.writes.length; out = await create('Eli'); stub.readAs.clear();
    const odd = { out, writes: stub.writes.slice(w0).map((w) => `${w.method} ${w.key}`), same: JSON.stringify(listed()) === JSON.stringify(f.all) };
    check('45 bots that show and 5 present records whose reads answer value:null for another key or dataset, or {}: nothing is removed or written, and Create says they could not be read', !!odd.out.e && /could not be read/.test(odd.out.e) && odd.writes.length === 0 && odd.same, odd);
    // 50 bots that all show: Create refuses with "you have 50 bots", reading each record once.
    f = fill('shown'); let r0 = stub.readKeys.length; out = await create('Fay');
    const reads = stub.readKeys.slice(r0).filter((k) => k.startsWith('barkbot.bot.'));
    check('50 bots that all show: Create says "you have 50 bots", and reads each record once (50 record reads, not 100)', /you have 50 bots/.test(out.e ?? '') && reads.length === 50 && new Set(reads).size === 50, { out, reads: reads.length });
    // 51 listed (two Creates at once at 49) and the first 50 all show: the line is "you have 50 bots", never that bots are hidden.
    f = fill('shown'); { const id = crypto.randomUUID(); stub.prefs.set(`barkbot.bot.${id}`, rec('One more', HOST_ID, null)); stub.prefs.set('barkbot.bots', { ids: [...f.all, id] }); }
    out = await create('Gus');
    check('51 listed and the first 50 all show: Create says "you have 50 bots", never that some do not show', /you have 50 bots/.test(out.e ?? '') && !/show:|do not show|only/.test(out.e ?? ''), { out });
    // A malformed record (no name) is not on a gone computer: the line says what is true of it.
    f = fill('shown'); for (const id of f.extra) stub.prefs.set(`barkbot.bot.${id}`, { host_id: HOST_ID, session_id: null, created_at: '2026-11-15T09:00:00Z' });
    w0 = stub.writes.length; out = await create('Hal');
    check('45 bots that show and 5 records that are not well formed: nothing is removed, and the line says 5 are not well formed, never that their computer is gone', !!out.e && /not well formed/.test(out.e) && !/no longer enrolled/.test(out.e) && stub.writes.length === w0, { out });
    stub.sessions = []; freshStore();
  }

  // ── An unsaved first conversation stays reachable; a taken-back pick's hold is over (task-f54c1a937d06f629) ──
  console.log('Behaviour · an unsaved conversation and a taken-back pick (the live page, against the stand-in Barkpark)');
  {
    const NIA = '6a7b8c9d-0e1f-4a2b-9c3d-4e5f6a7b8c9d', OMI = '7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e';
    const KEYN = `barkbot.bot.${NIA}`;
    const twoBots = async () => {
      stub.hosts = host(true); stub.sessions = []; freshStore(); stub.prefs.set('barkbot.bots', { ids: [NIA, OMI] });
      stub.prefs.set(KEYN, rec('Nia', HOST_ID, null)); stub.prefs.set(`barkbot.bot.${OMI}`, rec('Omi', HOST_ID, null));
      await open(`${base}/?bot=${NIA}`); await until(async () => (await live()).header === 'Nia', 15000, "Nia's page").catch(() => {}); await wait(500);
    };
    const onPage = (n) => until(async () => (await live()).header === n, 15000, `${n}'s page`).catch(() => {});
    // Nia's first conversation cannot be saved to her record; the person goes to Omi and back.
    await twoBots(); stub.fail.set(`PATCH ${KEYN}`, 500);
    const m0 = stub.made.length, t0 = stub.to.length;
    await typeSend('hello nia');
    await until(() => stub.to.length > t0, 8000, "Nia's message").catch(() => {}); await wait(800);
    stub.fail.clear();
    const made = stub.made.slice(m0);
    const lineThen = await ev(() => document.querySelector('.chat-error')?.textContent ?? null);
    await clickTile('Omi'); await onPage('Omi'); await wait(500);
    stub.opened = []; await clickTile('Nia'); await onPage('Nia'); await wait(1500);
    const reopened = [...stub.opened];
    const m1 = stub.made.length, t1 = stub.to.length;
    await typeSend('back again');
    await until(() => stub.to.length > t1, 8000, "Nia's next message").catch(() => {}); await wait(800);
    const back = { made, lineThen, reopened, header: (await live()).header, nextTo: stub.to.slice(t1), newMade: stub.made.length - m1, record: stub.prefs.get(KEYN) ?? null };
    check("a first conversation not saved to Nia, then Omi picked and Nia again: her page opens that conversation, and the next message goes there with no new one (the line said only that a reload may not open it)", made.length === 1 && /reload may not open it/.test(back.lineThen ?? '') && back.header === 'Nia' && back.reopened.includes(made[0]) && JSON.stringify(back.nextTo) === JSON.stringify(made) && back.newMade === 0 && back.record?.session_id === null, back);
    await clearPrompt();
    // A held pick taken back stops its hold: picking Omi again later waits a fresh 6 s (PICK_HOLD_MS).
    // The header shows the picked name at once while a pick is held; the pick has gone when ?bot= is Omi's.
    await twoBots(); stub.deafNew = true; const s2 = stub.sent.length, m2 = stub.made.length;
    await typeSend('hello again nia');
    await until(() => stub.deaf.size > 0, 8000, "Nia's conversation").catch(() => {}); await wait(300);
    await clickTile('Omi'); await wait(800);
    const heldFirst = { bot: await onBot(), made: stub.made.length - m2, sent: stub.sent.slice(s2).map((m) => m.content) };
    await wait(1600);
    await clickTile('Nia'); await wait(300);
    const stayed = { header: (await live()).header, bot: await onBot() };
    const repickAt = Date.now(); await clickTile('Omi');
    await until(async () => (await onBot()) === OMI, 15000, "Omi's page after the re-pick").catch(() => {});
    const hold = { heldFirst, stayed, bot: await onBot(), ms: Date.now() - repickAt };
    stub.deafNew = false; stub.deaf.clear();
    check('a held pick taken back, then the same bot picked again: the new pick waits a fresh hold of about 6 s, not what was left of the first (control: the first pick was held, and taking it back kept the page)', hold.heldFirst.bot === NIA && hold.heldFirst.made === 1 && hold.heldFirst.sent.length === 0 && hold.stayed.header === 'Nia' && hold.stayed.bot === NIA && hold.bot === OMI && hold.ms >= 5500 && hold.ms < 9000, hold);
    // Only the bot's own unsaved conversation reopens, never another bot's, and a conversation
    // another tab saved to the record wins over it (from the review of #76, its probes P1 and P2).
    const PAX = '8c9d0e1f-2a3b-4c4d-9e5f-6a7b8c9d0e1f', SPAX = '00000000-0000-4000-8000-0000000007a1', S2 = '00000000-0000-4000-8000-0000000007b2';
    const NM = { [NIA]: 'Nia', [OMI]: 'Omi', [PAX]: 'Pax' };
    const threeBots = async () => {
      stub.hosts = host(true); stub.sessions = [session(SPAX)]; freshStore(); stub.prefs.set('barkbot.bots', { ids: [NIA, OMI, PAX] });
      stub.prefs.set(KEYN, rec('Nia', HOST_ID, null)); stub.prefs.set(`barkbot.bot.${OMI}`, rec('Omi', HOST_ID, null)); stub.prefs.set(`barkbot.bot.${PAX}`, rec('Pax', HOST_ID, SPAX));
      await open(`${base}/?bot=${NIA}`); await onPage('Nia'); await wait(600);
    };
    const go = async (n) => { stub.opened = []; await clickTile(n); await until(async () => (await live()).header === n && NM[await onBot()] === n, 15000, `${n}'s page`).catch(() => {}); await wait(1500); return { bot: NM[await onBot()], opened: [...stub.opened] }; };
    const sendTo = async (w) => { const t = stub.to.length, m = stub.made.length; await typeSend(w); await until(() => stub.to.length > t, 9000, w).catch(() => {}); await wait(700); return { to: stub.to.slice(t), made: stub.made.slice(m) }; };
    await threeBots();
    stub.fail.set(`PATCH ${KEYN}`, 500); const n1 = await sendTo('n1 hello'); stub.fail.clear();
    const omiEmpty = await go('Omi');
    stub.fail.set(`PATCH barkbot.bot.${OMI}`, 500); const o1 = await sendTo('o1 hello'); stub.fail.clear();
    const pax = await go('Pax');
    const niaBack = await go('Nia'); const n2 = await sendTo('n2 again');
    const omiBack = await go('Omi'); const o2 = await sendTo('o2 again');
    const own = { n1, omiEmpty, o1, pax, niaBack, n2, omiBack, o2 };
    const one = (x) => x.made.length === 1;
    check("each bot reopens only its own unsaved conversation: Omi's page opens none of Nia's; Pax opens its saved one; back on Nia and on Omi, each next message goes to its own", one(n1) && one(o1) && n1.made[0] !== o1.made[0]
      && !omiEmpty.opened.includes(n1.made[0]) && pax.opened.includes(SPAX) && !pax.opened.includes(n1.made[0]) && !pax.opened.includes(o1.made[0])
      && niaBack.opened.includes(n1.made[0]) && JSON.stringify(n2.to) === JSON.stringify(n1.made) && n2.made.length === 0
      && omiBack.opened.includes(o1.made[0]) && JSON.stringify(o2.to) === JSON.stringify(o1.made) && o2.made.length === 0, own);
    await clearPrompt();
    await threeBots();
    stub.fail.set(`PATCH ${KEYN}`, 500); const s1 = await sendTo('p2 first'); stub.fail.clear();
    stub.sessions.push(session(S2)); stub.prefs.set(KEYN, rec('Nia', HOST_ID, S2)); // another tab saved S2 to Nia
    await go('Omi'); const niaAgain = await go('Nia'); const toS2 = await sendTo('p2 to the saved one');
    const theirs = { s1: s1.made, niaAgain, toS2 };
    check("another tab saved a conversation to Nia after her unsaved one: back on Nia, the saved one is open and the next message goes to it, not to the unsaved one", one(s1) && niaAgain.opened.at(-1) === S2 && JSON.stringify(toS2.to) === JSON.stringify([S2]) && toS2.made.length === 0, theirs);
    await clearPrompt();
    // A held pick taken back because the first conversation could not be saved (#75) stops its hold too.
    await twoBots(); stub.deafNew = true; stub.fail.set(`PATCH ${KEYN}`, 500); stub.createDelay = 700;
    await typeSend('kept or not'); await wait(150);
    const firstAt = Date.now(); await clickTile('Omi');
    await until(() => stub.made.length > 0 && stub.deaf.size > 0, 8000, "Nia's conversation").catch(() => {}); await wait(800);
    stub.createDelay = 0; stub.fail.clear();
    const back2 = { bot: await onBot(), line: await ev(() => document.querySelector('.chat-error')?.textContent ?? null) };
    await wait(Math.max(0, 2500 - (Date.now() - firstAt)));
    const againAt = Date.now(); await clickTile('Omi');
    await until(async () => (await onBot()) === OMI, 15000, "Omi's page after the re-pick").catch(() => {});
    const kept2 = { back2, bot: await onBot(), ms: Date.now() - againAt };
    stub.deafNew = false; stub.deaf.clear();
    check("a held pick taken back because the first conversation could not be saved, then Omi picked again: the new pick waits a fresh hold of about 6 s (control: the pick was taken back, with the line)", kept2.back2.bot === NIA && /not saved to the bot/.test(kept2.back2.line ?? '') && kept2.bot === OMI && kept2.ms >= 5500 && kept2.ms < 9000, kept2);
    await clearPrompt(); stub.sessions = []; freshStore();
  }

  // ── A first message whose conversation does not open, with no pick (task-252c44a41576121a) ──
  console.log('Behaviour · a first message whose conversation does not open (the live page, against the stand-in Barkpark)');
  {
    const DOT = 'ad0e1f2a-3b4c-4d5e-8f6a-7b8c9d0e1f3b', EVE = 'be1f2a3b-4c5d-4e6f-9a7b-8c9d0e1f2a4c';
    const fresh = async (id, n) => {
      stub.hosts = host(true); stub.sessions = []; freshStore(); stub.prefs.set('barkbot.bots', { ids: [id] }); stub.prefs.set(`barkbot.bot.${id}`, rec(n, HOST_ID, null));
      await open(`${base}/?bot=${id}`); await until(async () => (await live()).header === n, 15000, `${n}'s page`).catch(() => {}); await wait(500);
    };
    const enter = async () => { await ev(() => document.querySelector('.prompt').focus()); await key('Enter'); };
    // Its conversation is made but its stream never opens (Barkpark refuses it).
    await fresh(DOT, 'Dot');
    stub.deafNew = true; let s0 = stub.sent.length; let t0 = Date.now();
    await typeSend('hello dot');
    await until(async () => (await promptText()) === 'hello dot', 18000, "Dot's words back").catch(() => {});
    const dot = { after: Date.now() - t0, prompt: await promptText(), line: await refusedLine() };
    await wait(3000);
    dot.sent = stub.sent.slice(s0).map((m) => m.content);
    stub.deafNew = false; stub.deaf.clear(); await clearPrompt();
    check("a first message whose conversation never opens, with no pick: within 12 s its words are back in the box with the not-sent line, and it is not sent later", dot.prompt === 'hello dot' && /was not sent/.test(dot.line ?? '') && dot.after <= 12000 && dot.sent.length === 0, dot);
    // Barkpark does not answer the request that opens the conversation (held 20 s): it is given up
    // on, so the next Enter opens a conversation and sends the words once.
    await fresh(EVE, 'Eve');
    stub.createDelay = 20000; s0 = stub.sent.length; t0 = Date.now();
    await typeSend('hello eve');
    await until(async () => (await promptText()) === 'hello eve', 18000, "Eve's words back").catch(() => {});
    const eve = { after: Date.now() - t0, prompt: await promptText(), line: await refusedLine() };
    stub.createDelay = 0;
    await enter();
    await until(() => stub.sent.length > s0, 8000, "Eve's message").catch(() => {}); await wait(500);
    eve.sent = stub.sent.slice(s0).map((m) => m.content); eve.at = Date.now() - t0;
    await clearPrompt();
    check("a first message whose conversation Barkpark does not open: its words come back with the not-sent line, and Enter then sends them once", eve.prompt === 'hello eve' && /not sent/.test(eve.line ?? '') && eve.after <= 12000 && JSON.stringify(eve.sent) === JSON.stringify(['hello eve']) && eve.at < 20000, eve);
    // Barkpark answers the request in time (7 s) but saving the conversation to the bot is slow (its
    // reads and writes held): the wait is still bounded from Enter, not from when that is done.
    const FAY = 'cf2a3b4c-5d6e-4f7a-8b8c-9d0e1f2a3b5d';
    await fresh(FAY, 'Fay');
    stub.createDelay = 7000; s0 = stub.sent.length; t0 = Date.now();
    await typeSend('hello fay'); stub.readDelay = 5000;
    await until(async () => (await promptText()) === 'hello fay', 25000, "Fay's words back").catch(() => {});
    const fay = { after: Date.now() - t0, prompt: await promptText(), line: await refusedLine() };
    stub.createDelay = 0; stub.readDelay = 0; await wait(8000);
    fay.sent = stub.sent.slice(s0).map((m) => m.content);
    await clearPrompt();
    check("a first message whose conversation is slow to be saved to the bot: within 12.5 s of Enter its words are back with the not-sent line, and it is not sent later", fay.prompt === 'hello fay' && /was not sent/.test(fay.line ?? '') && fay.after <= 12500 && fay.sent.length === 0, fay);
    // The same slow save (request 6 s, the save's reads held 2.5 s and its write 6 s): the words come
    // back at 10 s while it is still out, and Enter at once sends them, once, to the conversation
    // that then opens; the box is not dead while it opens.
    const GUS = 'd03b4c5d-6e7f-4a8b-9c9d-0e1f2a3b4c6e';
    await fresh(GUS, 'Gus');
    stub.createDelay = 6000; s0 = stub.sent.length; const g0 = stub.to.length, gm0 = stub.made.length; t0 = Date.now();
    await typeSend('hello gus'); stub.readDelay = 2500;
    await until(async () => (await promptText()) === 'hello gus', 14000, "Gus's words back").catch(() => {});
    const gus = { back: Date.now() - t0, line: await refusedLine() };
    await enter();
    await until(() => stub.sent.length > s0, 15000, "Gus's message").catch(() => {});
    gus.at = Date.now() - t0; stub.createDelay = 0; stub.readDelay = 0; await wait(3000);
    Object.assign(gus, { sent: stub.sent.slice(s0).map((m) => m.content), to: stub.to.slice(g0), made: stub.made.slice(gm0), prompt: await promptText() });
    await clearPrompt();
    check("a slow save still out when the words come back: Enter at once sends them once, to the conversation that opens", gus.back <= 12000 && /not sent/.test(gus.line ?? '') && JSON.stringify(gus.sent) === JSON.stringify(['hello gus']) && gus.made.length === 1 && JSON.stringify(gus.to) === JSON.stringify(gus.made) && gus.prompt === '', gus);
    stub.sessions = []; freshStore(); stub.sent = []; stub.to = []; stub.made = []; stub.refused = [];
  }

  // ── A send with no answer keeps its words, even when more was typed meanwhile (task-9fd77d2bc8f276e9) ──
  console.log('Behaviour · words typed while a send is on its way (the live page, against the stand-in Barkpark)');
  {
    const SQ = '00000000-0000-4000-8000-0000000002d1';
    // The Main Bot's open conversation; Barkpark takes the message and gives no answer until let go (503).
    const heldThenUnsure = async (words, typedMeanwhile) => {
      stub.hosts = host(true); stub.sessions = [session(SQ)]; freshStore(); stub.opened = [];
      await open(`${base}/`); await until(() => stub.opened.includes(SQ), 15000, "the Main Bot's conversation to open").catch(() => {}); await wait(800);
      await clearPrompt();
      const h0 = stub.heldSends.length; stub.holdSend = true;
      await typeSend(words);
      await until(() => stub.heldSends.length > h0, 8000, 'the message on its way').catch(() => {}); await wait(200);
      if (typedMeanwhile) { await ev(() => document.querySelector('.prompt').focus()); await page.send('Input.insertText', { text: typedMeanwhile }); await wait(200); }
      stub.holdSend = false; stub.heldSends.splice(0).forEach((answer) => answer());
      await until(async () => !!(await refusedLine()), 8000, 'the line').catch(() => {}); await wait(500);
      const out = { prompt: await ev(() => document.querySelector('.prompt')?.innerText ?? ''), line: await refusedLine() };
      await clearPrompt(); return out;
    };
    const lines = (t) => t.split('\n').map((x) => x.trim()).filter(Boolean);
    const alone = await heldThenUnsure('first words', null);
    check('control: a send with no answer and nothing typed meanwhile: the box holds its words and the line says it may have been sent', JSON.stringify(lines(alone.prompt)) === JSON.stringify(['first words']) && /may have been sent/.test(alone.line ?? ''), alone);
    const both = await heldThenUnsure('first words', 'second');
    check('a send with no answer while more was typed: the box holds its words first, then what was typed meanwhile, and the line says it may have been sent', JSON.stringify(lines(both.prompt)) === JSON.stringify(['first words', 'second']) && /may have been sent/.test(both.line ?? ''), both);
    // Two sends on their way at once, "three" typed after: both come back unsent, in send order or
    // the other way round; the box reads them in the order they were sent, then what was typed since.
    const SQ2 = SQ;
    const twoHeld = async (order) => {
      stub.hosts = host(true); stub.sessions = [session(SQ2)]; freshStore(); stub.opened = [];
      await open(`${base}/`); await until(() => stub.opened.includes(SQ2), 15000, "the Main Bot's conversation to open").catch(() => {}); await wait(800);
      await clearPrompt();
      const h0 = stub.heldSends.length; stub.holdSend = true;
      await typeSend('one'); await until(() => stub.heldSends.length > h0, 8000, 'the first message on its way').catch(() => {}); await wait(200);
      await typeSend('two'); await until(() => stub.heldSends.length > h0 + 1, 8000, 'the second message on its way').catch(() => {}); await wait(200);
      await ev(() => document.querySelector('.prompt').focus()); await page.send('Input.insertText', { text: 'three' }); await wait(200);
      stub.holdSend = false; const held = stub.heldSends.splice(h0);
      for (const n of order) { held[n](); await wait(700); }
      await until(async () => !!(await refusedLine()), 8000, 'the line').catch(() => {}); await wait(500);
      const out = { prompt: lines(await ev(() => document.querySelector('.prompt')?.innerText ?? '')), held: held.length };
      await clearPrompt(); return out;
    };
    const inOrder = await twoHeld([0, 1]);
    check('two sends on their way at once, "three" typed after, both unsent, answered in send order: the box reads one, two, three', inOrder.held === 2 && JSON.stringify(inOrder.prompt) === JSON.stringify(['one', 'two', 'three']), inOrder);
    const reversed = await twoHeld([1, 0]);
    check('two sends on their way at once, "three" typed after, both unsent, answered the other way round: the box still reads one, two, three', reversed.held === 2 && JSON.stringify(reversed.prompt) === JSON.stringify(['one', 'two', 'three']), reversed);
    // A send that goes while more was typed: only the typing stays in the box, with no line.
    {
      stub.hosts = host(true); stub.sessions = [session(SQ)]; freshStore(); stub.opened = [];
      await open(`${base}/`); await until(() => stub.opened.includes(SQ), 15000, "the Main Bot's conversation to open").catch(() => {}); await wait(800);
      await clearPrompt();
      const h0 = stub.heldSends.length, s0 = stub.sent.length; stub.holdSend = true;
      await typeSend('it goes'); await until(() => stub.heldSends.length > h0, 8000, 'the message on its way').catch(() => {}); await wait(200);
      await ev(() => document.querySelector('.prompt').focus()); await page.send('Input.insertText', { text: 'still typing' }); await wait(200);
      stub.holdSend = false; stub.heldSends.splice(h0).forEach((answer) => answer(true));
      await until(() => stub.sent.length > s0, 8000, 'the message to go').catch(() => {}); await wait(1000);
      const went = { prompt: lines(await ev(() => document.querySelector('.prompt')?.innerText ?? '')), line: await refusedLine(), sent: stub.sent.slice(s0).map((m) => m.content) };
      await clearPrompt();
      check('a send that goes while more was typed: the box holds only what was typed meanwhile, and no line', JSON.stringify(went.sent) === JSON.stringify(['it goes']) && JSON.stringify(went.prompt) === JSON.stringify(['still typing']) && went.line === null, went);
    }
    // A picture attached while a send with a picture is on its way: both come back unsent, the sent
    // one first, each once, with the words.
    {
      const picA = path('.cache', `unsent-a-${CHROME_PORT}.png`), picB = path('.cache', `unsent-b-${CHROME_PORT}.png`); writeFileSync(picA, PNG); writeFileSync(picB, PNG);
      const pickPic = async (file) => { await page.send('DOM.enable'); const { root: r } = await page.send('DOM.getDocument'); const { nodeId: n } = await page.send('DOM.querySelector', { nodeId: r.nodeId, selector: '.composer-wrap input[type=file]' }); await page.send('DOM.setFileInputFiles', { nodeId: n, files: [file] }); };
      const chips = () => ev(() => [...document.querySelectorAll('.composer-attachments [role=listitem]')].map((x) => x.getAttribute('aria-label')));
      stub.hosts = host(true); stub.sessions = [session(SQ)]; freshStore(); stub.opened = [];
      await open(`${base}/`); await until(() => stub.opened.includes(SQ), 15000, "the Main Bot's conversation to open").catch(() => {}); await wait(800);
      await clearPrompt();
      await pickPic(picA); await until(async () => (await chips()).length === 1, 5000, 'the first chip').catch(() => {});
      const h0 = stub.heldSends.length; stub.holdSend = true;
      await typeSend('with a picture'); await until(() => stub.heldSends.length > h0, 8000, 'the message on its way').catch(() => {}); await wait(200);
      const between = await chips();
      await pickPic(picB); await until(async () => (await chips()).length === 1, 5000, 'the second chip').catch(() => {});
      stub.holdSend = false; stub.heldSends.splice(h0).forEach((answer) => answer());
      await until(async () => !!(await refusedLine()), 8000, 'the line').catch(() => {}); await wait(500);
      const pics = { between, chips: await chips(), prompt: lines(await ev(() => document.querySelector('.prompt')?.innerText ?? '')) };
      rmSync(picA, { force: true }); rmSync(picB, { force: true });
      check('a picture attached while a send with a picture is on its way, both unsent: the box holds the sent picture, then the new one, each once, and the words', pics.between.length === 0 && JSON.stringify(pics.chips) === JSON.stringify([`unsent-a-${CHROME_PORT}.png`, `unsent-b-${CHROME_PORT}.png`]) && JSON.stringify(pics.prompt) === JSON.stringify(['with a picture']), pics);
      await clearPrompt();
    }
    stub.sessions = []; freshStore();
  }
}

console.log('Behaviour · the bot-record queue on its own (the app\'s bots.ts in this Node process, task-2ad4f1be48ff7f4d)');
await queueProbe({ check, path });

console.log(failed ? `Behaviour: ${failed} of ${ran} rules fail` : `Behaviour: all ${ran} rules hold`);
process.exit(failed ? 1 : 0);
