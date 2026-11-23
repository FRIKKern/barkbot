// The sweep's last look before a press (task-1c715b946dff6176, rev299 on #316). Between reading
// the screen and pressing there is `open -a` and 300 ms, so what sits under the point may no longer
// be what was picked: a list that scrolled, a toast, a dialog that opened. Right before the press,
// the page is asked what is under the point; the sweep presses only if it is the picked element.

// pressLabel reaches controls inside a message (controls() leaves those out), so it takes only the
// picture viewer's two openers: look only, they open the viewer and act on nothing.
export const VIEWER = Object.freeze(['Open image full screen', 'Open the remaining 3 images full screen']);
export const labelPressAllowed = (name) => VIEWER.includes(name);

/** Runs IN THE PAGE (page.evaluate serialises it, so it uses nothing from this module): the element
 *  under (x, y), or one of its ancestors, must have the picked element's box (collect.mjs rounds to
 *  0.1, so within 0.06) and, with `label`, carry exactly that aria-label (a tile's own picture has the
 *  tile's box and no label: the walk goes on to its button). Answers {ok, under}: `under` names what
 *  is at the point, for the refusal. `doc`: the page's document; check.mjs passes a stand-in. */
export function underPoint(x, y, box, label = null, doc = document) {
  const top = doc.elementFromPoint(x, y);
  const name = (el) => (el ? `${el.tagName?.toLowerCase() ?? '?'}${el.getAttribute?.('aria-label') ? ` "${el.getAttribute('aria-label')}"` : ''}` : 'nothing');
  for (let el = top; el; el = el.parentElement) {
    const r = el.getBoundingClientRect();
    const same = [r.x, r.y, r.width, r.height].every((v, i) => Math.abs(Math.round(v * 10) / 10 - box[i]) <= 0.06);
    if (same && (label === null || el.getAttribute('aria-label') === label)) return { ok: true, under: name(el) };
  }
  return { ok: false, under: name(top) };
}
