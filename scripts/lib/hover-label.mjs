// The sweep's hoverLabel step (N2, task-d151bc971b9982fe): where the pointer rests to hover a
// message. A message is no control (lib/controls.mjs names buttons and fields), and the first
// group on screen is the header, so neither `hover` nor `hoverRole` can reach one. On 1.2.3 every
// message is a group labelled "Message actions for Oracle message at 8:22:58 PM" (or "for your
// message at ..."), so it is found by the start of that label.
//
// The LAST match wholly inside the window: the newest message, and never one the window cuts,
// whose centre could sit off screen. Only a message's own group counts: each picture tile in a
// message carries the same label again, nested inside it (oracle-ask-choice 96-106 in 93). No
// match is an error that names the prefix: a hover that lands nowhere would capture the resting
// screen under a hover's name.

/** The element to hover in a collect.mjs state: {e, at: [x, y]} at the element's centre. */
export function pickByLabel(state, prefix) {
  const [w, h] = state.viewport;
  const els = state.elements;
  const labelled = (e) => !!e.label?.startsWith(prefix);
  const nested = (e) => { for (let p = e.parent; p !== undefined && p !== null; p = els[p].parent) if (labelled(els[p])) return true; return false; };
  const matches = els.filter((e) => labelled(e) && !nested(e));
  const whole = matches.filter(({ box: [x, y, bw, bh] }) => bw > 0 && bh > 0 && x >= 0 && y >= 0 && x + bw <= w && y + bh <= h);
  if (!whole.length) throw new Error(`hoverLabel "${prefix}": ${matches.length ? `${matches.length} by that label, none wholly on screen` : 'nothing by that label on screen'}`);
  const e = whole.at(-1);
  const [x, y, bw, bh] = e.box;
  return { e, at: [x + bw / 2, y + bh / 2] };
}
