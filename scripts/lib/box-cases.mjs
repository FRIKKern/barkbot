// Gate A's box cases (task-9350f7d5eee2c573 step 2; rev299's FAIL on #328 and the lead's ruling):
// the oracle's boxes that PAINT and that no named case scores, each paired with ours by overlap.
// Works on any output of scripts/oracle/collect.mjs, the oracle's or ours.
//
// A box paints when the capture shows something drawn by the box itself: a background colour that
// is not clear, a background image, a top border that shows, a box-shadow, an img or an svg, or
// text of its own. The capture keeps only those (collect.mjs KEYS): a box drawn only by a side or
// bottom border, an outline, ::before/::after or a mask reads as paintless and is not scored. A
// paintless wrapper's box comes from what it holds, which the other cases score, so it is no case.
import { namedElements } from './controls.mjs';

const ancestors = (els, e) => { const out = []; let p = e.parent; while (p !== undefined) { out.push(els[p]); p = els[p].parent; } return out; };
const clear = (c) => !c || /^rgba\(.*,\s*0\)$/.test(c) || c === 'transparent';
export function paints(e) {
  const s = e.style || {};
  if (e.tag === 'img' || e.tag === 'svg') return true;
  if (!clear(s['background-color'])) return true;
  if (s['background-image'] && s['background-image'] !== 'none') return true;
  if (parseFloat(s['border-top-width'] || '0') > 0 && !clear(s['border-top-color'])) return true;
  if (s['box-shadow'] && s['box-shadow'] !== 'none') return true;
  return !!(e.text || e.textLength);
}
const sameBox = (a, b) => a.box.every((v, i) => Math.abs(v - b.box[i]) < 0.5);

/** The painted, unnamed boxes of 20x20 or more, outside the conversation (its articles, its log
 *  and the boxes that hold the log: transcript.mjs scores it) and not an svg's parts (the svg is
 *  the box). A box at the place of its named parent, or of a box already kept under the same
 *  element, is that box again. Each carries `where`: the nearest named element it is inside (its
 *  namedElements key, or the page), and a key from the oracle's order there, for the report only. */
export function boxElements(state) {
  const els = state.elements;
  const named = namedElements(state);
  const keyOf = new Map(named.map(({ key, e }) => [e.i, key]));
  const logs = els.filter((e) => e.role === 'log');
  const transcript = (e) => logs.some((l) => l === e || ancestors(els, e).includes(l) || ancestors(els, l).includes(e));
  const counts = new Map();
  const out = [];
  for (const e of els) {
    if (e.box[2] < 20 || e.box[3] < 20 || keyOf.has(e.i) || !paints(e)) continue;
    const up = ancestors(els, e);
    if (e.role === 'article' || up.some((a) => a.role === 'article' || a.tag === 'svg') || transcript(e)) continue;
    if (e.parent !== undefined && keyOf.has(e.parent) && sameBox(e, els[e.parent])) continue;
    const anchor = up.find((a) => keyOf.has(a.i));
    const where = anchor ? keyOf.get(anchor.i) : 'page';
    if (out.some((o) => o.where === where && sameBox(o.e, e))) continue;
    const base = `box:${where} › ${e.role || e.tag}`;
    const n = (counts.get(base) || 0) + 1;
    counts.set(base, n);
    out.push({ key: `${base}#${n}`, where, e });
  }
  return out;
}

const iou = (a, b) => {
  const x = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const y = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const i = x * y;
  return i / (a[2] * a[3] + b[2] * b[3] - i);
};

/** One case per box of theirs: paired inside its `where` with one box of ours, one to one, best
 *  overlap first (IoU; boxes that do not overlap never pair). It passes within `tol` on every
 *  edge; with no partner it fails as missing. A box of ours with no partner of theirs is no case
 *  and moves no other pairing. The look is not compared: a painted box's look is for a later step. */
export function boxCases(theirs, ours, tol = 1) {
  const mine = boxElements(ours);
  const want = boxElements(theirs);
  const pairs = [];
  for (const [a, t] of want.entries()) for (const [b, o] of mine.entries()) {
    if (t.where !== o.where) continue;
    const v = iou(t.e.box, o.e.box);
    if (v > 0) pairs.push([v, a, b]);
  }
  pairs.sort((x, y) => y[0] - x[0] || x[1] - y[1] || x[2] - y[2]);
  const got = new Map(), used = new Set();
  for (const [, a, b] of pairs) if (!got.has(a) && !used.has(b)) { got.set(a, mine[b]); used.add(b); }
  return want.map(({ key, e }, a) => {
    const m = got.get(a);
    if (!m) return { key, pass: false, why: 'missing' };
    const d = e.box.map((v, i) => Math.round((m.e.box[i] - v) * 10) / 10);
    return [d[0], d[1], d[0] + d[2], d[1] + d[3]].some((x) => Math.abs(x) > tol) ? { key, pass: false, why: `box off by ${d.join(',')}` } : { key, pass: true };
  });
}
