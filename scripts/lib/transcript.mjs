// The transcript's look, without its words (O2). Reads any collect.mjs output, the oracle's or
// ours, the same way: a bubble is an article with a corner radius; its paragraphs, bold runs and
// code spans are kept as boxes, looks and lengths. Gate A compares what does not depend on the
// words; scripts/transcript-scenes.mjs turns the lengths into our gate scenes' placeholder text.

const ancestors = (els, e) => { const out = []; let p = e.parent; while (p !== undefined) { out.push(els[p]); p = els[p].parent; } return out; };
const BUBBLE_KEYS = ['background-color', 'background-image', 'color', 'border-radius', 'font-size', 'font-weight', 'line-height', 'letter-spacing'];
const TEXT_KEYS = ['color', 'font-size', 'font-weight', 'line-height', 'letter-spacing'];
const CODE_KEYS = ['background-color', 'color', 'border-radius', 'font-size', 'font-weight', 'line-height'];
const DEFAULTS = { 'background-color': 'rgba(0, 0, 0, 0)', 'background-image': 'none', 'border-radius': '0px', 'letter-spacing': 'normal' };
const TOL = 1; // pt

export function bubbles(state) {
  const els = state.elements;
  const isBubble = (e) => e.role === 'article' && e.style['border-radius'];
  return els.filter(isBubble).map((b) => {
    const inside = els.filter((e) => ancestors(els, e).includes(b));
    // The row: the outermost article around the bubble, as wide as the column.
    const row = ancestors(els, b).filter((a) => a.role === 'article').at(-1) ?? b;
    const [x, y, w, h] = b.box;
    const own = Math.abs(x + w - (row.box[0] + row.box[2])) <= TOL && x - row.box[0] > TOL;
    const paras = inside.filter((e) => e.tag === 'p');
    const marks = inside.filter((e) => e.tag === 'strong' || e.tag === 'code');
    return { b, role: own ? 'user' : 'assistant', box: b.box, paras, marks: marks.sort((m, n) => m.box[1] - n.box[1] || m.box[0] - n.box[0]), y, bottom: y + h };
  });
}

// A paragraph's length is its own text plus its bold runs and code spans.
const paraLength = (els, p) => (p.textLength ?? 0) + els.filter((e) => e.parent === p.i && (e.tag === 'strong' || e.tag === 'code')).reduce((n, e) => n + (e.textLength ?? 0), 0);

/** A transcript as lengths, for a gate scene: [{role, paras: [{len, height, marks: [{tag, len}]}]}]. */
export function transcriptOf(state) {
  const els = state.elements;
  return bubbles(state).map(({ role, paras }) => ({
    role,
    paras: paras.map((p) => {
      const marks = els.filter((e) => e.parent === p.i && (e.tag === 'strong' || e.tag === 'code')).sort((m, n) => m.box[1] - n.box[1] || m.box[0] - n.box[0]);
      // Its height too: placeholder words wrap differently from the real ones, and a bubble's
      // height decides where every bubble above it sits (the transcript is pinned at its end).
      return { len: paraLength(els, p), height: p.box[3], ...(marks.length ? { marks: marks.map((m) => ({ tag: m.tag, len: m.textLength ?? 0 })) } : {}) };
    }),
  }));
}

const styleDiff = (keys, a, b, what) => keys.flatMap((k) => {
  const x = a.style[k] ?? DEFAULTS[k], y = b.style[k] ?? DEFAULTS[k];
  return x === y ? [] : [`${what}${k} ${y ?? '—'} ≠ ${x ?? '—'}`];
});
const off = (what, ours, theirs) => (Math.abs(ours - theirs) > TOL ? [`${what} off by ${Math.round((ours - theirs) * 10) / 10}`] : []);
const lineHeight = (p) => parseFloat(p.style['line-height']) || 22;

/**
 * Gate A's transcript cases for one state. Bubbles pair from the bottom (both sides are pinned
 * there); a transcript that starts at the top (its time row is on screen) also pairs the first
 * bubble's top. With ours = null every case is open (no scene yet).
 */
