// Gate A (look) and the inventory: our app in the same state as a captured oracle state,
// measured by the same instrument (scripts/oracle/collect.mjs), compared case by case.
// Starts the app (vite dev) and a headless Chrome of its own, then stops both.
//
//   npm run gate               every state in fixtures/states; writes parity/gate-a/<state>.json (Gate A and the
//                              inventory for that state). One file per state, so lanes on different states never collide.
//   npm run gate -- --only <state>   one state
//   npm run gate -- --url http://localhost:3170   use an app that is already running
//   Ports are free ones picked per run (--port, --chrome-port to fix them), so worktrees can gate in parallel.
//
// A run with zero cases fails. A pass count lower than the recorded one fails (QUALITY.md);
// --accept records a lower count on purpose, and says so.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { connect } from './oracle/cdp.mjs';
import { collect } from './oracle/collect.mjs';
import { controls, namedElements, claims } from './lib/controls.mjs';
import { transcriptCases, transcriptKeys } from './lib/transcript.mjs';
import { path, ROOT, items as allItems } from './lib/data.mjs';
import { judged } from './lib/versions.mjs';
import { cardCases, cardKeys } from './lib/cards.mjs';

const args = process.argv.slice(2);
const opt = (k) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
const ACCEPT = args.includes('--accept');
// --ci: compare against the recorded run, write nothing (a pull request's check).
const CI = args.includes('--ci');
// Each run takes free ports of its own, so lanes in different worktrees can gate at the same time.
const freePort = () => new Promise((ok, no) => { const s = createServer().once('error', no).listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); });
const APP_PORT = Number(opt('port')) || await freePort(), CHROME_PORT = Number(opt('chrome-port')) || await freePort();
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TOL = 1; // pt, each edge
const STATE_MS = Number(opt('state-ms')) || 120000; // one state, start to measured
const STYLE_KEYS = ['background-color', 'color', 'border-radius', 'font-size', 'font-weight', 'line-height'];
const DEFAULTS = { 'background-color': 'rgba(0, 0, 0, 0)', 'border-radius': '0px' };

const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function until(fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { if (await fn()) return; } catch {} await wait(200); }
  throw new Error(`timed out waiting for ${what}`);
}

const ONLY = opt('only');
const states = readdirSync(path('fixtures', 'states')).filter((f) => f.endsWith('.json') && (!ONLY || f === `${ONLY}.json`)).map((f) => judged(JSON.parse(readFileSync(path('fixtures', 'states', f), 'utf8'))));
if (!states.length) { console.error('Gate A: no captured states in fixtures/states: nothing to compare is a failure'); process.exit(1); }

const kids = [];
const stop = () => kids.forEach((k) => { try { k.kill('SIGTERM'); } catch {} });
process.on('exit', () => { stop(); try { rmSync(PROFILE, { recursive: true, force: true }); } catch {} });
process.on('SIGINT', () => process.exit(130));

let base = opt('url');
if (!base) {
  base = `http://localhost:${APP_PORT}`;
  // Measure only the app this run started: a busy port could be anything.
  if (await fetch(base).then(() => true, () => false)) { console.error(`Gate A: port ${APP_PORT} is already in use. Pass another --port, or --url to measure that server on purpose.`); process.exit(1); }
  const app = spawn('pnpm', ['-s', 'dev', '--port', String(APP_PORT), '--strictPort'], { cwd: path('app'), stdio: ['ignore', 'pipe', 'pipe'] });
  kids.push(app);
  let log = '';
  app.stdout.on('data', (d) => (log += d)); app.stderr.on('data', (d) => (log += d));
  app.on('exit', (c) => { if (c) console.error(log.slice(-2000)); });
  // Up = it answers at all. The home page needs a Barkpark login, which CI does not have; the gate pages do not.
  await until(async () => (await fetch(base)).status > 0, 90000, `the app on ${base}`);
}
const PROFILE = path('.cache', `gate-chrome-${CHROME_PORT}`); // one Chrome profile per run: a shared one hands the second Chrome to the first
mkdirSync(PROFILE, { recursive: true });

const items = allItems();
const owner = (name) => items.find((i) => claims(i, name))?.id ?? null;
// Every oracle control in a state, the item that owns it, and whether ours has one by that name.
function inventoryOf(state, ours) {
  const ourNames = new Set(ours ? controls(ours).map((c) => c.name) : []);
  const ctl = [...new Map(controls(state).map((c) => [c.name, c])).values()].map((c) => ({ name: c.name, item: owner(c.name), ours: ourNames.has(c.name) }));
  return { id: state.id, controls: ctl, missing: ctl.filter((c) => !c.ours).length, untracked: ctl.filter((c) => !c.item).map((c) => c.name) };
}

