// Gate B (turn, H5): a recorded oracle turn replayed in ours, compared moment by moment.
// Each trace in traces/ that holds a send is played into /gate-b/<trace> (the real transcript,
// composer and conversation hook, fed by app/src/server/replay.ts instead of Barkpark), and
// what appears is timed inside the page and compared with what the oracle showed.
//
//   npm run gate:b                 every turn trace; writes parity/gate-b/<trace>.json
//   npm run gate:b -- --only <trace>   one trace
//   npm run gate:b -- --ci         compare with the recorded runs, write nothing
//   --url <base> measures an app that is already running; ports are free ones per run.
//
// Cases per trace (app/src/chat/turn.ts reads the trace):
//   each oracle moment  own bubble, working line and status, each label, each reply bubble, "replied":
//                       ours shows the same kind, in the same order, within ±150 ms (the
//                       oracle's own spread between runs: "replied" 0–101 ms after the reply)
//   nothing extra       ours shows no moment the oracle did not
//   history             after the turn the stream drops and reconnects; the stored rows it
//                       replays (Barkpark's shape, server/replay.ts) leave the same bubbles
//   budgets (QUALITY.md) composer clears in 1 frame; focus stays in Prompt; working line gone
//                       ≤ 250 ms after the reply; own bubble ≤ 440 ms and working line ≤ 2 s
//                       where the oracle's own send and run met them (else the network, not the UI)
// A run with zero cases fails. A pass count lower than the recorded one fails (--accept records it).
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { connect } from './oracle/cdp.mjs';
import { RECIPES as recipes } from './oracle/recipes.mjs';
import { path } from './lib/data.mjs';
import { oracleTurn, filler } from '../app/src/chat/turn.ts';

const args = process.argv.slice(2);
const opt = (k) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
const ACCEPT = args.includes('--accept');
const CI = args.includes('--ci');
const W = 150; // ms either side of the oracle's moment
const FRAME = 1000 / 60;
const freePort = () => new Promise((ok, no) => { const s = createServer().once('error', no).listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); });
const APP_PORT = Number(opt('port')) || await freePort(), CHROME_PORT = Number(opt('chrome-port')) || await freePort();
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function until(fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { if (await fn()) return; } catch {} await wait(100); }
  throw new Error(`timed out waiting for ${what}`);
}

// A turn trace is one whose recipe sends a message.
const ONLY = opt('only');
const traces = readdirSync(path('traces')).filter((f) => f.endsWith('.json') && (!ONLY || f === `${ONLY}.json`))
  .map((f) => JSON.parse(readFileSync(path('traces', f), 'utf8')))
  .filter((t) => recipes[t.recipe]?.kind === 'send');
if (!traces.length) { console.error('Gate B: no recorded turns in traces/: nothing to compare is a failure'); process.exit(1); }

const PROFILE = path('.cache', `gate-b-chrome-${CHROME_PORT}`); // one Chrome profile per run
const kids = [];
const stop = () => kids.forEach((k) => { try { k.kill('SIGTERM'); } catch {} });
process.on('exit', () => { stop(); try { rmSync(PROFILE, { recursive: true, force: true }); } catch {} });
process.on('SIGINT', () => process.exit(130));

