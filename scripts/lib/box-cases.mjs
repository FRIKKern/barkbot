// Gate A's box cases (task-9350f7d5eee2c573 step 2; rev299's FAIL on #328 and the lead's ruling):
// the oracle's boxes that PAINT and that no named case scores, each paired with ours by overlap.
// Works on any output of scripts/oracle/collect.mjs, the oracle's or ours.
//
// A box paints when the capture shows something drawn by the box itself: a background colour that
// is not clear, a background image, a top border that shows, a box-shadow, an img or an svg, or
// text of its own. The capture keeps only those (collect.mjs KEYS): a box drawn only by a side or
// bottom border, an outline, ::before/::after or a mask reads as paintless and is not scored. A
// paintless wrapper's box comes from what it holds, which the other cases score, so it is no case.
// A fill or top border paints only when it shows: laid over what is behind it, it changes the
// pixel by at least 4/255 in some channel (the lead's ruling on #328 round 3, a perception floor,
// not a number from any capture). A 0.06 white hairline on rgb(18,18,18) moves it 14 and paints; a
// 0.01 fill, or an opaque one the colour already behind it, moves it 0 or 2 and does not.
import { namedElements } from './controls.mjs';

const ancestors = (els, e) => { const out = []; let p = e.parent; while (p !== undefined) { out.push(els[p]); p = els[p].parent; } return out; };
// [r, g, b, a] of a computed colour; null for a form this does not read (it then counts as paint).
const rgba = (c) => {
  if (!c || c === 'transparent') return [0, 0, 0, 0];
  const m = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(c);
  return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
};
const over = (c, b) => [0, 1, 2].map((i) => c[3] * c[i] + (1 - c[3]) * b[i]);
const shows = (c, b) => { const x = rgba(c); return !x || over(x, b).some((v, i) => Math.abs(v - b[i]) >= 4); };
// What is behind a box: its ancestors' backgrounds laid one over another, on the page's background
// (the capture's `page`: body's, else html's; a box with neither is "behind unknown", see paints).
// An unreadable colour is taken as opaque grey: it still lets the box paint.
const behind = (els, e, page) => {
  const up = []; let p = e.parent;
  while (p !== undefined) { up.push(els[p]); p = els[p].parent; }
  const canvas = rgba(page) ? over(rgba(page), [255, 255, 255]) : [255, 255, 255];
  return up.reverse().reduce((b, a) => { const x = rgba(a.style?.['background-color']); return x ? over(x, b) : [128, 128, 128]; }, canvas);
};
// True, false, or null for "behind unknown": the box would paint only by a fill or top border, no
// ancestor has an opaque background, and the capture has no page background (the oracle's captures
// predate `page`). What such a box is laid over is not in the capture, so it is not judged: no
// colour is guessed (the lead's ruling on #328 round 3).
export function paints(e, els = [], page) {
  const s = e.style || {};
  if (e.tag === 'img' || e.tag === 'svg') return true;
  if (s['background-image'] && s['background-image'] !== 'none') return true;
  if (s['box-shadow'] && s['box-shadow'] !== 'none') return true;
  if (e.text || e.textLength) return true;
  const fill = rgba(s['background-color']);
  const line = parseFloat(s['border-top-width'] || '0') > 0 ? rgba(s['border-top-color']) : [0, 0, 0, 0];
  if ((!fill || fill[3] > 0 || !line || line[3] > 0) && !page && !ancestors(els, e).some((a) => rgba(a.style?.['background-color'])?.[3] === 1)) return null;
  const back = behind(els, e, page);
  if (shows(s['background-color'], back)) return true;
  // The top border is drawn over the box's own background.
  return parseFloat(s['border-top-width'] || '0') > 0 && shows(s['border-top-color'], fill ? over(fill, back) : back);
}
const sameBox = (a, b) => a.box.every((v, i) => Math.abs(v - b.box[i]) < 0.5);

/** The painted, unnamed boxes of 20x20 or more, outside the conversation (its articles, its log
 *  and the boxes that hold the log: transcript.mjs scores it) and not an svg's parts (the svg is
 *  the box). A box at the place of its named parent, or of a box already kept, is that box again.
 *  Each carries `where`: the nearest named element it is inside (its namedElements key, or the
 *  page), and a key from the oracle's order there, for the report only: pairing never reads them. */
