// Measure the hero's own strings in the oracle's bubble font: single-line
// width and where a 456-wide bubble wraps them. Numbers about OUR text only.
// Writes fixtures/text-metrics.json. Usage: node scripts/oracle/measure-text.mjs
import { writeFileSync } from 'node:fs';
import { connect } from './cdp.mjs';
import { path } from '../lib/data.mjs';
import * as copy from '../lib/hero-copy.mjs';

const page = await connect();
const strings = [...copy.BUBBLE_TEXT, ...copy.LABELS, copy.PLACEHOLDER, copy.TIME, copy.BOT];
const out = await page.evaluate((strings) => {
  const p = document.querySelector('[role=article][data-role] p');
  if (!p) return { error: 'no bubble paragraph on screen to copy the font from' };
  const cs = getComputedStyle(p);
  const FONT = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'lineHeight', 'letterSpacing', 'fontFeatureSettings', 'fontVariationSettings', 'fontKerning', 'textRendering'];
  const font = { family: cs.fontFamily.slice(0, 80), size: cs.fontSize, weight: cs.fontWeight, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing };
  const box = document.createElement('div');
  Object.assign(box.style, { position: 'fixed', left: '-5000px', top: '0', width: '456px' }, Object.fromEntries(FONT.map((k) => [k, cs[k]])));
  document.body.appendChild(box);
  // Control: the clone must measure a live paragraph exactly as the live one measures itself.
  const live = document.createRange(); live.selectNodeContents(p);
  box.style.whiteSpace = 'nowrap'; box.textContent = p.textContent;
  const cl = document.createRange(); cl.selectNodeContents(box);
  const control = { live: live.getBoundingClientRect().width, clone: cl.getBoundingClientRect().width };
  if (p.getClientRects().length === 1 && Math.abs(control.live - control.clone) > 0.5) return { error: `clone font is off: live ${control.live} vs clone ${control.clone}` };
  const res = {};
  for (const s of strings) {
    box.style.whiteSpace = 'nowrap'; box.textContent = s;
    const r = document.createRange(); r.selectNodeContents(box);
    const width = Math.round(r.getBoundingClientRect().width * 10) / 10;
    box.style.whiteSpace = 'normal';
    const node = box.firstChild, lines = [];
    let top = null, start = 0;
    for (let i = 0; i < s.length; i++) {
      const rr = document.createRange(); rr.setStart(node, i); rr.setEnd(node, i + 1);
      const t = Math.round(rr.getClientRects()[0]?.top ?? top);
      if (top !== null && t > top + 2) { lines.push(s.slice(start, i).trimEnd()); start = i; }
      top = t;
    }
    lines.push(s.slice(start).trimEnd());
    const lineWidths = lines.map((l) => { box.style.whiteSpace = 'nowrap'; box.textContent = l; const q = document.createRange(); q.selectNodeContents(box); return Math.round(q.getBoundingClientRect().width * 10) / 10; });
    res[s] = { width, lines, lineWidths };
  }
  box.remove();
  return { font, control: Math.round(Math.abs(control.live - control.clone) * 100) / 100, strings: res };
}, strings);
if (out.error) throw new Error(out.error);
writeFileSync(path('fixtures', 'text-metrics.json'), JSON.stringify({ measured: new Date().toISOString().slice(0, 10), wrapWidth: 456, ...out }, null, 1) + '\n');
console.log(`fixtures/text-metrics.json: ${Object.keys(out.strings).length} strings in ${out.font.size} ${out.font.weight}`);
for (const [s, m] of Object.entries(out.strings)) console.log(String(m.width).padStart(6), m.lines.length, s.slice(0, 50));
page.close();
