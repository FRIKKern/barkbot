// Cards in the conversation, for Gate A: a row of the transcript that holds no bubble (a question
// card, a file card, picture tiles). Reads any collect.mjs output, the oracle's or ours, the same
// way. lib/controls.mjs leaves everything inside the conversation out, and lib/transcript.mjs
// scores bubbles only, so without this a card is never measured.
//
// A card is judged by what it paints: every part with a fill, a shadow, a border, an image, text
// or a press, each by its kind (control:<name>, text:<label>, text(<length>), img, box). Wrappers
// that paint nothing are left out, so ours may nest differently. Each part of the oracle's pairs
// with one of ours of the same kind by overlap (best IoU first, one to one, IoU > 0), as box cases
// do, never by order: one part shifted or one too many reds only itself (the lead's ruling, the
// 103-miss sort: order pairing spread a 22 pt shift over ~20 cases a state). Each part: its box
// within 1 pt on every edge and the same look; and each card: the same parts, no more, no fewer.

const ancestors = (els, e) => { const out = []; let p = e.parent; while (p !== undefined) { out.push(els[p]); p = els[p].parent; } return out; };
// Letter-spacing is not judged, as in the rest of Gate A: the stand-in font (item F6) needs its own
// to meet the oracle's widths, and the width is judged through the box.
const KEYS = ['background-color', 'background-image', 'color', 'opacity', 'border-radius', 'border-top-width', 'border-top-color', 'box-shadow', 'font-size', 'font-weight', 'line-height'];
const DEFAULTS = { 'background-color': 'rgba(0, 0, 0, 0)', 'background-image': 'none', opacity: '1', 'border-radius': '0px', 'border-top-width': '0px', 'box-shadow': 'none' };
const CLEAR = /^(transparent|rgba\(.*, 0\))$/;
const TOL = 1; // pt

const isBubble = (e) => e.role === 'article' && e.style['border-radius'];
const isControl = (e) => e.tag === 'button' || e.role === 'button';
const paints = (e) => {
  const s = e.style;
  if (isControl(e) || e.text || e.textLength || e.tag === 'img') return true;
  if (s['background-color'] && !CLEAR.test(s['background-color'])) return true;
  if (s['background-image'] && s['background-image'] !== 'none') return true;
  if (s['box-shadow'] && s['box-shadow'] !== 'none') return true;
  return parseFloat(s['border-top-width'] || '0') > 0 && s['border-top-color'] && !CLEAR.test(s['border-top-color']);
};
// A control with no label of its own is named by the first text inside it (a choice: its letter).
const nameOf = (els, e) => e.label ?? e.text ?? els.find((x) => x.i > e.i && x.text && ancestors(els, x).includes(e))?.text ?? '?';
const kindOf = (els, e) => (isControl(e) ? `control:${nameOf(els, e)}` : e.text ? `text:${e.text}` : e.textLength ? `text(${e.textLength})` : e.tag === 'img' ? 'img' : 'box');

/** The cards on screen, top to bottom: [{row, parts: [{kind, e}]}]. */
export function cards(state) {
  const els = state.elements;
  const rows = els.filter((e) => e.role === 'article' && !ancestors(els, e).some((a) => a.role === 'article') && e.box[2] >= 2 && e.box[3] >= 2);
  return rows
    .filter((r) => !els.some((e) => isBubble(e) && ancestors(els, e).includes(r)))
    .map((row) => ({ row, parts: els.filter((e) => ancestors(els, e).includes(row) && e.box[2] >= 1 && e.box[3] >= 1 && paints(e)).map((e) => ({ kind: kindOf(els, e), e })) }))
    .filter((c) => c.parts.length);
}

/**
 * Gate A's card cases for one state. Cards pair from the bottom, as bubbles do (both sides are
 * pinned there). With ours = null every case is open (no scene yet).
 */
