// Print the oracle window's structure: boxes, roles and control labels.
// Conversation text is never printed, only its length (O2: numbers only).
// Usage: node scripts/oracle/outline.mjs [maxDepth]
import { connect } from './cdp.mjs';

const maxDepth = Number(process.argv[2] || 7);
const page = await connect();
const out = await page.evaluate((maxDepth) => {
  const vw = innerWidth, vh = innerHeight;
  const label = (el) => {
    const a = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder');
    if (a) return `"${a.slice(0, 40)}"`;
    const interactive = el.matches('button,a,[role=button],[role=tab],[role=menuitem],input,textarea,select,[contenteditable=true]');
    const t = (el.innerText || '').trim();
    if (!t) return '';
    if (interactive && t.length <= 30 && !t.includes('\n')) return `"${t}"`;
    return el.children.length ? '' : `text(${t.length})`;
  };
  const lines = [`viewport ${vw}x${vh} dpr ${devicePixelRatio}`];
  const walk = (el, d) => {
    if (d > maxDepth) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const role = el.getAttribute('role') || '';
    const tag = el.tagName.toLowerCase();
    const big = r.width * r.height > 2000 || el.matches('button,[role=button],[role=tab],input,textarea,[contenteditable=true]');
    if (big) lines.push(`${'  '.repeat(d)}${tag}${role ? `[${role}]` : ''} ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} ${label(el)}`.trimEnd());
    for (const c of el.children) walk(c, big ? d + 1 : d);
  };
  walk(document.body, 0);
  return lines.join('\n');
}, maxDepth);
console.log(out);
page.close();
