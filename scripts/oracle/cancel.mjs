// Where is the oracle's cancel (C1)? Sends the long-answer recipe, watches the labels in the
// conversation pane while the reply comes, presses a Stop if one shows (else Escape), and says
// what the reply did. Labels, counts and times only; no conversation text (O2).
// Usage: ORACLE_BOT=Oracle node scripts/oracle/cancel.mjs [--shot file.png]
import { writeFileSync, mkdirSync } from 'node:fs';
import { connect } from './cdp.mjs';
import { run, activeBot } from './recipes.mjs';
import { collect } from './collect.mjs';
import { path } from '../lib/data.mjs';

const args = process.argv.slice(2);
const shotAt = args.includes('--shot') ? args[args.indexOf('--shot') + 1] : null;
const page = await connect();
const bot = await activeBot(page);
const look = () => page.evaluate(() => {
  const arts = [...document.querySelectorAll('main [role=article][data-role]')];
  return {
    labels: [...document.querySelectorAll('main button')].map((b) => (b.getAttribute('aria-label') || b.innerText || '').trim().split('\n')[0].slice(0, 40)).filter(Boolean),
    bubbles: arts.length, last: arts.at(-1)?.dataset.role ?? null, lastLen: arts.at(-1)?.innerText.length ?? 0,
    status: [...document.querySelectorAll('[role=status]')].map((e) => e.innerText.trim()).filter((t) => t && t.length < 40),
    placeholder: document.querySelector('main [role=textbox][aria-label="Prompt"]')?.getAttribute('aria-placeholder') ?? document.querySelector('main [role=textbox][aria-label="Prompt"] [data-placeholder]')?.getAttribute('data-placeholder') ?? null,
  };
});
const before = await look();
const t0 = Date.now();
await run(page, 'long-answer');
const seen = new Map(); // label -> first ms
const steps = [];
let pressed = null, state = null, lenAtPress = null;
const stopLabel = (l) => /stop|cancel|interrupt/i.test(l);
while (Date.now() - t0 < 60000) {
  await new Promise((ok) => setTimeout(ok, 150));
  const s = await look(), t = Date.now() - t0;
  for (const l of [...s.labels, ...s.status.map((x) => `status: ${x}`)]) if (!before.labels.includes(l) && !seen.has(l)) seen.set(l, t);
  const replying = s.last === 'assistant' && s.bubbles > before.bubbles + 1;
  if (!pressed && replying && s.lastLen > 150) {
    const stop = s.labels.find(stopLabel);
    state = await page.evaluate(collect);
    if (shotAt) writeFileSync(shotAt, Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    lenAtPress = s.lastLen;
    if (stop) {
      await page.evaluate((l) => [...document.querySelectorAll('main button')].find((b) => (b.getAttribute('aria-label') || b.innerText || '').trim().split('\n')[0].slice(0, 40) === l).click(), stop);
      pressed = { how: `button "${stop}"`, t };
    } else {
      for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
      pressed = { how: 'Escape (no Stop label on screen)', t };
    }
  }
  steps.push([t, s.bubbles, s.lastLen]);
  if (pressed && t - pressed.t > 12000) break;
}
const end = await look();
const grew = steps.filter(([t]) => pressed && t > pressed.t + 1500).map(([, , n]) => n);
const out = { ran: new Date().toISOString(), bot, oracle_version: await page.evaluate(() => navigator.userAgent.match(/GrokBot\/([\d.]+)/)?.[1] ?? null),
  new_labels: [...seen].map(([label, ms]) => ({ label, ms })), pressed, reply_chars_at_press: lenAtPress, reply_chars_at_end: end.lastLen,
  reply_kept_growing: grew.length > 1 && grew.at(-1) > grew[0], labels_at_end: end.labels.filter((l) => !before.labels.includes(l)), status_at_end: end.status };
mkdirSync(path('parity', 'oracle'), { recursive: true });
writeFileSync(path('parity', 'oracle', 'cancel.json'), JSON.stringify(out, null, 1) + '\n');
if (state) writeFileSync(path('fixtures', 'states', 'oracle-replying.json'), JSON.stringify({ id: 'oracle-replying', captured: new Date().toISOString().slice(0, 10), engine: 'electron', bot, ...state }) + '\n');
console.log(JSON.stringify(out));
page.close();
