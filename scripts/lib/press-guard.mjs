// The sweep's last look before a press (task-1c715b946dff6176, rev299 on #316 and on #318). Between
// reading the screen and pressing there is `open -a` and 300 ms, so what sits under the point may no
// longer be what was picked: a list that scrolled, a toast, a dialog that opened, a control shown on
// hover. Right before the press the page is asked what the press would reach; the sweep presses only
// if that is the picked element.
import { innerText } from './controls.mjs';

// pressLabel reaches controls inside a message (controls() leaves those out), so it takes only the
// picture viewer's two openers: look only, they open the viewer and act on nothing.
export const VIEWER = Object.freeze(['Open image full screen', 'Open the remaining 3 images full screen']);
export const labelPressAllowed = (name) => VIEWER.includes(name);

/** The picked element's own name, as underPoint reads one in the page: its aria-label before ', ',
 *  else its own text, else the first text inside it (controls.mjs controlName without its two
 *  special cases, so a rail tile or a picker is checked by what it carries itself). */
export const pickedName = (els, e) => e.label?.split(', ')[0] || e.text || innerText(els, e) || null;

/** Runs IN THE PAGE (page.evaluate serialises it, so it uses nothing from this module). The press
 *  reaches the nearest pressable ancestor-or-self of the element under (x, y); that element itself
 *  must be the picked one: the same box (collect.mjs rounds to 0.1, so within 0.06) and the same
 *  `name` (pickedName). With `nth` (pressLabel), it must also be the nth visible element carrying
 *  that aria-label, in document order as collect reads them: two identical openers that swapped
 *  places (a scroll by one tile) share box and name, and only their order tells them apart. A box
 *  of zero width or height is refused: its centre is an edge, and anything there would pass.
 *  Answers {ok, under}: `under` names what the press would reach, for the refusal. `doc`: the
 *  page's document; check.mjs passes a stand-in. */
export function underPoint(x, y, box, name, nth = null, doc = document) {
  const PRESSABLE = 'button, a[href], input, select, textarea, [role=button], [role=menuitem], [role=tab], [role=switch], [role=checkbox], [role=combobox], [role=textbox], [tabindex]';
  const own = (el) => [...(el.childNodes ?? [])].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  const nameOf = (el) => {
    const label = el.getAttribute?.('aria-label')?.slice(0, 80)?.split(', ')[0];
    if (label) return label;
    for (const d of [el, ...(el.querySelectorAll?.('*') ?? [])]) { const t = own(d); if (t && t.length <= 40) return t; }
    return null;
  };
  const say = (el) => (el ? `${el.tagName?.toLowerCase() ?? '?'}${nameOf(el) ? ` "${nameOf(el)}"` : ''}` : 'nothing');
  const boxOf = (el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10); };
  if (!(box[2] > 0 && box[3] > 0)) return { ok: false, under: `a picked box of zero size (${box.join(', ')})` };
  if (typeof name !== 'string' || !name) return { ok: false, under: 'a picked element with no name to check it by' };
  const top = doc.elementFromPoint(x, y);
  const hit = top?.closest?.(PRESSABLE) ?? null;
  if (!hit) return { ok: false, under: `${say(top)}, with nothing pressable` };
  const same = boxOf(hit).every((v, i) => Math.abs(v - box[i]) <= 0.06);
  if (!same || nameOf(hit) !== name) return { ok: false, under: say(hit) };
  if (nth !== null) {
    // As collect.mjs counts them: at least 1 by 1, on screen, not hidden.
    const view = doc.defaultView;
    const shown = (el) => { const [bx, by, w, h] = boxOf(el); if (w < 1 || h < 1 || bx + w < 0 || by + h < 0 || (view && (bx > view.innerWidth || by > view.innerHeight))) return false; const cs = view?.getComputedStyle?.(el); return !cs || !(cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0); };
    const same = [...doc.querySelectorAll('[aria-label]')].filter((el) => el.getAttribute('aria-label').slice(0, 80) === name && shown(el));
    if (same[nth] !== hit) return { ok: false, under: `${say(hit)}, the ${same.indexOf(hit) + 1}. of ${same.length} by that label, not the ${nth + 1}.` };
  }
  return { ok: true, under: say(hit) };
}