export function transcriptCases(state, ours) {
  const theirs = bubbles(state);
  const mine = ours ? bubbles(ours) : [];
  const atTop = state.elements.some((e) => e.tag === 'time');
  const cases = [];
  const n = { user: 0, assistant: 0, strong: 0, code: 0 };
  theirs.forEach((t, i) => {
    const k = ++n[t.role];
    const key = `bubble:${t.role}#${k}`;
    const m = mine[mine.length - (theirs.length - i)];
    if (!m) {
      cases.push({ key: `${key} look`, pass: false, why: 'missing' }, { key: `${key} place`, pass: false, why: 'missing' });
      for (const tm of t.marks) cases.push({ key: `${tm.tag}#${++n[tm.tag]}`, pass: false, why: 'missing' });
      return;
    }
    // Look: the bubble's own style, its paragraphs' type, and how far in the text sits.
    const look = [];
    if (m.role !== t.role) look.push(`ours is ${m.role === 'user' ? 'own' : "the bot's"}`);
    look.push(...styleDiff(BUBBLE_KEYS, t.b, m.b, ''));
    if (t.paras[0] && m.paras[0]) {
      look.push(...styleDiff(TEXT_KEYS, t.paras[0], m.paras[0], 'text '));
      look.push(...off('inset left', m.paras[0].box[0] - m.box[0], t.paras[0].box[0] - t.box[0]));
      if (t.y >= 0) look.push(...off('inset top', m.paras[0].box[1] - m.box[1], t.paras[0].box[1] - t.box[1]));
    } else if (t.paras.length !== m.paras.length) look.push(`${m.paras.length} paragraphs, oracle ${t.paras.length}`);
    for (let j = 1; j < Math.min(t.paras.length, m.paras.length); j++) {
      const gap = (s, p) => s.paras[p].box[1] - (s.paras[p - 1].box[1] + s.paras[p - 1].box[3]);
      look.push(...off(`paragraph ${j + 1} gap`, gap(m, j), gap(t, j)));
    }
    cases.push({ key: `${key} look`, pass: !look.length, why: look.join('; ') || undefined });
    // Place: the anchored edge (own: right, bot: left), the gap above, the width when the text
    // fills it (more than one line), and the last bubble's bottom (or the first's top).
    const place = [];
    const [tx, , tw] = t.box, [mx, , mw] = m.box;
    if (t.role === 'user') place.push(...off('right edge', mx + mw, tx + tw)); else place.push(...off('left edge', mx, tx));
    const tp = theirs[i - 1], mp = mine[mine.length - (theirs.length - i) - 1];
    if (tp && mp) place.push(...off('gap above', m.y - mp.bottom, t.y - tp.bottom));
    const wraps = t.paras.length > 1 || t.paras.some((p) => p.box[3] > lineHeight(p) + TOL);
    if (wraps) place.push(...off('width (filled)', mw, tw));
    if (i === theirs.length - 1) place.push(...off('bottom', m.bottom, t.bottom));
    if (i === 0 && atTop) place.push(...off('top', m.y, t.y));
    cases.push({ key: `${key} place`, pass: !place.length, why: place.join('; ') || undefined });
    // Marks: a bold run's weight; a code span's look and height (and width: it is monospace).
    t.marks.forEach((tm) => {
      const mk = `${tm.tag}#${++n[tm.tag]}`;
      const mm = m.marks.filter((x) => x.tag === tm.tag)[t.marks.filter((x) => x.tag === tm.tag).indexOf(tm)];
      if (!mm) { cases.push({ key: mk, pass: false, why: 'missing' }); return; }
      const why = tm.tag === 'strong' ? styleDiff(['font-weight'], tm, mm, '') : [...styleDiff(CODE_KEYS, tm, mm, ''), ...off('height', mm.box[3], tm.box[3]), ...off('width', mm.box[2], tm.box[2])];
      cases.push({ key: mk, pass: !why.length, why: why.join('; ') || undefined });
    });
  });
  return cases;
}

/** The case keys alone, for a state the app has no scene for. */
export const transcriptKeys = (state) => transcriptCases(state, null).map((c) => c.key);