let base = opt('url');
if (!base) {
  base = `http://localhost:${APP_PORT}`;
  if (await fetch(base).then(() => true, () => false)) { console.error(`Gate B: port ${APP_PORT} is already in use. Pass another --port, or --url.`); process.exit(1); }
  const app = spawn('pnpm', ['-s', 'dev', '--port', String(APP_PORT), '--strictPort'], { cwd: path('app'), stdio: ['ignore', 'pipe', 'pipe'] });
  kids.push(app);
  let log = '';
  app.stdout.on('data', (d) => (log += d)); app.stderr.on('data', (d) => (log += d));
  app.on('exit', (c) => { if (c) console.error(log.slice(-2000)); });
  await until(async () => (await fetch(base)).status > 0, 90000, `the app on ${base}`);
}
mkdirSync(PROFILE, { recursive: true });
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${CHROME_PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1040,760', 'about:blank'], { stdio: 'ignore' });
kids.push(chrome);
await until(async () => (await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`)).ok, 15000, 'headless Chrome');
const page = await connect(undefined, CHROME_PORT);
await page.send('Page.enable');

// Runs inside the page, in the same evaluate as the Enter press: every moment ours shows,
// timed by performance.now() from the keydown, read by a MutationObserver as the DOM changes.
function armAndSend() {
  const prompt = document.querySelector('[role=textbox][aria-label=Prompt]');
  const tx = document.querySelector('.transcript');
  const read = () => ({
    empty: !prompt.textContent.trim(),
    user: [...tx.querySelectorAll('[role=article] [data-role=user]')].map((b) => (b.querySelector('.bubble-text') ?? b).textContent.trim().length),
    assistant: [...tx.querySelectorAll('[role=article] [data-role=assistant]')].map((b) => (b.querySelector('.bubble-text') ?? b).textContent.trim().length),
    working: !!tx.querySelector('.working'),
    leaving: tx.querySelector('.working.leaving') ? parseFloat(getComputedStyle(tx.querySelector('.working.leaving')).transitionDuration) * 1000 : null,
    label: tx.querySelector('.working .work-label')?.textContent.trim() ?? '',
    status: tx.querySelector('[role=status]')?.textContent.trim() ?? '',
    focus: document.activeElement === prompt,
  });
  const log = [];
  let was = read();
  const t0 = performance.now();
  const at = () => Math.round((performance.now() - t0) * 10) / 10;
  const look = () => {
    const now = read(), t = at();
    if (now.empty && !was.empty) log.push({ kind: 'clear', t });
    for (let i = was.user.length; i < now.user.length; i++) log.push({ kind: 'user', t, len: now.user[i] });
    if (now.working && !was.working) log.push({ kind: 'working', t });
    // Gone = its exit has played out (leaving + its own transition), not when React drops the node.
    if (now.leaving !== null && was.leaving === null) log.push({ kind: 'working-gone', t: Math.round((t + now.leaving) * 10) / 10 });
    if (!now.working && was.working && was.leaving === null) log.push({ kind: 'working-gone', t });
    if (now.label && now.label !== was.label) log.push({ kind: /^Typing/.test(now.label) ? 'label:typing' : 'label:status', t, text: now.label });
    for (let i = was.assistant.length; i < now.assistant.length; i++) log.push({ kind: 'assistant', t, len: now.assistant[i] });
    if (now.status !== was.status && / is working$/.test(now.status)) log.push({ kind: 'status:working', t });
    if (now.status !== was.status && / replied$/.test(now.status)) log.push({ kind: 'status:replied', t });
    if (!now.focus && was.focus) log.push({ kind: 'blur', t });
    was = now;
  };
  const mo = new MutationObserver(look);
  mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  prompt.addEventListener('blur', look);
  window.__gateB = { log, stop: () => { mo.disconnect(); look(); return { log, focus: document.activeElement === prompt }; } };
  prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  return true;
}

function compare(oracle, ours, focusAtEnd) {
  const cases = [];
  const nth = (list, kind, k) => list.filter((m) => m.kind === kind)[k];
  const matched = [];
  oracle.forEach((m) => {
    const k = oracle.filter((x) => x.kind === m.kind).indexOf(m);
    const o = nth(ours, m.kind, k);
    const key = `${m.kind}#${k + 1}`;
    if (!o) { cases.push({ key, pass: false, oracle: m.t, why: m.kind === 'label:status' ? 'ours never shows it: no Barkpark event carries the oracle\'s summary label (task-f13fc4b4dc2af6de)' : 'ours never shows it' }); return; }
    const lag = Math.round(o.t - m.t);
    const why = [];
    if (Math.abs(lag) > W) why.push(`${lag > 0 ? 'late' : 'early'} by ${Math.abs(lag)} ms`);
    if (m.len !== undefined && o.len !== m.len) why.push(`${o.len} characters, oracle ${m.len} (bubbles grouped differently)`);
    // Order: nothing the oracle showed strictly earlier may come later in ours.
    const before = matched.filter((x) => x.m.t < m.t && x.o.t > o.t);
    if (before.length) why.push(`out of order: after ${before.map((x) => x.key).join(', ')}`);
    matched.push({ key, m, o });
    cases.push({ key, pass: !why.length, oracle: m.t, ours: o.t, lag, why: why.join('; ') || undefined });
  });
  const counted = new Set(['user', 'working', 'label:status', 'label:typing', 'assistant', 'status:working', 'status:replied']);
  const extra = ours.filter((o) => counted.has(o.kind) && !matched.some((x) => x.o === o));
  cases.push({ key: 'nothing extra', pass: !extra.length, why: extra.length ? extra.map((o) => `${o.kind}${o.text ? ` "${o.text}"` : ''} at ${o.t}`).join(', ') : undefined });

  const first = (list, kind) => list.find((m) => m.kind === kind);
  const budget = (key, value, limit, applies = true) => {
    if (!applies) return;
    cases.push({ key, pass: value !== undefined && value <= limit, ours: value, why: value === undefined ? 'never happened' : value > limit ? `${Math.round(value)} ms > ${Math.round(limit)} ms` : undefined });
  };
  budget('budget: composer clears in 1 frame', first(ours, 'clear')?.t, FRAME);
  cases.push({ key: 'budget: focus stays in Prompt', pass: focusAtEnd && !first(ours, 'blur'), why: focusAtEnd && !first(ours, 'blur') ? undefined : 'focus left Prompt' });
  const lastReply = ours.filter((o) => o.kind === 'assistant').at(-1), gone = ours.filter((o) => o.kind === 'working-gone').at(-1);
  budget('budget: working line gone ≤ 250 ms after the reply', lastReply && gone && gone.t >= lastReply.t ? gone.t - lastReply.t : undefined, 250);
  budget('budget: own bubble ≤ 440 ms', first(ours, 'user')?.t, 440, (first(oracle, 'user')?.t ?? Infinity) <= 440);
  const runStart = Math.min(first(oracle, 'working')?.t ?? Infinity, first(oracle, 'status:working')?.t ?? Infinity);
  budget('budget: working line ≤ 2.0 s', first(ours, 'working')?.t, 2000, runStart <= 2000);
  return cases;
}

