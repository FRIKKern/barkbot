// Capture one oracle state (H2): every visible element's box and look, to
// fixtures/states/<id>.json, plus a screenshot kept OUT of git (evidence).
// Conversation text is stored as a length; UI labels as text (O2).
// Usage: node scripts/oracle/capture.mjs <id> [--shot path.png]
import { writeFileSync, mkdirSync } from 'node:fs';
import { connect } from './cdp.mjs';
import { activeBot } from './recipes.mjs';
import { path } from '../lib/data.mjs';

const args = process.argv.slice(2);
const id = args[0];
if (!id) throw new Error('usage: capture.mjs <id> [--shot file.png]');
const shotAt = args.includes('--shot') ? args[args.indexOf('--shot') + 1] : null;

const page = await connect();
const bot = await activeBot(page);
const state = await page.evaluate(() => {
  const KEYS = ['background-color', 'background-image', 'color', 'opacity', 'border-top-width', 'border-top-color', 'border-radius',
    'font-size', 'font-weight', 'line-height', 'letter-spacing', 'box-shadow', 'text-transform'];
  const DEF = { 'background-color': 'rgba(0, 0, 0, 0)', 'background-image': 'none', opacity: '1', 'border-top-width': '0px', 'border-radius': '0px', 'box-shadow': 'none', 'text-transform': 'none', 'letter-spacing': 'normal' };
  const els = [];
  const all = document.body.querySelectorAll('*');
  const index = new Map();
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const style = {};
    for (const k of KEYS) { const v = cs.getPropertyValue(k); if (v && v !== DEF[k]) style[k] = v.length > 160 ? v.slice(0, 160) : v; }
    if (style['border-top-width'] === undefined) delete style['border-top-color'];
    const inBubble = !!el.closest('[role=article][data-role]');
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    const ctl = el.matches('button,[role=button],[role=tab],[role=combobox],h1,h2,h3,h4,label,time,[role=heading]');
    const sectionTitle = !inBubble && own && own.length <= 40 && !own.includes('\n');
    const e = {
      i: els.length, tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || undefined,
      label: el.getAttribute('aria-label')?.slice(0, 80) || undefined, dataRole: el.dataset.role || undefined,
      box: [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10),
      parent: undefined, style,
      text: (sectionTitle || (ctl && !inBubble && own.length <= 40)) && own ? own : undefined,
      textLength: own && !(sectionTitle || (ctl && !inBubble)) ? own.length : undefined,
    };
    if (el.tagName.toLowerCase() === 'svg') e.icon = true;
    index.set(el, e.i);
    let p = el.parentElement;
    while (p && !index.has(p)) p = p.parentElement;
    if (p) e.parent = index.get(p);
    els.push(e);
  }
  return { viewport: [innerWidth, innerHeight, devicePixelRatio], elements: els };
});
if (bot !== 'Oracle') console.error(`note: the open bot is "${bot}"; only Oracle states belong in fixtures`);
const out = { id, captured: new Date().toISOString().slice(0, 10), engine: 'electron', bot, ...state };
mkdirSync(path('fixtures', 'states'), { recursive: true });
writeFileSync(path('fixtures', 'states', `${id}.json`), JSON.stringify(out) + '\n');
if (shotAt) {
  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(shotAt, Buffer.from(shot.data, 'base64'));
}
console.log(`fixtures/states/${id}.json: ${state.elements.length} elements at ${state.viewport.join('x')}${shotAt ? `, screenshot ${shotAt}` : ''}`);
page.close();