export function cardCases(state, ours) {
  const theirs = cards(state);
  const mine = ours ? cards(ours) : [];
  const cases = [];
  theirs.forEach((t, i) => {
    const key = `card#${i + 1}`;
    const m = mine[mine.length - (theirs.length - i)];
    const count = (c) => c.parts.reduce((n, p) => ({ ...n, [p.kind]: (n[p.kind] || 0) + 1 }), {});
    if (!m) {
      cases.push({ key: `${key} parts`, pass: false, why: 'missing' });
      t.parts.forEach((p, j) => cases.push({ key: `${key} ${p.kind}#${t.parts.slice(0, j + 1).filter((x) => x.kind === p.kind).length}`, pass: false, why: 'missing' }));
      return;
    }
    const a = count(t), b = count(m);
    const diff = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).map((k) => `${k} ${b[k] ?? 0} ≠ ${a[k] ?? 0}`);
    cases.push({ key: `${key} parts`, pass: !diff.length, why: diff.join('; ') || undefined });
    const got = pairParts(t.parts, m.parts);
    t.parts.forEach((p, j) => {
      const n = t.parts.slice(0, j + 1).filter((x) => x.kind === p.kind).length;
      const pk = `${key} ${p.kind}#${n}`;
      const q = got.get(j);
      if (!q) { cases.push({ key: pk, pass: false, why: 'missing' }); return; }
      const d = p.e.box.map((v, k) => Math.round((q.e.box[k] - v) * 10) / 10);
      const why = [];
      if ([d[0], d[1], d[0] + d[2], d[1] + d[3]].some((x) => Math.abs(x) > TOL)) why.push(`box off by ${d.join(',')}`);
      for (const k of KEYS) {
        const x = p.e.style[k] ?? DEFAULTS[k], y = q.e.style[k] ?? DEFAULTS[k];
        if (x !== y) why.push(`${k} ${y ?? '—'} ≠ ${x ?? '—'}`);
      }
      cases.push({ key: pk, pass: !why.length, why: why.join('; ') || undefined });
    });
  });
  return cases;
}

const iou = (a, b) => {
  const x = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const y = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const i = x * y;
  return i / (a[2] * a[3] + b[2] * b[3] - i);
};
/** Part j of theirs -> its part of ours: same kind, best overlap first, one to one, IoU > 0. */
function pairParts(theirs, mine) {
  const pairs = [];
  theirs.forEach((t, a) => mine.forEach((o, b) => { if (t.kind !== o.kind) return; const v = iou(t.e.box, o.e.box); if (v > 0) pairs.push([v, a, b]); }));
  pairs.sort((x, y) => y[0] - x[0] || x[1] - y[1] || x[2] - y[2]);
  const got = new Map(), used = new Set();
  for (const [, a, b] of pairs) if (!got.has(a) && !used.has(b)) { got.set(a, mine[b]); used.add(b); }
  return got;
}

/** The case keys alone, for a state the app has no scene for. */
export const cardKeys = (state) => cardCases(state, null).map((c) => c.key);

/**
 * A card as a gate scene holds it (scripts/transcript-scenes.mjs): UI facts only, conversation
 * text as lengths (O2). A question card: its question and choices (labels the card shows as
 * text); answered, the one choice left and its letter. A file card: each file the message
 * carries (1.2.3 stacks two: oracle-main-1600), by the name its press opens and the length of
 * its size (0 when the size is off screen).
 * Picture tiles: how many pictures the message carries. An answered card whose question is off
 * screen has question null.
 */
export function sceneCard({ parts }) {
  const texts = parts.filter((p) => p.kind.startsWith('text:')).map((p) => p.kind.slice(5));
  const pics = parts.filter((p) => p.kind === 'img').length;
  if (pics) {
    const rest = parts.map((p) => /^control:Open the remaining (\d+) images? full screen$/.exec(p.kind)?.[1]).find(Boolean);
    return { card: 'pictures', count: rest ? pics - 1 + Number(rest) : pics };
  }
  const opens = parts.flatMap((p, i) => (/^control:Open (.+)$/.test(p.kind) ? [i] : []));
  if (opens.length) return { card: 'file', files: opens.map((at, k) => sceneFile(parts.slice(at, opens[k + 1]))) };
  // The choices come last, in pairs: a letter, then its label. Counted from the end, so a card cut
  // off at the top keeps them: an answered card shows its question above its one choice, and with
  // the question off screen (oracle-pictures-sent, second take: section 71 from -46) only the
  // letter and the label, B and Cedar (rev292). The question is the text above the pairs, or null.
  const LETTER = /^[A-Z]$/;
  let at = texts.length;
  while (at >= 2 && LETTER.test(texts[at - 2]) && !LETTER.test(texts[at - 1])) at -= 2;
  const pairs = [];
  for (let i = at; i + 1 < texts.length; i += 2) pairs.push({ letter: texts[i], label: texts[i + 1] });
  const question = at > 0 ? texts[0] : null;
  if (parts.some((p) => p.kind.startsWith('control:'))) return { card: 'question', question, choices: pairs.map((p) => p.label) };
  return { card: 'question', question, answered: pairs.at(-1) ?? null };
}

// One file of a file card, from its press to the next: its name and the length of its size.
// The page mark is the same four lines on every file captured (11, 24, 24, 11), so it is not kept.
function sceneFile(parts) {
  const name = /^control:Open (.+)$/.exec(parts[0].kind)[1];
  return { name, size: parts.filter((p) => /^text\(\d+\)$/.test(p.kind)).map((p) => p.e.textLength).at(-1) ?? 0 };
}
