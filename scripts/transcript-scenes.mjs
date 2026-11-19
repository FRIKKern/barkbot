// Writes app/src/gate/transcripts.ts: the conversations on screen in the captured oracle states,
// as lengths only (O2), for the gate scenes to render with placeholder words.
//   node scripts/transcript-scenes.mjs          write it
//   node scripts/transcript-scenes.mjs --check  exit 1 if it is stale
// main: the conversation behind most states (1.2.3: a message carrying files, then the long
// answer), as oracle-turn-1040 shows it (the window as it rests). A state that shows only that
// conversation's messages but at another width or scrolled elsewhere gets its own entry: the same
// rows with the paragraph heights captured at its column's width, and its lift. A state that shows
// a message main does not have (the states made by sends: oracle-file-sent, ...) has a conversation
// of its own, as captured, its cards in place; so does each state with a version exception.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { path } from './lib/data.mjs';
import { transcriptOf, bubbles } from './lib/transcript.mjs';
import { cards, sceneCard } from './lib/cards.mjs';
import { EXCEPTIONS } from './lib/versions.mjs';

const BASE = 'oracle-turn-1040';
const state = (id) => JSON.parse(readFileSync(path('fixtures', 'states', `${id}.json`), 'utf8'));
const short = (id) => id.replace(/^oracle-/, '');
// A bubble's top corner on its own side closes to 6 when the bubble above is the same speaker's.
const corners = (r = '0px') => { const v = r.split(' '); return [v[0], v[1] ?? v[0], v[2] ?? v[0], v[3] ?? v[1] ?? v[0]]; };
const joinedAbove = (b) => corners(b.b.style['border-radius'])[b.role === 'user' ? 1 : 0] === '6px';
// Bubbles and cards, top to bottom. When the first bubble on screen is joined to one scrolled out
// of sight above it (oracle-file-waiting), a short bubble of the same speaker stands in for that one.
// A bubble's row: the outermost article around it. Its overlap: how far the next row starts inside
// it (the oracle's list places a row by an estimate: oracle-main-720's two-line message, 62 tall,
// has the answer's row 40 below its top).
const ancestorsOf = (els, e) => { const out = []; let p = e.parent; while (p !== undefined) { out.push(els[p]); p = els[p].parent; } return out; };
const rowOf = (s, b) => ancestorsOf(s.elements, b.b).filter((a) => a.role === 'article').at(-1) ?? b.b;
const overlapOf = (s, b) => {
  const r = rowOf(s, b), next = s.elements.filter((e) => e.role === 'article' && e.parent === r.parent && e.box[1] > r.box[1]).sort((m, n) => m.box[1] - n.box[1])[0];
  const o = next ? Math.round((r.box[1] + r.box[3] - next.box[1]) * 10) / 10 : 0;
  return o > 0.5 ? o : 0;
};
const rows = (s) => {
  const bs = bubbles(s);
  const b = transcriptOf(s).map((x, i) => ({ y: bs[i].y, x: overlapOf(s, bs[i]) ? { ...x, overlap: overlapOf(s, bs[i]) } : x }));
  const c = cards(s).map((x) => ({ y: x.row.box[1], x: sceneCard(x) }));
  const out = [...b, ...c].sort((m, n) => m.y - n.y).map((r) => r.x);
  const first = [...bs].sort((m, n) => m.y - n.y)[0];
  return first && joinedAbove(first) && out[0] === b.find((r) => r.y === first.y)?.x ? [{ role: first.role, paras: [{ len: 16, height: 22 }] }, ...out] : out;
};

// The transcript's content: the log's scroller holds it. Its rows are articles; the oracle's end
// is the block after the last one (div 111 in oracle-turn-1040: 648, 112 tall).
const content = (s) => {
  const els = s.elements;
  const log = els.find((e) => e.role === 'log');
  const inner = log && els.find((e) => e.parent === log.i);
  return inner && els.find((e) => e.parent === inner.i);
};
// The lift: how far the last row ends above that end (+) or below it (-, scrolled up). The
// oracle keeps its scroll offset when the window is resized, so a width capture is not always
// pinned (oracle-main-1280: 66 above; oracle-main-720: 374 below, off screen).
const liftOf = (s) => {
  const c = content(s);
  const kids = c ? s.elements.filter((e) => e.parent === c.i) : [];
  const last = kids.filter((k) => k.role === 'article').at(-1), end = kids.filter((k) => k.role !== 'article').at(-1);
  return last && end ? Math.round((end.box[1] - (last.box[1] + last.box[3])) * 10) / 10 : 0;
};

