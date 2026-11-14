// Cards in the conversation, for Gate A: a row of the transcript that holds no bubble (a question
// card, a file card, picture tiles). Reads any collect.mjs output, the oracle's or ours, the same
// way. lib/controls.mjs leaves everything inside the conversation out, and lib/transcript.mjs
// scores bubbles only, so without this a card is never measured.
//
// A card is judged by what it paints: every part with a fill, a shadow, a border, an image, text
// or a press, in order, each by its kind (control:<name>, text:<label>, text(<length>), img, box).
// Wrappers that paint nothing are left out, so ours may nest differently. Each part: its box
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
    t.parts.forEach((p, j) => {
      const n = t.parts.slice(0, j + 1).filter((x) => x.kind === p.kind).length;
      const pk = `${key} ${p.kind}#${n}`;
      const q = m.parts.filter((x) => x.kind === p.kind)[n - 1];
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

/** The case keys alone, for a state the app has no scene for. */
export const cardKeys = (state) => cardCases(state, null).map((c) => c.key);

/**
 * A card as a gate scene holds it (scripts/transcript-scenes.mjs): UI facts only, conversation
 * text as lengths (O2). A question card: its question and choices (labels the card shows as
 * text); answered, the one choice left and its letter. A file card: the name its press opens
 * and the length of its size. Picture tiles: how many pictures the message carries.
 */
export function sceneCard({ parts }) {
  const texts = parts.filter((p) => p.kind.startsWith('text:')).map((p) => p.kind.slice(5));
  const pics = parts.filter((p) => p.kind === 'img').length;
  if (pics) {
    const rest = parts.map((p) => /^control:Open the remaining (\d+) images? full screen$/.exec(p.kind)?.[1]).find(Boolean);
    return { card: 'pictures', count: rest ? pics - 1 + Number(rest) : pics };
  }
  const file = parts.map((p) => /^control:Open (.+)$/.exec(p.kind)?.[1]).find(Boolean);
  if (file) return { card: 'file', name: file, size: parts.filter((p) => /^text\(\d+\)$/.test(p.kind)).map((p) => p.e.textLength).at(-1) ?? 0 };
  const [question, ...rest] = texts;
  // The rest come in pairs: a letter, then its label.
  const pairs = [];
  for (let i = 0; i + 1 < rest.length; i += 2) pairs.push({ letter: rest[i], label: rest[i + 1] });
  if (parts.some((p) => p.kind.startsWith('control:'))) return { card: 'question', question, choices: pairs.map((p) => p.label) };
  return { card: 'question', question, answered: pairs[0] };
}