// One replayed turn: type, send, wait for the turn and the reconnect after it, read the page.
async function play(trace, sent, query = '') {
  const { milestones } = oracleTurn(trace);
  const [w, h, dpr] = trace.viewport;
  await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
  await page.send('Page.navigate', { url: `${base}/gate-b/${trace.id}${query}` });
  await until(() => page.evaluate(() => document.readyState === 'complete' && document.querySelector('[data-gate-b]')?.dataset.gateB === 'ready' && document.fonts.status === 'loaded'), 30000, `/gate-b/${trace.id}`);
  const run = await page.evaluate(() => document.querySelector('[data-gate-b]').dataset.run);
  // The draft: placeholder words of the sent message's length (O2), typed as an input event.
  await page.evaluate((text) => { const p = document.querySelector('[role=textbox][aria-label=Prompt]'); p.focus(); document.execCommand('insertText', false, text); }, filler(sent));
  await until(() => page.evaluate(() => !!document.querySelector('button[aria-label=Send]')), 5000, 'the draft');
  await page.evaluate(armAndSend);
  await wait(Math.max(...milestones.map((m) => m.t)) + 1500);
  // After the turn the replay drops the stream; the browser reconnects and gets the stored rows.
  const status = async () => (await fetch(`${base}/api/gate-b/${trace.id}?run=${run}&status`)).json().catch(() => null);
  await until(async () => (await status())?.connects >= 2, 5000, 'the reconnect').catch(() => {});
  await wait(500);
  const { log, focus } = await page.evaluate(() => window.__gateB.stop());
  const final = await page.evaluate(() => {
    const len = (role) => [...document.querySelectorAll(`.transcript [role=article] [data-role=${role}], .transcript [role=article][data-role=${role}]`)].map((b) => (b.querySelector('.bubble-text') ?? b).textContent.trim().length);
    return { user: len('user'), assistant: len('assistant') };
  });
  return { milestones, log, focus, final, status: await status() };
}

