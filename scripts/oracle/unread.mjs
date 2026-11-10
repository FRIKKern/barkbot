// What clears the rail's "Unread activity" dot (owner-approved 2026-11-09). Run right after a recorded
// turn in the throwaway bot (O1). It tries one harmless gesture at a time, in a fixed order, and stops at
// the first one that clears the dot: wait, move the mouse over the transcript, scroll the transcript,
// click into the Prompt box (nothing is typed), click the bot's own tile. Stores the dot's look and
// what each gesture did; no text (O2).
// --send <recipe>: first send that recipe (O1 guard in run), open Settings and put Finder in front, so the
// reply lands while the bot is not in view; then wait for the dot and try the gestures.
// Usage: ORACLE_BOT=Oracle node scripts/oracle/unread.mjs [--id name] [--from <step>] [--send storage]
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { connect } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { activeBot, ORACLE_BOT, run } from './recipes.mjs';
import { path } from '../lib/data.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const id = opt('id', `${new Date().toISOString().slice(0, 10)}-unread`);
const from = opt('from', 'wait');
const page = await connect();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
if ((await activeBot(page)) !== ORACLE_BOT) throw new Error(`refusing: the open bot is not the throwaway "${ORACLE_BOT}" (O1)`);
await page.send('Page.bringToFront');

