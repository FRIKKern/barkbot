// The Voice picker's behaviour on the oracle (1.2.3), for what a capture cannot show:
// where focus lands when it opens, whether a pick closes it, the speed slider's step and how
// a value shows, and every row's name and description. Two steps change the bot's setting
// (a pick, a slider step); both run in the throwaway Oracle bot only (O1), and each is put
// back and checked before the next. Nothing else is pressed.
//   ORACLE_BOT=Oracle node scripts/oracle/voice-picker.mjs   -> fixtures/oracle-1.2.3/traces/<date>-voice-picker.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { connect } from './cdp.mjs';
import { activeBot, ORACLE_BOT } from './recipes.mjs';
import { collect } from './collect.mjs';
import { controls } from '../lib/controls.mjs';
import { path } from '../lib/data.mjs';

const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const page = await connect();
if ((await activeBot(page)) !== ORACLE_BOT) throw new Error(`refusing: the open bot is not "${ORACLE_BOT}" (O1)`);
const front = async () => { execFileSync('open', ['-a', 'Grok Bot']); await page.send('Page.bringToFront'); await wait(300); };
const click = async (x, y) => { await front(); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); await wait(800); };
const key = async (k, code, ms = 600) => { for (const type of ['rawKeyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: code }); await wait(ms); };
const row = async () => controls(await page.evaluate(collect)).find((c) => c.name === 'Voice');
const rowText = async () => page.evaluate(() => [...document.querySelectorAll('aside button[aria-haspopup=dialog]')].map((b) => b.innerText.trim()).find((t) => /\d(\.\d+)?x$/.test(t)) ?? null);
const openVoice = async () => { const [x, y, w, h] = (await row()).e.box; await click(x + w / 2, y + h / 2); };
// What the open picker shows: focus, its rows (name, description, checked), the scroller, the slider.
const look = () => page.evaluate(() => {
  const d = [...document.querySelectorAll('[role=dialog]')].find((x) => x.getAttribute('aria-label') === 'Voice');
  if (!d) return { open: false };
  const a = document.activeElement;
  const radios = [...d.querySelectorAll('[role=radio]')];
  const g = d.querySelector('[role=radiogroup]');
  let s = g; while (s && s.scrollHeight <= s.clientHeight) s = s.parentElement;
  const sl = d.querySelector('input[aria-label="Speed"]');
  // The value as the dialog prints it, beside the slider: one span per character ("1", ".", "0", "x").
  // A changed digit rolls: the old one stays on the page at opacity 0, the new one on top of it.
  let srow = sl; while (srow && !/Speed/.test(srow.innerText)) srow = srow.parentElement;
  const chars = srow ? [...srow.querySelectorAll('span')].filter((e) => !e.children.length && e.textContent.trim().length === 1) : [];
  const shown = chars.filter((e) => Number(getComputedStyle(e).opacity) > 0).map((e) => e.textContent).join('');
  const hidden = chars.filter((e) => Number(getComputedStyle(e).opacity) === 0).map((e) => e.textContent).join('');
  return {
    open: true,
    focus: a ? { tag: a.tagName.toLowerCase(), role: a.getAttribute('role'), label: a.getAttribute('aria-label'), row: radios.indexOf(a.closest('[role=radio]')), name: a.closest('[role=radio]')?.innerText.split('\n')[0] ?? null } : null,
    rows: radios.map((r) => { const [name, description] = r.innerText.split('\n').map((t) => t.trim()).filter(Boolean); return { name, description, checked: r.getAttribute('aria-checked') }; }),
    scroll: s ? { top: Math.round(s.scrollTop), height: s.scrollHeight, view: s.clientHeight } : null,
    slider: sl ? { type: sl.type, min: sl.min, max: sl.max, step: sl.step, value: sl.value, valuetext: sl.getAttribute('aria-valuetext'), shown, hidden, chars: chars.length } : null,
  };
});
const radioAt = (name) => page.evaluate((name) => {
  const r = [...document.querySelectorAll('[role=dialog] [role=radio]')].find((x) => x.innerText.split('\n')[0].trim() === name);
  if (!r) return null; r.scrollIntoView({ block: 'nearest' });
  const b = r.getBoundingClientRect(); return [b.x + 24, b.y + b.height - 16]; // the name line, away from its preview button
}, name);

const before = await rowText();
if (before !== 'Helix 1.0x') throw new Error(`the Voice row reads "${before}", not "Helix 1.0x": put it back by hand before probing`);
const trace = { recipe: 'voice-picker', oracle_version: await page.evaluate(() => navigator.userAgent.match(/GrokBot\/([\d.]+)/)?.[1] ?? null), recorded: new Date().toISOString(), bot: ORACLE_BOT, before };

// 1. Open: where focus lands, every row, the scroller, the slider.
await openVoice();
trace.opened = await look();
if (!trace.opened.open) throw new Error('the Voice picker did not open');

// 2. The slider: one ArrowRight step from 1.0, read, one ArrowLeft back.
await page.evaluate(() => document.querySelector('[role=dialog] input[aria-label="Speed"]').focus());
// The printed value rolls: right after a step the old and new digits are both on the page.
await key('ArrowRight', 39, 100);
const early = (await look()).slider.shown;
await wait(2000);
trace.sliderUp = { ...(await look()).slider, at100ms: early, row: await rowText() };
await key('ArrowLeft', 37, 2000);
trace.sliderBack = { ...(await look()).slider, row: await rowText() };
if (trace.sliderBack.value !== trace.opened.slider.value) throw new Error(`speed not put back: ${trace.sliderBack.value}`);

// 3. A pick: the row before Helix, then Helix again.
const helix = trace.opened.rows.findIndex((r) => r.name === 'Helix');
const other = trace.opened.rows[helix - 1].name;
await click(...(await radioAt(other)));
trace.pick = { picked: other, ...(await look()), row: await rowText() };
if (!trace.pick.open) await openVoice();
await click(...(await radioAt('Helix')));
trace.pickBack = { open: (await look()).open, row: await rowText() };
if (trace.pickBack.open) await key('Escape', 27);
trace.after = await rowText();
if (trace.after !== 'Helix 1.0x') throw new Error(`not put back: the Voice row reads "${trace.after}"`);
for (const k of ['pick', 'sliderUp', 'sliderBack']) delete trace[k]?.rows; // the rows are in `opened`
delete trace.pick.focus;

mkdirSync(path('fixtures', 'oracle-1.2.3', 'traces'), { recursive: true });
const out = path('fixtures', 'oracle-1.2.3', 'traces', `${trace.recorded.slice(0, 10)}-voice-picker.json`);
writeFileSync(out, JSON.stringify(trace, null, 1) + '\n');
console.log(`${out}: focus on open ${JSON.stringify(trace.opened.focus)}; a pick leaves it ${trace.pick.open ? 'open' : 'closed'}; step ${trace.opened.slider?.step}; one step shows ${trace.sliderUp.shown} (row "${trace.sliderUp.row}"); put back: "${trace.after}"`);
page.close();
