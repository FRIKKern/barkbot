// The sweep's last look before a press (task-1c715b946dff6176, task-7521aa645350a9ed; rev299 on #316
// and on #318). Between reading the screen and pressing there is `open -a` and 300 ms, so what sits
// under the point may no longer be what was picked: a list that scrolled, a toast, a dialog that
// opened, a control shown on hover, or a twin by the same name that took the picked box. So the
// picked element is marked in the page right after the pick (markPicked: a held reference, nothing
// written into the page's DOM), and right before the press the page is asked what the press would
// reach (underPoint); the sweep presses only if that is the marked element itself.
import { innerText } from './controls.mjs';

// pressLabel reaches controls inside a message (controls() leaves those out), so it takes only the
// picture viewer's two openers: look only, they open the viewer and act on nothing.
export const VIEWER = Object.freeze(['Open image full screen', 'Open the remaining 3 images full screen']);
export const labelPressAllowed = (name) => VIEWER.includes(name);

/** The picked element's own name, as the page reads one: its aria-label before ', ', else its own
 *  text, else the first visible text inside it (controls.mjs controlName without its two special
 *  cases, so a rail tile or a picker is checked by what it carries itself). */
export const pickedName = (els, e) => e.label?.split(', ')[0] || e.text || innerText(els, e) || null;

/** Runs IN THE PAGE (page.evaluate serialises it, so it uses nothing from this module), right after
 *  collect: finds the element collect gave index `i`, counting as collect counts (the same filter,
 *  pinned by check.mjs against collect.mjs), and holds it as `window.__sweepPicked`. It must still
 *  have the picked `box` and `name`, or nothing is held: the screen moved between the pick and the
 *  mark. Answers {ok, under}. `doc`: the page's document; check.mjs passes a stand-in. */
export function markPicked(i, box, name, doc = document) {
  const view = doc.defaultView;
  view.__sweepPicked = null;
  const own = (el) => [...(el.childNodes ?? [])].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  const shown = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.right < 0 || r.bottom < 0 || r.left > view.innerWidth || r.top > view.innerHeight) return false; const cs = view.getComputedStyle(el); return !(cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0); };
  const nameOf = (el) => { const label = el.getAttribute?.('aria-label')?.slice(0, 80)?.split(', ')[0]; if (label) return label; for (const d of [el, ...(el.querySelectorAll?.('*') ?? [])]) { if (d !== el && !shown(d)) continue; const t = own(d); if (t && t.length <= 40) return t; } return null; };
  let n = -1, el = null;
  for (const x of doc.body.querySelectorAll('*')) { if (shown(x) && ++n === i) { el = x; break; } }
  if (!el) return { ok: false, under: `no element ${i} on screen any more` };
  const r = el.getBoundingClientRect();
  const same = [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10).every((v, k) => Math.abs(v - box[k]) <= 0.06);
  if (!same || nameOf(el) !== name) return { ok: false, under: `element ${i} is now ${el.tagName?.toLowerCase()}${nameOf(el) ? ` "${nameOf(el)}"` : ''}, not the picked "${name}"` };
  view.__sweepPicked = el;
  return { ok: true, under: `${el.tagName?.toLowerCase()} "${name}"` };
}

/** Runs IN THE PAGE. The press reaches the nearest pressable ancestor-or-self of the element under
 *  (x, y); that element must be the one markPicked holds (a twin by the same name in the same box
 *  is another element), still with the picked box (collect.mjs rounds to 0.1, so within 0.06). A
 *  box of zero width or height is refused: its centre is an edge. Answers {ok, under}: `under`
 *  names what the press would reach, for the refusal. */
export function underPoint(x, y, box, doc = document) {
  const PRESSABLE = 'button, a[href], input, select, textarea, [role=button], [role=menuitem], [role=tab], [role=switch], [role=checkbox], [role=combobox], [role=textbox], [tabindex]';
  const view = doc.defaultView;
  const picked = view.__sweepPicked ?? null;
  const say = (el) => (el ? `${el.tagName?.toLowerCase() ?? '?'}${el.getAttribute?.('aria-label') ? ` "${el.getAttribute('aria-label')}"` : ''}` : 'nothing');
  if (!(box[2] > 0 && box[3] > 0)) return { ok: false, under: `a picked box of zero size (${box.join(', ')})` };
  if (!picked) return { ok: false, under: 'no picked element held (markPicked did not run, or refused)' };
  const top = doc.elementFromPoint(x, y);
  const hit = top?.closest?.(PRESSABLE) ?? null;
  if (!hit) return { ok: false, under: `${say(top)}, with nothing pressable` };
  if (hit !== picked) return { ok: false, under: `${say(hit)}, another element than the picked one` };
  const r = hit.getBoundingClientRect();
  if (![r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10).every((v, k) => Math.abs(v - box[k]) <= 0.06)) return { ok: false, under: `${say(hit)}, moved from the picked box` };
  return { ok: true, under: say(hit) };
}

/** Runs IN THE PAGE, after the press: lets the held element go. */
export function dropPicked(doc = document) { doc.defaultView.__sweepPicked = null; }
