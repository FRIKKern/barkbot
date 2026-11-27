// Transcript keys (task-b4e7f5ce76c81c7f): a gate scene that names a conversation must name one that
// exists. app/src/gate/transcripts.ts is generated (scripts/transcript-scenes.mjs) and typed
// Record<string, …>, so tsc cannot see a key that a regeneration dropped: on the 1.3.0 baseline the
// picture-viewer entries went, the viewer scenes read transcripts['picture-viewer'] as undefined, and
// the gate timed out with no word of why.
//
// Two ways in, two rules:
//   transcripts['x'] / transcripts.x   a direct read has no fallback: x must be a key of transcripts.
//   conversationOf('x')                falls back to main on purpose (a state whose conversation is
//                                      main's gets no entry), so x must be a captured state instead:
//                                      fixtures/states/oracle-x.json. A typo would silently show main.
// A read whose key is not a literal cannot be checked, so it is a red, except the one that is the
// fallback itself (conversationOf's own body).
import { codeOf } from './session-doors.mjs';

/** The keys of `export const transcripts` in the generated file. */
export function transcriptKeysOf(src) {
  const at = src.indexOf('export const transcripts');
  if (at < 0) return null;
  const end = src.indexOf('\n}\n', at);
  return new Set([...src.slice(at, end).matchAll(/^ {2}"([^"]+)":/gm)].map((m) => m[1]));
}

// The string literal starting at src[i] (after spaces), or null when there is none.
const literalAt = (src, i) => {
  while (/\s/.test(src[i])) i++;
  const q = src[i];
  if (q !== "'" && q !== '"') return null;
  const end = src.indexOf(q, i + 1);
  return end < 0 ? null : src.slice(i + 1, end);
};
const lineOf = (src, i) => src.slice(0, i).split('\n').length;

/** Every transcripts read and conversationOf call in `files` ({path, src}), and the reds: a key that
 *  is not there, a state that was not captured, a key that is not a literal. `states` holds the
 *  captured ids (oracle-…). The generated file itself is skipped. */
export function transcriptReds(files, keys, states) {
  const reads = [], reds = [];
  for (const { path, src } of files) {
    if (path.endsWith('/gate/transcripts.ts')) continue;
    const code = codeOf(src);
    for (const m of code.matchAll(/(?<![\w$.])transcripts\s*([[.])/g)) {
      const where = `${path}:${lineOf(src, m.index)}`;
      const after = m.index + m[0].length;
      const key = m[1] === '.' ? /^[A-Za-z_$][\w$]*/.exec(code.slice(after))?.[0] ?? null : literalAt(src, after);
      if (key === null) {
        if (/conversationOf\s*=/.test(code.split('\n')[lineOf(src, m.index) - 1])) continue;
        reds.push(`${where}: transcripts[…] with a key that is not a literal: read it through conversationOf, or name the key`);
        continue;
      }
      reads.push({ where, kind: 'read', key });
      if (!keys.has(key)) reds.push(`${where}: transcripts['${key}'] is not in app/src/gate/transcripts.ts (run node scripts/transcript-scenes.mjs, or read it through conversationOf)`);
    }
    for (const m of code.matchAll(/(?<![\w$.])conversationOf\s*(=|\()/g)) {
      if (m[1] === '=') continue;
      const where = `${path}:${lineOf(src, m.index)}`;
      const key = literalAt(src, m.index + m[0].length);
      if (key === null) { reds.push(`${where}: conversationOf(…) with a key that is not a literal`); continue; }
      reads.push({ where, kind: 'conversation', key });
      if (!states.has(`oracle-${key}`)) reds.push(`${where}: conversationOf('${key}') names no captured state (fixtures/states/oracle-${key}.json): it would show main's conversation`);
    }
  }
  return { reads, reds };
}

// The scan on made-up sources: [name, files, keys, states, reds wanted, a pattern every red matches].
const keys = new Set(['main', 'ask-choice']), states = new Set(['oracle-ask-choice', 'oracle-main-1280']);
const f = (src) => [{ path: 'app/src/gate/scenes/x.ts', src }];
export const CASES = [
  ['a key that is there', f("export default {...oracle, transcript: {bubbles: transcripts['ask-choice']}}"), keys, states, 0],
  ['a key a regeneration dropped', f("export default {...oracle, transcript: {bubbles: transcripts['picture-viewer']}}"), keys, states, 1, /\['picture-viewer'\] is not in/],
  ['a dotted key that is not there', f('const b = transcripts.mian'), keys, states, 1, /\['mian'\] is not in/],
  ['a computed key', f('const b = transcripts[id]'), keys, states, 1, /not a literal/],
  ['conversationOf a captured state with no entry of its own', f("export default conversationOf('main-1280')"), keys, states, 0],
  ['conversationOf a state never captured', f("export default conversationOf('main-1208')"), keys, states, 1, /names no captured state/],
  ["conversationOf's own body, the fallback", f('export const conversationOf = (key: string): Scene => ({...oracle, transcript: {bubbles: transcripts[key] ?? transcripts.main}})'), keys, states, 0],
  ['words in a comment or a string are not reads', f("// gate/transcripts.ts holds transcripts['gone']\nimport {transcripts} from '../transcripts'\nconst s = \"transcripts['gone']\""), keys, states, 0],
  ['a property of another object is not the import', f("const n = scene.transcripts['gone']"), keys, states, 0],
];
