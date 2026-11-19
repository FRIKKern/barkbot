// Writes app/src/gate/transcripts.ts: the conversations on screen in the captured oracle states,
// as lengths only (O2), for the gate scenes to render with placeholder words.
//   node scripts/transcript-scenes.mjs          write it
//   node scripts/transcript-scenes.mjs --check  exit 1 if it is stale
// main: the conversation behind the baseline's states (1.2.3: a message carrying files, then the
// long answer), as oracle-turn-1040 shows it (the window as it rests). The other baseline states
// show the same conversation at another width or scrolled elsewhere: each gets its own entry, the
// same rows with the paragraph heights captured at its column's width, and its lift. Each state
// with a version exception (lib/versions.mjs) has a conversation of its own, its cards in place.
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
const rows = (s) => {
  const bs = bubbles(s);
  const b = transcriptOf(s).map((x, i) => ({ y: bs[i].y, x }));
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

// The baseline's states (no version exception) and what each shows.
const except = new Set(EXCEPTIONS.map((x) => x.id));
const shown = readdirSync(path('fixtures', 'states')).filter((f) => f.endsWith('.json')).map((f) => state(f.slice(0, -5))).filter((s) => !except.has(s.id) && content(s)).map((s) => ({ id: s.id, width: content(s).box[2], rows: rows(s), lift: liftOf(s) }));

// One conversation: the base's rows, each file card holding every file any state shows of it
// (by name), each paragraph its height at the column's width when some state of that width shows it
// (else none: the placeholder words wrap as they will, off screen in every capture).
const base = shown.find((s) => s.id === BASE);
// A file's size is read where it is on screen (oracle-main-1000 shows only the top of one).
const seen = shown.flatMap((s) => s.rows.flatMap((r) => (r.card === 'file' ? r.files : [])));
const files = [...new Set(seen.map((f) => f.name))].sort().map((name) => ({ name, size: Math.max(...seen.filter((f) => f.name === name).map((f) => f.size)) }));
const at = (width) => {
  const same = shown.filter((s) => s.width === width).flatMap((s) => s.rows.filter((r) => !r.card));
  return base.rows.map((r) => {
    if (r.card === 'file') return { ...r, files };
    if (r.card) return r;
    return { ...r, paras: r.paras.map(({ height, ...p }) => {
      const h = same.find((b) => b.role === r.role && b.paras.some((q) => q.len === p.len))?.paras.find((q) => q.len === p.len)?.height;
      return h === undefined ? p : { ...p, height: h };
    }) };
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
for (const x of EXCEPTIONS) entries.push([short(x.id), x.id, rows(state(x.id))]);

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
