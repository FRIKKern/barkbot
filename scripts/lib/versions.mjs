// Which oracle version the gated states come from, and the named exceptions to that rule.
// Every captured state in fixtures/states comes from ONE oracle version (npm run check, rule 6b),
// except the states listed here, each with its own version and the reason it may differ.
// A state that is not on this list and has another version still fails. Decisions: 0008, 0010.

// Owner decision 2026-11-19 (docs/decisions/0010): the baseline moved to 1.2.3. These six were captured on 1.0.3 after
// sends to the Oracle bot; capturing them again on 1.2.3 needs new sends.
const SENDS = "made by sends; awaiting the owner's send budget";

export const EXCEPTIONS = [
  { id: 'oracle-ask-choice', version: 'GrokBot 1.0.3', reason: SENDS },
  { id: 'oracle-choice-answered', version: 'GrokBot 1.0.3', reason: SENDS },
  { id: 'oracle-file-sent', version: 'GrokBot 1.0.3', reason: SENDS },
  { id: 'oracle-pictures-sent', version: 'GrokBot 1.0.3', reason: SENDS },
  { id: 'oracle-file-waiting', version: 'GrokBot 1.0.3', reason: SENDS },
  { id: 'oracle-pictures-waiting', version: 'GrokBot 1.0.3', reason: SENDS },
];

export const exception = (id) => EXCEPTIONS.find((x) => x.id === id) ?? null;

// In an excepted state, the details panel is not judged: the baseline's own states judge it.
// (0008 left it out because 1.0.3 rebuilt it; under 0010 the 1.2.3 states are the ones that judge it.)
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
