// Gate A's box cases (task-9350f7d5eee2c573 step 2; rev299's FAIL on #328 and the lead's ruling):
// the oracle's boxes that PAINT and that no named case scores, each paired with ours by overlap.
// Works on any output of scripts/oracle/collect.mjs, the oracle's or ours.
//
// A box paints when the capture shows something drawn by the box itself: a background colour that
// is not clear, a background image, a top border that shows, a box-shadow, an img or an svg, or
// text of its own. The capture keeps only those (collect.mjs KEYS): a box drawn only by a side or
// bottom border, an outline, ::before/::after or a mask reads as paintless and is not scored. A
// paintless wrapper's box comes from what it holds, which the other cases score, so it is no case.
// A fill, top border, gradient, shadow or text paints only when it shows, at the box's opacity
// (its own times its ancestors', collect.mjs `alpha`; task-ebfec4c81747864d): laid over what is
// behind it, it changes the pixel by at least 4/255 in some channel (the lead's ruling on #328 round 3, a perception floor,
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
// A text-less <i> is an icon glyph: the oracle draws its icons so, by a font or a pseudo-element the
// capture cannot see. On the oracle's side only, it paints like an svg and is scored like one, by
// its centre (the lead's ruling on the 103-miss sort, family 2). On ours an empty <i> is what a
// broken icon font looks like, so it paints only as any box does (rev299's round 1 on #330).
const glyph = (e) => e.tag === 'i' && !e.text && !e.textLength;
const icon = (e) => e.tag === 'svg' || glyph(e);
// True, 'line' when only its top border paints (it is scored as that line), false, or null for
// "behind unknown": the box would paint only by a fill or top border, no
// ancestor has an opaque background, and the capture has no page background (the oracle's captures
// predate `page`). What such a box is laid over is not in the capture, so it is not judged: no
// colour is guessed (the lead's ruling on #328 round 3).
// An svg paints only when it holds a drawn part the capture kept (a path, shape, use, text or image
// of 1x1 or more): an empty svg is what a broken icon looks like (the lead's cut on #328 round 3).
// The capture keeps no fill or stroke, so a part drawn with none still counts: a known blind spot.
const DRAWN = new Set(['path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon', 'use', 'text', 'image']);
const drawsInside = (els, e) => els.some((x) => DRAWN.has(x.tag) && ancestors(els, x).includes(e));
// How see-through a box is as drawn: its own opacity times every ancestor's (collect.mjs `alpha`,
// left out when 1). A capture from before `alpha` (the oracle's 1.2.3) has none: 1, never a guess.
const alphaOf = (e) => (typeof e.alpha === 'number' ? e.alpha : 1);
// A colour drawn at the box's opacity `k` shows over `b`: it moves the pixel by 4/255 or more in
// some channel (the fills' perception floor). With `b` unknown (null) only the most it could move
// is known, its alpha times 255, so only a colour too clear to move any pixel is ruled out. An
// unreadable colour counts as paint.
const showsAt = (c, b, k) => {
  const x = rgba(c);
  if (!x) return true;
  const y = [x[0], x[1], x[2], x[3] * k];
  return b ? over(y, b).some((v, i) => Math.abs(v - b[i]) >= 4) : y[3] * 255 >= 4;
};
// Whether a gradient's stops or a shadow list's colours show: any one is enough. Every colour
// function is taken, not only rgb(a): Chrome writes a space-syntax rgb with alpha inside a gradient
// as color(srgb ...), and one this cannot read counts as showing (showsAt; rev299's round 1 on #337).
// A value past the capture's 160-character cut, or with no colour at all, is judged by the opacity alone.
const anyShows = (v, b, k) => {
  const cs = v.length < 160 ? v.match(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)/g) : null;
  return cs ? cs.some((c) => showsAt(c, b, k)) : k * 255 >= 4;
};
// Whether what is behind a box is in the capture: its ancestors' backgrounds on the page's. A sticky
// or fixed box (collect.mjs `position`) is drawn over whatever scrolls under it, which is no ancestor,
// so behind it is unknown, and so for a box inside one unless an opaque fill comes first on the way
// up (task-f7fdf44d2aa63bf3). With no `position` (the oracle's 1.2.3 captures) nothing is pinned.
const pinned = (e) => e.position === 'sticky' || e.position === 'fixed';
const opaque = (e) => rgba(e.style?.['background-color'])?.[3] === 1;
const knownBehind = (els, e, page) => {
  if (pinned(e)) return false;
  for (const a of ancestors(els, e)) { if (opaque(a)) return true; if (pinned(a)) return false; }
  return !!page;
};
export function paints(e, els = [], page, oracle = false) {
  const s = e.style || {};
  const k = alphaOf(e);
  // A box drawn at an opacity that cannot move a pixel by 4/255 draws nothing, whatever it holds.
  if (k * 255 < 4) return false;
  // An img, a glyph or a drawn svg: their own colours are not in the capture.
  if (e.tag === 'img' || (oracle && glyph(e))) return true;
  if (e.tag === 'svg') return drawsInside(els, e);
  const known = knownBehind(els, e, page);
  const back = known ? behind(els, e, page) : null;
  const fill = rgba(s['background-color']);
  // A gradient (by its stops), a shadow (by its colours) and text (its colour over the box's own
  // fill) paint only when they show, as a fill does. A url() image is a picture: it paints.
  const bgi = s['background-image'];
  if (bgi && bgi !== 'none' && (/gradient\(/.test(bgi) ? anyShows(bgi, back, k) : true)) return true;
  if (s['box-shadow'] && s['box-shadow'] !== 'none' && anyShows(s['box-shadow'], back, k)) return true;
  if ((e.text || e.textLength) && (s.color ? showsAt(s.color, back && fill ? over(fill, back) : back, k) : true)) return true;
  const line = parseFloat(s['border-top-width'] || '0') > 0 ? rgba(s['border-top-color']) : [0, 0, 0, 0];
  // Nothing else to show and nothing behind it known: a clear fill and border are no paint.
  if (!known) return !fill || fill[3] > 0 || !line || line[3] > 0 ? null : false;
  if (showsAt(s['background-color'], back, k)) return true;
  // The top border is drawn over the box's own background.
  return parseFloat(s['border-top-width'] || '0') > 0 && showsAt(s['border-top-color'], fill ? over(fill, back) : back, k) ? 'line' : false;
}
const sameBox = (a, b) => a.box.every((v, i) => Math.abs(v - b.box[i]) < 0.5);

/** The painted, unnamed boxes of 20x20 or more, outside the conversation (its articles, its log
 *  and the boxes that hold the log: transcript.mjs scores it) and not an svg's parts (the svg is
 *  the box). A box at the place of its named parent, or of a box already kept, is that box again.
 *  Each carries `where`: the nearest named element it is inside (its namedElements key, or the
 *  page), and a key from the oracle's order there, for the report only: pairing never reads them.
 *  `oracle`: the state is the oracle's (a text-less <i> paints there only). */
export function boxElements(state, { oracle = false } = {}) {
  const els = state.elements;
  const named = namedElements(state);
  const keyOf = new Map(named.map(({ key, e }) => [e.i, key]));
  const logs = els.filter((e) => e.role === 'log');
  const transcript = (e) => logs.some((l) => l === e || ancestors(els, e).includes(l) || ancestors(els, l).includes(e));
  const counts = new Map();
  const out = [];
  for (const e of els) {
    // Scored by another case already: a named one (box and look), the transcript's time row.
    if (e.box[2] < 20 || keyOf.has(e.i) || e.tag === 'time') continue;
    const paint = paints(e, els, state.page, oracle);
    // A line is as tall as its border, so only its length must reach 20.
    if (paint === false || (e.box[3] < 20 && paint !== 'line')) continue;
    const up = ancestors(els, e);
    if (e.role === 'article' || up.some((a) => a.role === 'article' || a.tag === 'svg') || transcript(e)) continue;
    if (e.parent !== undefined && keyOf.has(e.parent) && sameBox(e, els[e.parent])) continue;
    const anchor = up.find((a) => keyOf.has(a.i));
    const where = anchor ? keyOf.get(anchor.i) : 'page';
    if (out.some((o) => sameBox(o.e, e))) continue;
    const base = `box:${where} › ${e.role || e.tag}`;
    const n = (counts.get(base) || 0) + 1;
    counts.set(base, n);
    out.push({ key: `${base}#${n}`, where, e, ...(paint === null && { unknown: true }), ...(paint === 'line' && { line: true }) });
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
// A line pairs by its top edge alone: the strip its border draws, never the box under it (the lead's
// ruling on the 103-miss sort, family 5). It is judged by that edge only when both sides are lines:
// a line paired with a fill is judged by the boxes, so a missing rule or a missing fill reds by the
// height (rev299's round 1 on #330).
const drawn = (b) => (b.line ? [b.e.box[0], b.e.box[1], b.e.box[2], Math.max(1, parseFloat(b.e.style['border-top-width']))] : b.e.box);
export function boxCases(theirs, ours, tol = 1) {
  const mine = boxElements(ours);
  const want = boxElements(theirs, { oracle: true });
  const pairs = [];
  for (const [a, t] of want.entries()) for (const [b, o] of mine.entries()) {
    const v = iou(drawn(t), drawn(o));
    if (v > 0) pairs.push([v, a, b]);
  }
  pairs.sort((x, y) => y[0] - x[0] || x[1] - y[1] || x[2] - y[2]);
  const got = new Map(), used = new Set();
  for (const [, a, b] of pairs) if (!got.has(a) && !used.has(b)) { got.set(a, mine[b]); used.add(b); }
  // A box of theirs whose paint is unknown pairs like any other, so the box of ours it takes is no
  // extra, but neither side is a case: it is counted in the unscored report instead.
  const cases = want.flatMap((t, a) => (t.unknown ? [] : [[t, a]])).map(([t, a]) => {
    const { key, e } = t;
    const m = got.get(a);
    if (!m) return { key, pass: false, why: 'missing' };
    const d = e.box.map((v, i) => Math.round((m.e.box[i] - v) * 10) / 10);
    if (t.line && m.line) {
      const l = [d[0], d[1], d[0] + d[2]].map((x) => Math.round(x * 10) / 10);
      return l.some((x) => Math.abs(x) > tol) ? { key, pass: false, why: `line off by ${l.join(',')}` } : { key, pass: true };
    }
    // The oracle's svg or icon glyph by its centre only, never its size: its box is its viewBox (or
    // glyph box), padding and all, and the capture cannot see where its ink is (the lead's ruling on
    // #328, family 2). Only when the oracle's box is the icon: a box of the oracle's with a known size
    // is judged by its box, whatever ours is (the lead's cut on #328 round 3: our 36 svg glyph greened
    // Grok's 46 selected tile).
    if (icon(e)) {
      const c = [d[0] + d[2] / 2, d[1] + d[3] / 2].map((x) => Math.round(x * 10) / 10);
      return c.some((x) => Math.abs(x) > tol) ? { key, pass: false, why: `${e.tag} centre off by ${c.join(",")}` } : { key, pass: true };
    }
    return [d[0], d[1], d[0] + d[2], d[1] + d[3]].some((x) => Math.abs(x) > tol) ? { key, pass: false, why: `box off by ${d.join(',')}` } : { key, pass: true };
  });
  for (const [b, o] of mine.entries()) if (!used.has(b)) cases.push({ key: `box:extra › ${o.e.role || o.e.tag}@${o.e.box.map(Math.round).join(',')}`, pass: false, why: 'extra: the oracle draws no box here' });
  return cases;
}
