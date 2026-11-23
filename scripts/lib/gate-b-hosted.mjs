// What hosted Gate B says under a drop (gate.yml runs it report only). A busy runner fires a timer
// late, so a timing budget can flip there that the recorded local runs meet; anything else that
// flips is the app, and must never be waved through as runner timing (rev299 on #311: the rail's
// unread mark removed read "not a regression").

// A timing budget: one judged by the clock (≤ n ms, ≤ n s, in n frames). "budget: focus stays in
// Prompt" is a budget, but not a timing one.
export const isTimingBudget = (key) => /^budget: .*(≤ [\d.]+ m?s\b|in \d+ frames?\b)/.test(key);

/** The one line for a hosted drop, from what flipped: [{id, key}]. */
export function hostedNote(flipped) {
  const other = flipped.filter((f) => !isTimingBudget(f.key));
  if (!flipped.length) return 'Gate B: report only: the count went down with no case named as flipped: look at it.';
  if (other.length) return `Gate B: report only: a non-timing case flipped (${other.map((f) => `${f.id} · ${f.key}`).join(', ')}): look at it.`;
  return 'Gate B: report only, runner timing: every case that flipped is a timing budget, and a late timer on this hosted runner flips those; budgets are judged on the recorded local runs (parity/gate-b/), not here.';
}