// After a reconnect, Barkpark's stored rows must claim the live bubbles, never add to them.
function historyCase(key, milestones, { final, status }) {
  const want = { user: milestones.filter((m) => m.kind === 'user').map((m) => m.len), assistant: milestones.filter((m) => m.kind === 'assistant').map((m) => m.len) };
  if (!status || status.connects < 2 || status.rows < 1) return { key, pass: false, why: `no reconnect replayed history (${JSON.stringify(status)}): nothing was checked` };
  const same = JSON.stringify(final) === JSON.stringify(want);
  return { key, pass: same, why: same ? undefined : `after ${status.rows} stored rows ours shows ${JSON.stringify(final)}, the turn was ${JSON.stringify(want)}` };
}

const report = [];
for (const trace of traces) {
  const { milestones } = oracleTurn(trace);
  const sent = recipes[trace.recipe].text.length;
  const own = milestones.find((m) => m.kind === 'user');
  if (own && own.len !== sent) { console.error(`Gate B: ${trace.id}: the own bubble holds ${own.len} characters, the recipe sent ${sent}: ARTICLE_CHROME in app/src/chat/turn.ts no longer holds`); process.exit(1); }
  const live = await play(trace, sent);
  const cases = compare(milestones, live.log, live.focus);
  cases.push(historyCase('history after a reconnect (stored as today: the last message)', milestones, live));
  // A turn of several messages, stored as one joined text (if Barkpark keeps them all).
  if (milestones.filter((m) => m.kind === 'assistant').length > 1) cases.push(historyCase('history after a reconnect (stored joined)', milestones, await play(trace, sent, '?history=joined')));
  const pass = cases.filter((c) => c.pass).length;
  report.push({ id: trace.id, captured: trace.captured, cases: cases.length, pass, results: cases, oracle: milestones.map(({ text, ...m }) => m), ours: live.log.map(({ text, ...m }) => m) });
  console.log(`Gate B · ${trace.id} · ${pass}/${cases.length} pass`);
  for (const c of cases.filter((x) => !x.pass).slice(0, Number(opt('show') ?? 20))) console.log(`  ✗ ${c.key}: ${c.why}`);
}
page.close();

const total = report.reduce((n, s) => n + s.cases, 0), passed = report.reduce((n, s) => n + s.pass, 0);
console.log(`Gate B · all ${report.length} turns · ${passed}/${total} pass`);
if (!total) { console.error('Gate B: zero cases: a gate with nothing to check fails'); process.exit(1); }
const dir = path('parity', 'gate-b');
mkdirSync(dir, { recursive: true });
const recorded = (id) => (existsSync(`${dir}/${id}.json`) ? JSON.parse(readFileSync(`${dir}/${id}.json`, 'utf8')) : null);
const lower = [], higher = [], unrecorded = [];
for (const s of report) {
  const p = recorded(s.id);
  if (!p) unrecorded.push(s.id);
  else if (s.pass < p.pass) lower.push(`${s.id} ${p.pass} → ${s.pass}`);
  else if (s.pass > p.pass) higher.push(`${s.id} ${p.pass} → ${s.pass}`);
}
if (lower.length && !ACCEPT) { console.error(`Gate B: the pass count went down (${lower.join(', ')}). Not recorded. A change that lowers it does not land; --accept records it on purpose.`); process.exit(1); }
if (CI) {
  if (unrecorded.length) { console.error(`Gate B: no recorded run for ${unrecorded.join(', ')}: run npm run gate:b and commit parity/gate-b/`); process.exit(1); }
  if (higher.length) console.log(`Gate B: higher than recorded (${higher.join(', ')}): run npm run gate:b to record it`);
  process.exit(0);
}
if (lower.length) console.log(`Gate B: recorded a LOWER count on purpose: ${lower.join(', ')}`);
// Timings move a little every run; a file is rewritten only when a verdict changed.
const verdicts = (s) => JSON.stringify(s.results.map((c) => [c.key, c.pass, (c.why ?? '').replace(/[\d.]+/g, '#')]));
for (const s of report) {
  const p = recorded(s.id);
  if (!p || p.cases !== s.cases || p.pass !== s.pass || verdicts(p) !== verdicts(s)) writeFileSync(`${dir}/${s.id}.json`, JSON.stringify({ ...s, run: new Date().toISOString() }, null, 1) + '\n');
}
process.exit(0);
