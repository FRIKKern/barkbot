// The rename recipe (owner-approved 2026-11-09): what the details panel's "Bot name" field does on
// focus, Escape, Enter, a click away and an empty name. It acts only on the throwaway bot (O1),
// types only the fixed names below (O3), and always renames the bot back to ORACLE_BOT (finally).
// Stores labels, styles and timings; the only text it stores is the bot names it typed itself.
// Usage: ORACLE_BOT=Oracle node scripts/oracle/rename.mjs   -> traces/<date>-rename.json
import { writeFileSync } from 'node:fs';
import { connect } from './cdp.mjs';
import { activeBot, ORACLE_BOT } from './recipes.mjs';
import { path } from '../lib/data.mjs';

const TRIAL = `${ORACLE_BOT} Two`;
const page = await connect();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
if ((await activeBot(page)) !== ORACLE_BOT) throw new Error(`refusing: the open bot is not the throwaway "${ORACLE_BOT}" (O1)`);
await page.send('Page.bringToFront');

const SEL = 'input[aria-label="Bot name"]';
const read = () => page.evaluate((sel) => {
  const i = document.querySelector(sel);
  const cs = i && getComputedStyle(i);
  const r = i?.getBoundingClientRect();
  const a = document.activeElement;
  return {
    t: performance.now(),
    value: i?.value ?? null,
    focused: a === i,
    active: a === document.body ? 'body' : (a?.getAttribute('aria-label') || a?.tagName || null),
    selection: i && a === i ? [i.selectionStart, i.selectionEnd] : null,
    header: document.querySelector('main header [role=heading]')?.innerText.trim() ?? null,
    rect: r ? [r.x, r.y, r.width, r.height].map((n) => +n.toFixed(1)) : null,
    css: cs ? { color: cs.color, background: cs.backgroundColor, border: cs.border, borderRadius: cs.borderRadius, padding: cs.padding,
      outline: cs.outline, outlineOffset: cs.outlineOffset, boxShadow: cs.boxShadow, caretColor: cs.caretColor, transition: cs.transition.slice(0, 200) } : null,
  };
}, SEL);

const center = async () => { const r = (await read()).rect; return { x: r[0] + r[2] / 2, y: r[1] + r[3] / 2 }; };
const mouse = async (type, at) => page.send('Input.dispatchMouseEvent', { type, button: 'left', clickCount: 1, ...at });
const click = async (at) => { await mouse('mouseMoved', at); await mouse('mousePressed', at); await mouse('mouseReleased', at); };
const KEY = { Enter: 13, Escape: 27, Backspace: 8, a: 65 };
const key = async (k, mods = 0, commands) => {
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k === 'a' ? 'KeyA' : k, modifiers: mods, windowsVirtualKeyCode: KEY[k], ...(commands ? { commands } : {}) });
  if (k === 'Enter') await page.send('Input.dispatchKeyEvent', { type: 'char', key: k, code: k, text: '\r', windowsVirtualKeyCode: 13 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k === 'a' ? 'KeyA' : k, modifiers: mods, windowsVirtualKeyCode: KEY[k] });
};
const selectAll = () => key('a', 4, ['selectAll']);
// A point away from the field: plain transcript background, checked to be nothing you can press.
const away = async () => {
  const at = await page.evaluate(() => {
    const m = document.querySelector('main')?.getBoundingClientRect();
    if (!m) return null;
    for (const fy of [0.3, 0.45, 0.6]) for (const fx of [0.08, 0.5, 0.92]) {
      const x = m.x + m.width * fx, y = m.y + m.height * fy;
      const e = document.elementFromPoint(x, y);
      // The transcript (role=log) and its messages (role=article) take focus (tabindex 0) but do nothing
      // when clicked; anything that acts (a button, a link, a field) is refused.
      const hit = e && e.closest('button,a,input,textarea,select,[role=button],[role=link],[role=menuitem],[contenteditable=true],[tabindex]');
      if (e && e.closest('main') && (!hit || ['log', 'article'].includes(hit.getAttribute('role')))) return { x, y };
    }
    return null;
  });
  if (!at) throw new Error('no safe spot to click away to; stopping');
  return at;
};
// Samples every frame for `ms`, keeping only the frames where something changed.
const watch = async (ms) => {
  const out = []; const end = Date.now() + ms; let last = '';
  while (Date.now() < end) { const s = await read(); const k = JSON.stringify({ ...s, t: 0 }); if (k !== last) { out.push(s); last = k; } await wait(16); }
  return out;
};

const trace = { id: `${new Date().toISOString().slice(0, 10)}-rename`, oracle_version: null, bot: ORACLE_BOT, typed: [TRIAL, ''], steps: [] };
trace.oracle_version = await page.evaluate(() => navigator.userAgent.match(/GrokBot\/([\d.]+)/)?.[1] ?? null);
const step = async (name, act, ms = 1200) => { const before = await read(); const t0 = before.t; await act(); const frames = await watch(ms); trace.steps.push({ name, before, frames: frames.map((f) => ({ ...f, t: +(f.t - t0).toFixed(1) })) }); };

try {
  trace.rest = await read();
  await mouse('mouseMoved', await center()); await wait(400); trace.hover = await read();
  await step('click into the field', async () => click(await center()));
  await step('type a new name, then Escape', async () => { await selectAll(); await page.send('Input.insertText', { text: TRIAL }); await wait(300); await key('Escape'); });
  await step('click into the field again', async () => click(await center()));
  await step('type a new name, then Enter', async () => { await selectAll(); await page.send('Input.insertText', { text: TRIAL }); await wait(300); await key('Enter'); }, 2500);
  await step('click into the field, empty it, then Enter', async () => { await click(await center()); await selectAll(); await key('Backspace'); await wait(300); await key('Enter'); }, 2500);
  await step('click into the field, type the old name, click away', async () => { await click(await center()); await selectAll(); await page.send('Input.insertText', { text: ORACLE_BOT }); await wait(300); await click(await away()); }, 2500);
} finally {
  // Whatever happened, the bot ends up named ORACLE_BOT again.
  let s = await read();
  if (s.value !== ORACLE_BOT || s.header !== ORACLE_BOT) {
    await click(await center()); await selectAll(); await page.send('Input.insertText', { text: ORACLE_BOT }); await wait(300); await key('Enter'); await wait(1500);
    s = await read();
  }
  trace.restored = { value: s.value, header: s.header };
  writeFileSync(path(`traces/${trace.id}.json`), JSON.stringify(trace, null, 1) + '\n');
  console.log(`traces/${trace.id}.json · restored: value=${s.value} header=${s.header}`);
  page.close();
}