const dot = () => page.evaluate((bot) => {
  const tile = [...document.querySelectorAll('aside[aria-label="Bots"] button[aria-label]')].find((b) => { const l = b.getAttribute('aria-label'); return l === bot || l.startsWith(bot + ','); });
  const d = tile?.querySelector('[role=status][aria-label="Unread activity"]');
  const cs = d && getComputedStyle(d), r = d?.getBoundingClientRect();
  return { t: performance.now(), tile: tile?.getAttribute('aria-label') ?? null, focus: document.hasFocus(), visible: document.visibilityState,
    dot: d ? { rect: [r.x, r.y, r.width, r.height].map((n) => +n.toFixed(1)), background: cs.backgroundColor, border: cs.border, boxShadow: cs.boxShadow,
      borderRadius: cs.borderRadius, opacity: cs.opacity, outline: cs.outline,
      // The span's own background is transparent (2026-11-09): read where the paint is, its pseudo-elements and children.
      parts: [...['::before', '::after'].map((pe) => [pe, getComputedStyle(d, pe)]), ...[...d.querySelectorAll('*')].slice(0, 4).map((c) => [c.tagName.toLowerCase(), getComputedStyle(c)])]
        .filter(([, s]) => s.content !== 'none' || s.display !== 'none')
        .map(([what, s]) => ({ what, content: s.content, background: s.backgroundColor, fill: s.fill, color: s.color, boxShadow: s.boxShadow, width: s.width, height: s.height })) } : null };
}, ORACLE_BOT);
const point = (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
const mouse = (type, at, extra = {}) => page.send('Input.dispatchMouseEvent', { type, button: 'left', clickCount: 1, ...at, ...extra });
const click = async (at) => { await mouse('mouseMoved', at); await mouse('mousePressed', at); await mouse('mouseReleased', at); };

const STEPS = {
  wait: async () => wait(3000),
  'mouse over the transcript': async () => { const at = await point('main [role=log]'); await mouse('mouseMoved', at); },
  'scroll the transcript': async () => { const at = await point('main [role=log]'); for (const dy of [-300, 300, 300]) { await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...at, deltaX: 0, deltaY: dy }); await wait(120); } },
  'click into the Prompt box': async () => click(await point('main [role=textbox][aria-label="Prompt"]')),
  'click its own tile': async () => click(await point(`aside[aria-label="Bots"] button[aria-label^="${ORACLE_BOT}"]`)),
};
const front = async () => { execFileSync('open', ['-a', 'Grok Bot']); await page.send('Page.bringToFront'); await wait(400); };
const key = async (k, code) => { for (const type of ['rawKeyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: code }); };
const sending = opt('send', null);
if (sending) Object.assign(STEPS, Object.fromEntries([
  ['wait', STEPS.wait], ['bring the window to the front', front], ['close Settings', () => key('Escape', 27)],
  ...Object.entries(STEPS).filter(([k]) => k !== 'wait'),
].map(([k, v]) => [k, v])));
// Re-key in the order above when sending (Object.assign keeps the first insertion order).
const ORDER = sending ? ['wait', 'bring the window to the front', 'close Settings', 'mouse over the transcript', 'scroll the transcript', 'click into the Prompt box', 'click its own tile'] : Object.keys(STEPS);
const names = ORDER; const start = names.indexOf(from);
if (start < 0) throw new Error(`unknown step ${from}; known: ${names.join(', ')}`);

const out = { id, oracle_version: await page.evaluate(() => navigator.userAgent.match(/GrokBot\/([\d.]+)/)?.[1] ?? null), bot: ORACLE_BOT, steps: [], clearedBy: null };
if (sending) {
  out.precondition = await dot();
  if (out.precondition.dot) throw new Error('the dot is already on before the send: the run would measure an old dot');
  if (!out.precondition.tile) throw new Error(`no rail tile for ${ORACLE_BOT}: the selector is wrong, stopping before the send`);
  await front();
  const t0 = performance.now();
  await run(page, sending);
  await wait(500);
  // Settings, from the account menu: a real pointer press on each (menus open on pointerdown).
  for (const sel of ['button[aria-label^="Open account menu"]', '[role=menuitem]']) {
    const at = await page.evaluate((sel) => {
      const e = sel === '[role=menuitem]' ? [...document.querySelectorAll(sel)].find((m) => m.innerText.trim() === 'Settings') : document.querySelector(sel);
      if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, sel);
    if (!at) throw new Error(`could not find ${sel} for Settings`);
    await click(at); await wait(500);
  }
  execFileSync('osascript', ['-e', 'tell application "Finder" to activate']);
  const polls = []; let seenAt = null; const limit = Date.now() + 90000;
  while (Date.now() < limit) {
    const s = await dot();
    const k = JSON.stringify({ ...s, t: 0 }); if (k !== polls.at(-1)?.k) polls.push({ k, ...s, t: +(s.t - t0).toFixed(1) });
    if (s.dot && seenAt === null) seenAt = Date.now();
    if (seenAt && Date.now() - seenAt > 3000) break;
    await wait(50);
  }
  out.away = polls.map(({ k, ...p }) => p);
  console.error(seenAt ? `dot appeared at ${out.away.find((p) => p.dot)?.t} ms from the send` : 'no dot within 90 s of the send');
}
out.start = await dot();
if (!out.start.dot) console.error('no unread dot on the tile now: nothing to clear');
for (const name of names.slice(start)) {
  if (!out.start.dot) break;
  const before = await dot();
  await STEPS[name]();
  const frames = []; const end = Date.now() + 1200; let last = '';
  while (Date.now() < end) { const s = await dot(); const k = JSON.stringify({ ...s, t: 0 }); if (k !== last) { frames.push({ ...s, t: +(s.t - before.t).toFixed(1) }); last = k; } await wait(16); }
  const after = frames.at(-1);
  out.steps.push({ name, before: { dot: !!before.dot, focus: before.focus }, after: { dot: !!after.dot, tile: after.tile, focus: after.focus }, frames });
  console.error(`${name}: dot ${before.dot ? 'on' : 'off'} -> ${after.dot ? 'on' : 'off'}`);
  if (!after.dot) { out.clearedBy = name; break; }
}
if (sending) { await front(); await key('Escape', 27); }
const file = path('traces', `${id}.json`);
writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log(`traces/${id}.json · cleared by: ${out.clearedBy ?? 'nothing tried'} · dot ${JSON.stringify(out.start.dot)}`);
page.close();
