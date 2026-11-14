// Which oracle version the gated states come from, and the named exceptions to that rule.
// Every captured state in fixtures/states comes from ONE oracle version (npm run check, rule 6b),
// except the states listed here, each with its own version and the reason it may differ.
// A state that is not on this list and has another version still fails. Decision: 0008.

const AUTO_UPDATE = 'Owner decision 2026-11-14 (docs/decisions/0008): the oracle updated itself to 1.0.3; these cards did not exist to capture on 0.79.3, and BarkBot stays on the 0.79.3 baseline';

export const EXCEPTIONS = [
  { id: 'oracle-ask-choice', version: 'GrokBot 1.0.3', reason: AUTO_UPDATE },
  { id: 'oracle-choice-answered', version: 'GrokBot 1.0.3', reason: AUTO_UPDATE },
];

export const exception = (id) => EXCEPTIONS.find((x) => x.id === id) ?? null;

// In an excepted state, the parts the newer oracle rebuilt are not judged: the baseline's own
// states judge them. 1.0.3 rebuilt the details panel (Voice and Speed in one picker, no Add to
// Slack card), so its look there is not ours to match.
const NOT_JUDGED = ['Conversation details'];
const ancestors = (els, e) => { const out = []; let p = e.parent; while (p !== undefined) { out.push(els[p]); p = els[p].parent; } return out; };

/** The state as Gate A, the inventory and the check judge it: an excepted state without its not-judged parts. */
export function judged(state) {
  if (!exception(state.id)) return state;
  const els = state.elements;
  const out = (e) => [e, ...ancestors(els, e)].some((a) => a.tag === 'aside' && NOT_JUDGED.includes(a.label));
  // Boxes of size 0 are never named or counted (lib/controls.mjs); indices and parents stay as captured.
  return { ...state, elements: els.map((e) => (out(e) ? { ...e, box: [e.box[0], e.box[1], 0, 0], notJudged: true } : e)) };
}
