// Which recorded oracle turns Gate B judges (H5). A turn trace is one whose recipe sends.
//
// The rule: a trace is superseded when the same recipe was recorded again on a NEWER oracle
// version; Gate B then judges only the re-record, and names the old one as not judged.
//   why the version, not the date   the app we copy is one oracle version (QUALITY.md O4). Two
//                                   takes of one recipe on the same version are both evidence
//                                   (say-hi and say-hi-2), so "newest file per recipe" would
//                                   drop a good one.
//   why per recipe                  an old trace whose recipe has no re-record is still judged:
//                                   a missing re-record never makes a case go away.
//   why not a list in the trace     a `supersedes` field is a hand-kept list; this is read off
//                                   what record.mjs writes (`recipe`, `oracle_version`).
// The old files stay in traces/: the hero, QUALITY.md's budgets and items H3, H7, H8 read them.
import { readdirSync } from 'node:fs';
import { path, read } from './data.mjs';
import { RECIPES } from '../oracle/recipes.mjs';

const VERSION = /^\d+(\.\d+)*$/;
/** a > b, part by part: 0.79.10 is newer than 0.79.3. */
export function newer(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

/** judged: the traces Gate B scores. superseded: {trace, by}, the re-records that replace it.
 *  unversioned: turn traces naming no oracle version; nothing can be said about them. */
export function turnTraces(all = readdirSync(path('traces')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(read('traces', f)))) {
  const turns = all.filter((t) => RECIPES[t.recipe]?.kind === 'send');
  const unversioned = turns.filter((t) => !VERSION.test(t.oracle_version ?? ''));
  const judged = [], superseded = [];
  for (const t of turns.filter((x) => !unversioned.includes(x))) {
    const by = turns.filter((o) => !unversioned.includes(o) && o.recipe === t.recipe && newer(o.oracle_version, t.oracle_version));
    if (by.length) superseded.push({ trace: t, by }); else judged.push(t);
  }
  return { judged, superseded, unversioned };
}