export function boxElements(state) {
  const els = state.elements;
  const named = namedElements(state);
  const keyOf = new Map(named.map(({ key, e }) => [e.i, key]));
  const logs = els.filter((e) => e.role === 'log');
  const transcript = (e) => logs.some((l) => l === e || ancestors(els, e).includes(l) || ancestors(els, l).includes(e));
  const counts = new Map();
  const out = [];
  for (const e of els) {
    // Scored by another case already: a named one (box and look), the transcript's time row.
    if (e.box[2] < 20 || e.box[3] < 20 || keyOf.has(e.i) || e.tag === 'time') continue;
    const paint = paints(e, els, state.page);
    if (paint === false) continue;
    const up = ancestors(els, e);
    if (e.role === 'article' || up.some((a) => a.role === 'article' || a.tag === 'svg') || transcript(e)) continue;
    if (e.parent !== undefined && keyOf.has(e.parent) && sameBox(e, els[e.parent])) continue;
    const anchor = up.find((a) => keyOf.has(a.i));
    const where = anchor ? keyOf.get(anchor.i) : 'page';
    if (out.some((o) => sameBox(o.e, e))) continue;
    const base = `box:${where} › ${e.role || e.tag}`;
    const n = (counts.get(base) || 0) + 1;
    counts.set(base, n);
    out.push({ key: `${base}#${n}`, where, e, ...(paint === null && { unknown: true }) });
  }
  return out;
}

const iou = (a, b) => {
  const x = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const y = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const i = x * y;
  return i / (a[2] * a[3] + b[2] * b[3] - i);
};

/** One case per box of theirs: paired with one box of ours anywhere on the page, one to one, best
 *  overlap first. No anchor scope: which named element holds a box is DOM nesting, not where it is
 *  drawn (rev299's round 2 on #328: our labelled <main> held a header and composer pixel-identical
 *  to the oracle's and red them twice). The floor is any overlap at all (IoU > 0): two boxes that share no point are not
 *  the same box. A pair passes within `tol` on every edge. A box of theirs with no partner fails as
 *  missing, and a painted box of ours with none fails as extra (it is drawn where the oracle draws
 *  nothing), so either reds only itself and moves no other pairing. The look is not compared: a
 *  painted box's look is for a later step. */
export function boxCases(theirs, ours, tol = 1) {
  const mine = boxElements(ours);
  const want = boxElements(theirs);
  const pairs = [];
  for (const [a, t] of want.entries()) for (const [b, o] of mine.entries()) {
    const v = iou(t.e.box, o.e.box);
    if (v > 0) pairs.push([v, a, b]);
  }
  pairs.sort((x, y) => y[0] - x[0] || x[1] - y[1] || x[2] - y[2]);
  const got = new Map(), used = new Set();
  for (const [, a, b] of pairs) if (!got.has(a) && !used.has(b)) { got.set(a, mine[b]); used.add(b); }
  // A box of theirs whose paint is unknown pairs like any other, so the box of ours it takes is no
  // extra, but neither side is a case: it is counted in the unscored report instead.
  const cases = want.flatMap(({ key, e, unknown }, a) => (unknown ? [] : [[{ key, e }, a]])).map(([{ key, e }, a]) => {
    const m = got.get(a);
    if (!m) return { key, pass: false, why: 'missing' };
    const d = e.box.map((v, i) => Math.round((m.e.box[i] - v) * 10) / 10);
    // An svg by its centre only, never its size: an svg's box is its viewBox, padding and all, and
    // the capture cannot see where its ink is (the lead's ruling on #328, family 2).
    if (e.tag === 'svg' || m.e.tag === 'svg') {
      const c = [d[0] + d[2] / 2, d[1] + d[3] / 2].map((x) => Math.round(x * 10) / 10);
      return c.some((x) => Math.abs(x) > tol) ? { key, pass: false, why: `svg centre off by ${c.join(',')}` } : { key, pass: true };
    }
    return [d[0], d[1], d[0] + d[2], d[1] + d[3]].some((x) => Math.abs(x) > tol) ? { key, pass: false, why: `box off by ${d.join(',')}` } : { key, pass: true };
  });
  for (const [b, o] of mine.entries()) if (!used.has(b)) cases.push({ key: `box:extra › ${o.e.role || o.e.tag}@${o.e.box.map(Math.round).join(',')}`, pass: false, why: 'extra: the oracle draws no box here' });
  return cases;
}
