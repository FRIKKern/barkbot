// What hosted Gate B says under a drop (gate.yml runs it report only). A busy runner fires a timer
// late, so a timing budget can flip there that the recorded local runs meet; anything else that
// flips is the app, and must never be waved through as runner timing (rev299 on #311: the rail's
// unread mark removed read "not a regression").

// A timing budget is a case gate-b.mjs's budget() made: it carries clock: true. The key's wording
// decides nothing: "the card sits in 2 frames of the bubble" reads like a clock and is not one
// (task-4ce61dac9b63c95c). "budget: focus stays in Prompt" is a budget, but not a timing one.
const isTiming = (f) => f.clock === true;

/** The one line for a hosted drop, from what flipped: [{id, key, clock}]. */
export function hostedNote(flipped) {
  const other = flipped.filter((f) => !isTiming(f));
  if (!flipped.length) return 'Gate B: report only: the count went down with no case named as flipped: look at it.';
  if (other.length) return `Gate B: report only: a non-timing case flipped (${other.map((f) => `${f.id} · ${f.key}`).join(', ')}): look at it.`;
  return 'Gate B: report only, runner timing: every case that flipped is a timing budget, and a late timer on this hosted runner flips those; budgets are judged on the recorded local runs (parity/gate-b/), not here.';
}
