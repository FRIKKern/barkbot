// What hosted Gate B says under a drop (gate.yml runs it report only). A busy runner fires a timer
// late, so a timing budget can flip there that the recorded local runs meet; anything else that
// flips is the app, and must never be waved through as runner timing (rev299 on #311: the rail's
// unread mark removed read "not a regression").

// The clock budgets: the one list of them (rev on #314). A flip is runner timing only when its case
// carries clock: true (gate-b.mjs's budget() sets it, and nothing else may) AND its key is here. A
// stray tag, a key's wording ("the card sits in 2 frames of the bubble"), another quote style or an
// alias of budget() all fall to "look at it", the safe side (task-4ce61dac9b63c95c). check.mjs keeps
// this list equal to gate-b.mjs's budget() keys. "budget: focus stays in Prompt" is not a clock.
export const CLOCKS = Object.freeze([
  'budget: composer clears in 1 frame',
  'budget: working line gone ≤ 250 ms after the reply',
  'budget: own bubble ≤ 440 ms',
  'budget: working line ≤ 2.0 s',
]);
const isTiming = (f) => f.clock === true && CLOCKS.includes(f.key);

// A record matches a case by its key, so two cases of one turn under one key cannot be told apart: a
// failing case pushed under a clock key word for word, with a computed tag, would hide behind the
// real budget (door J, review of #314; task-f294c8197a92c306). A key may repeat across turns.
/** Keys two or more cases of one turn share: [{id, key}]. `turns`: [{id, results: [{key}]}]. */
export function sharedKeys(turns) {
  const out = [];
  for (const t of turns) {
    const seen = new Set();
    for (const { key } of t.results) { if (seen.has(key) && !out.some((o) => o.id === t.id && o.key === key)) out.push({ id: t.id, key }); seen.add(key); }
  }
  return out;
}

/** The one line for a hosted drop, from what flipped ([{id, key, clock}]) and this run's turns
 *  ([{id, results}], required: a shared key is read from them, not from what flipped). */
export function hostedNote(flipped, turns) {
  if (!Array.isArray(turns)) throw new Error('hostedNote: give it this run\'s turns ([{id, results}]), so a shared key is seen');
  const shared = sharedKeys(turns);
  if (shared.length) return `Gate B: report only: two cases of one turn share a key (${shared.map((f) => `${f.id} · ${f.key}`).join(', ')}): a record cannot tell them apart: look at it.`;
  const other = flipped.filter((f) => !isTiming(f));
  if (!flipped.length) return 'Gate B: report only: the count went down with no case named as flipped: look at it.';
  if (other.length) return `Gate B: report only: a non-timing case flipped (${other.map((f) => `${f.id} · ${f.key}`).join(', ')}): look at it.`;
  return 'Gate B: report only, runner timing: every case that flipped is a timing budget, and a late timer on this hosted runner flips those; budgets are judged on the recorded local runs (parity/gate-b/), not here.';
}