const report = { run: new Date().toISOString(), states: [] };
const inventory = { run: report.run, states: [] };
for (const state of states) {
  const [w, h, dpr] = state.viewport;
  // A hover state scores only what the hover changed (fixture `changed`), not the screen again.
  const theirs = namedElements(state).filter(({ key }) => !state.changed || state.changed.includes(key));
  // The transcript's look (lib/transcript.mjs), words left out, and its cards (lib/cards.mjs): in every state but a hover's,
  // which scores only what the hover changes.
  const talk = !state.changed;
  // A captured state the app has no scene for yet scores 0: every case is open work.
  if ((await fetch(`${base}/gate/${state.id}`)).status === 404) {
    const keys = [...theirs.map(({ key }) => key), ...(talk ? [...transcriptKeys(state), ...cardKeys(state)] : [])];
    report.states.push({ id: state.id, captured: state.captured, viewport: state.viewport, cases: keys.length, pass: 0, scene: false, results: keys.map((key) => ({ key, pass: false, why: 'no scene' })) });
    inventory.states.push(inventoryOf(state, null));
    console.log(`Gate A · ${state.id} · 0/${keys.length} pass (no scene yet)`);
    continue;
  }
  // One state, in a Chrome of its own. A Chrome that drops its connection or stops answering
  // must not hang or kill the run (seen on the shared Mac, 2026-11-11 and -13): each try has a
  // time limit, the Chrome is gone before the next one starts on the same port, and a state
  // that fails is tried once more before the run stops, naming it.
  let chrome; // this try's Chrome: the time limit kills it, which fails whatever the try is waiting on
  const measure = async () => {
    let page;
    chrome = undefined;
    try {
    chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${CHROME_PORT}`, `--user-data-dir=${PROFILE}`, `--window-size=${w},${h}`, `--force-device-scale-factor=${dpr}`, 'about:blank'], { stdio: 'ignore' });
    kids.push(chrome);
    await until(async () => (await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`)).ok, 15000, 'headless Chrome');
    page = await connect(undefined, CHROME_PORT);
    await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
    await page.send('Page.enable');
    // --throttle <n>: slow this Chrome's CPU n times, to rehearse a slow CI runner.
    if (opt('throttle')) await page.send('Emulation.setCPUThrottlingRate', { rate: Number(opt('throttle')) });
    await page.send('Page.navigate', { url: `${base}/gate/${state.id}` });
    await until(() => page.evaluate(() => document.readyState === 'complete' && !!document.querySelector('.app') && document.fonts.status === 'loaded' && !document.querySelector('[data-transcript]:not([data-hydrated])')), 30000, `/gate/${state.id}`);
    await wait(300);
    if (state.pointer) {
      // Rest our pointer on our control of the same name, as the capture did on the oracle's.
      const hit = controls(await page.evaluate(collect)).filter((c) => c.name === state.pointer.over)[state.pointer.nth ?? 0];
      if (hit) { const [x, y, bw, bh] = hit.e.box; await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + bw / 2, y: y + bh / 2 }); await wait(400); }
    }
    // A capture taken with the pointer parked in the window: rest ours at the same point.
    if (state.parked && !state.pointer) { await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: state.parked[0], y: state.parked[1] }); await wait(400); }
    // The capture's last step (fixture `act`), replayed on ours the same way.
    const act = state.act;
    if (act?.type) { await page.send('Input.insertText', { text: act.type }); await wait(400); }
    if (act?.wheel || act?.hoverRole) {
      const el = (await page.evaluate(collect)).elements.find((e) => e.role === (act.wheel || act.hoverRole) && e.box[2] > 0 && e.box[3] > 0);
      if (el) {
        const [x, y, bw, bh] = el.box;
        if (act.hoverRole) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + bw / 2, y: y + Math.min(bh, 32) / 2 });
        else for (let i = 0; i < 10; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: x + bw / 2, y: y + bh / 2, deltaX: 0, deltaY: 400 });
        await wait(600);
      }
    }
    // Tooltips and hover cards arrive after a delay that a slow runner stretches: when a state lists
    // what it changed, wait (up to 3 s) until ours shows every one of those keys before measuring.
    if (state.changed) {
      const want = new Set(state.changed);
      for (let t = 0; t < 30; t++) { const have = new Set(namedElements(await page.evaluate(collect)).map((c) => c.key)); if ([...want].every((k) => have.has(k))) break; await wait(100); }
      await wait(150);
    }
      return await page.evaluate(collect);
    } finally {
      try { page?.close(); } catch {}
      if (chrome) {
        const gone = new Promise((ok) => chrome.once('exit', ok));
        chrome.kill('SIGTERM');
        await Promise.race([gone, wait(5000).then(() => { try { chrome.kill('SIGKILL'); } catch {} })]);
        kids.splice(kids.indexOf(chrome), 1);
      }
      // The port is free again only when nothing answers on it.
      await until(async () => !(await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`).then(() => true, () => false)), 10000, 'the last Chrome to be gone').catch(() => {});
    }
  };
  // A try that runs out of time is not left running: its Chrome is killed (every call waiting on
  // it then fails), and the try's own clean-up finishes before the next try starts on the port.
  const limited = async () => {
    const run = measure();
    let t;
    const late = new Promise((_, no) => { t = setTimeout(() => no(new Error(`no answer within ${STATE_MS / 1000} s`)), STATE_MS); });
    try { return await Promise.race([run, late]); }
    catch (e) { try { chrome?.kill('SIGKILL'); } catch {} await run.catch(() => {}); throw e; }
    finally { clearTimeout(t); }
  };
  let ours;
  try { ours = await limited(); } catch (e) {
    console.error(`Gate A · ${state.id} · the browser failed (${e?.message ?? e?.type ?? e}); trying once more`);
    try { ours = await limited(); } catch (e2) { console.error(`Gate A: ${state.id} could not be measured: ${e2?.message ?? e2?.type ?? e2}`); process.exit(1); }
  }

  // Gate A: same name, box within 1 pt on every edge, the same look.
  const mine = new Map(namedElements(ours).map((c) => [c.key, c]));
  const cases = theirs.map(({ key, e }) => {
    const m = mine.get(key);
    if (!m) return { key, pass: false, why: 'missing' };
    const d = e.box.map((v, i) => Math.round((m.e.box[i] - v) * 10) / 10);
    const edges = [d[0], d[1], d[0] + d[2], d[1] + d[3]];
    const why = [];
    if (edges.some((x) => Math.abs(x) > TOL)) why.push(`box off by ${d.join(',')}`);
    for (const k of STYLE_KEYS) {
      const a = e.style[k] ?? DEFAULTS[k], b = m.e.style[k] ?? DEFAULTS[k];
      if (a !== b) why.push(`${k} ${b ?? '—'} ≠ ${a ?? '—'}`);
    }
    return { key, pass: !why.length, why: why.join('; ') || undefined };
  });
  if (talk) cases.push(...transcriptCases(state, ours), ...cardCases(state, ours));
  const pass = cases.filter((c) => c.pass).length;
  report.states.push({ id: state.id, captured: state.captured, viewport: state.viewport, cases: cases.length, pass, results: cases });

  inventory.states.push(inventoryOf(state, ours));

  console.log(`Gate A · ${state.id} · ${pass}/${cases.length} pass`);
  for (const c of cases.filter((x) => !x.pass).slice(0, Number(opt('show') || 12))) console.log(`  ✗ ${c.key}: ${c.why}`);
  const inv = inventory.states.at(-1);
  console.log(`Inventory · ${state.id} · ours has ${inv.controls.length - inv.missing}/${inv.controls.length} controls${inv.untracked.length ? ` · untracked: ${inv.untracked.join(', ')}` : ''}`);
}

const total = report.states.reduce((n, s) => n + s.cases, 0);
const passed = report.states.reduce((n, s) => n + s.pass, 0);
report.total = { cases: total, pass: passed };
console.log(`Gate A · all ${report.states.length} states · ${passed}/${total} pass`);
if (!total) { console.error('Gate A: zero cases: a gate with nothing to check fails'); process.exit(1); }
const dir = path('parity', 'gate-a');
mkdirSync(dir, { recursive: true });
const recorded = (id) => (existsSync(`${dir}/${id}.json`) ? JSON.parse(readFileSync(`${dir}/${id}.json`, 'utf8')) : null);
const lower = [], higher = [], unrecorded = [];
for (const s of report.states) {
  const p = recorded(s.id);
  if (!p) unrecorded.push(s.id);
  else if (s.pass < p.pass) lower.push(`${s.id} ${p.pass} → ${s.pass}`);
  else if (s.pass > p.pass) higher.push(`${s.id} ${p.pass} → ${s.pass}`);
}
if (lower.length && !ACCEPT) { console.error(`Gate A: the pass count went down (${lower.join(', ')}). Not recorded. A change that lowers it does not land; --accept records it on purpose.`); process.exit(1); }
if (CI) {
  if (unrecorded.length) { console.error(`Gate A: no recorded run for ${unrecorded.join(', ')}: run npm run gate and commit parity/gate-a/`); process.exit(1); }
  if (higher.length) console.log(`Gate A: higher than recorded (${higher.join(', ')}): run npm run gate to record it`);
  process.exit(0);
}
if (lower.length) console.log(`Gate A: recorded a LOWER count on purpose: ${lower.join(', ')}`);
// Only a state whose numbers changed is rewritten: an unchanged state's file stays byte-identical.
for (const s of report.states) {
  const inv = inventory.states.find((x) => x.id === s.id);
  const p = recorded(s.id);
  const same = p && p.pass === s.pass && p.cases === s.cases && JSON.stringify(p.results) === JSON.stringify(s.results) && JSON.stringify(p.inventory) === JSON.stringify(inv);
  if (!same) writeFileSync(`${dir}/${s.id}.json`, JSON.stringify({ ...s, run: report.run, inventory: inv }, null, 1) + '\n');
}
const untracked = inventory.states.flatMap((s) => s.untracked);
if (untracked.length) { console.error(`Inventory: ${untracked.length} oracle control(s) belong to no item: ${[...new Set(untracked)].join(', ')}`); process.exit(1); }
process.exit(0);