// Every state with a conversation on screen, and what it shows.
const except = new Set(EXCEPTIONS.map((x) => x.id));
const all = readdirSync(path('fixtures', 'states')).filter((f) => f.endsWith('.json')).map((f) => state(f.slice(0, -5))).filter((s) => content(s)).map((s) => ({ id: s.id, width: content(s).box[2], rows: rows(s), lift: liftOf(s) }));
const base = all.find((s) => s.id === BASE);
// Main's messages: each bubble on screen is one of the base's, by speaker and paragraph lengths
// (a bubble whose paragraphs are all off screen matches any of its speaker's).
const baseBubbles = base.rows.filter((r) => !r.card);
const inMain = (s) => !except.has(s.id) && s.rows.filter((r) => !r.card).every((b) => baseBubbles.some((m) => m.role === b.role && b.paras.every((p) => m.paras.some((q) => q.len === p.len))));
const shown = all.filter(inMain), own = all.filter((s) => !inMain(s));

// One conversation: the base's rows, each file card holding every file any state shows of it
// (by name), each paragraph its height at the column's width when some state of that width shows it
// (else none: the placeholder words wrap as they will, off screen in every capture).
// A file's size is read where it is on screen (oracle-main-1000 shows only the top of one).
const seen = shown.flatMap((s) => s.rows.flatMap((r) => (r.card === 'file' ? r.files : [])));
const files = [...new Set(seen.map((f) => f.name))].sort().map((name) => ({ name, size: Math.max(...seen.filter((f) => f.name === name).map((f) => f.size)) }));
const at = (width) => {
  const same = shown.filter((s) => s.width === width).flatMap((s) => s.rows.filter((r) => !r.card));
  return base.rows.map((r) => {
    if (r.card === 'file') return { ...r, files };
    if (r.card) return r;
    const { overlap, ...rest } = r;
    const twin = same.find((b) => b.role === r.role && b.paras.some((q) => q.len === r.paras[0].len));
    return { ...rest, paras: r.paras.map(({ height, ...p }) => {
      const h = same.find((b) => b.role === r.role && b.paras.some((q) => q.len === p.len))?.paras.find((q) => q.len === p.len)?.height;
      return h === undefined ? p : { ...p, height: h };
    }), ...(twin?.overlap ? { overlap: twin.overlap } : {}) };
  });
};
const main = at(base.width);
const entries = [['main', BASE, main]];
const lifts = [];
for (const s of shown) {
  const conv = at(s.width);
  if (JSON.stringify(conv) !== JSON.stringify(main) || s.lift) entries.push([short(s.id), s.id, conv]);
  if (s.lift) lifts.push([short(s.id), s.lift]);
}
// In a state of its own, a bubble that is one of main's with paragraphs scrolled off above (only
// its last ones on screen: oracle-file-sent shows 4 of the answer's 5) is main's whole bubble, its
// on-screen paragraphs at their captured heights, so its top lands where the oracle's does.
const whole = (s) => {
  const mains = at(s.width).filter((r) => !r.card);
  return s.rows.map((r) => {
    if (r.card || !r.paras.length) return r;
    const m = mains.find((x) => x.role === r.role && r.paras.length < x.paras.length && r.paras.every((p) => x.paras.some((q) => q.len === p.len)));
    if (!m) return r;
    const { overlap, ...rest } = m;
    return { ...rest, paras: m.paras.map((q) => r.paras.find((p) => p.len === q.len) ?? q), ...(r.overlap ? { overlap: r.overlap } : {}) };
  });
};
for (const s of own) entries.push([short(s.id), s.id, whole(s)]);

const body = entries.map(([name, id, r]) => `  // ${id}\n  ${JSON.stringify(name)}: ${JSON.stringify(r)},`).join('\n');
const out = `// Generated by scripts/transcript-scenes.mjs from fixtures/states: do not edit.
// The conversations on screen in the captured oracle states, as lengths only (O2).
import type {SceneRow} from '../components/Transcript'

export const transcripts: Record<string, SceneRow[]> = {
${body}
}

// How far a state's last row ends above the transcript's end (+), or below it, scrolled up (-).
export const lifts: Record<string, number> = {
${lifts.map(([k, v]) => `  ${JSON.stringify(k)}: ${v},`).join('\n')}
}
`;
const file = path('app', 'src', 'gate', 'transcripts.ts');
if (process.argv.includes('--check')) {
  if (!existsSync(file) || readFileSync(file, 'utf8') !== out) { console.error('app/src/gate/transcripts.ts is stale: node scripts/transcript-scenes.mjs'); process.exit(1); }
  process.exit(0);
}
writeFileSync(file, out);
console.log(`wrote ${file}`);
