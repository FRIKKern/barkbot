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
import { path, ROOT, items as allItems } from './lib/data.mjs';

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
const STYLE_KEYS = ['background-color', 'color', 'border-radius', 'font-size', 'font-weight', 'line-height'];
const DEFAULTS = { 'background-color': 'rgba(0, 0, 0, 0)', 'border-radius': '0px' };

const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function until(fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { if (await fn()) return; } catch {} await wait(200); }
  throw new Error(`timed out waiting for ${what}`);
}

const ONLY = opt('only');
const states = readdirSync(path('fixtures', 'states')).filter((f) => f.endsWith('.json') && (!ONLY || f === `${ONLY}.json`)).map((f) => JSON.parse(readFileSync(path('fixtures', 'states', f), 'utf8')));
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
  const theirs = namedElements(state);
  // A captured state the app has no scene for yet scores 0: every case is open work.
  if ((await fetch(`${base}/gate/${state.id}`)).status === 404) {
    report.states.push({ id: state.id, captured: state.captured, viewport: state.viewport, cases: theirs.length, pass: 0, scene: false, results: theirs.map(({ key }) => ({ key, pass: false, why: 'no scene' })) });
    inventory.states.push(inventoryOf(state, null));
    console.log(`Gate A · ${state.id} · 0/${theirs.length} pass (no scene yet)`);
    continue;
  }
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${CHROME_PORT}`, `--user-data-dir=${PROFILE}`, `--window-size=${w},${h}`, `--force-device-scale-factor=${dpr}`, 'about:blank'], { stdio: 'ignore' });
  kids.push(chrome);
  await until(async () => (await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`)).ok, 15000, 'headless Chrome');
  const page = await connect(undefined, CHROME_PORT);
  await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
  await page.send('Page.enable');
  await page.send('Page.navigate', { url: `${base}/gate/${state.id}` });
  await until(() => page.evaluate(() => document.readyState === 'complete' && !!document.querySelector('.app') && document.fonts.status === 'loaded'), 30000, `/gate/${state.id}`);
  await wait(300);
  const ours = await page.evaluate(collect);
  page.close();
  chrome.kill('SIGTERM');
  kids.splice(kids.indexOf(chrome), 1);
  await wait(300);

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
