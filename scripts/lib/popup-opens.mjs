// A control that says it opens something (aria-haspopup) must open it: once clicked, an element
// with the role it names shows (true and "menu" name a menu), one that was not there before the
// click (task-b4c296c9fce46e06: Support and More said menu and opened nothing, so a screen reader
// announced a menu that never came).
// Where it looks (task-f53de46036d37cdf): the live page (the oracle scene /gate/oracle-turn-1040,
// the real Shell) and every layer the overlay registry can show, each opened as a person opens it
// (scripts/lib/overlay-routes.mjs reads the ways in from the registry). A layer that has no way in,
// or whose trigger is not on the page, fails: it is never skipped.
// What counts as opened: a new element with the named role that is visible and belongs to the
// control: the control's aria-controls names it (or a box around it), or it sits within NEAR px of
// the control. Each wait is for the thing itself (the layer shown, the element shown), not a timer.
import { overlayRoutes } from './overlay-routes.mjs';

const NEAR = 32; // px between the control's box and the popup's: a popup opens at its control
const SHOWN_MS = 5000; // a layer or popup that is not up in this long is not coming

export async function popupOpens({ check, precondition, ev, open, base, click, key, until }) {
  const t0 = Date.now();
  const { routes, unrouted } = await overlayRoutes();
  precondition('the overlay registry (app/src/components/overlays/index.tsx) lists layers', routes.length + unrouted.length > 0, { routes, unrouted });
  check('every layer in the overlay registry has a way in from the live page (a trigger, a picker, a data-picker button, a row that goes to it, or a page tab)', unrouted.length === 0, { unrouted });

  let loads = 0, loadMs = 0;
  const fresh = async () => {
    const t = Date.now();
    loads++;
    await open(`${base}/gate/oracle-turn-1040`);
    // !! inside the page: a DOM node cannot come back by value, so returning one throws every poll.
    await until(() => ev(() => !!document.querySelector('button[aria-label^="Open account menu"]')), 15000, 'the oracle scene').catch(() => {});
    loadMs += Date.now() - t;
  };
  // The centre of the first visible element matching sel whose name is key (null: any), scrolled into view.
  const centre = (sel, key) => ev(([s, k]) => {
    const name = (e) => e.getAttribute('aria-label') || e.textContent.trim().slice(0, 40);
    const shown = (e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    const e = [...document.querySelectorAll(s)].find((x) => shown(x) && (k === null || name(x) === k || name(x).startsWith(`${k}, `)));
    if (!e) return null;
    e.scrollIntoView({ block: 'nearest' });
    const r = e.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  }, [sel, key]);
  // .overlay is display: contents (no box of its own): it is up when something in it shows.
  const layerUp = (name) => ev((n) => [...document.querySelectorAll(`.overlay[data-overlay="${n}"] > *`)].some((e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true })), name);
  const tabCurrent = (sel, key) => ev(([s, k]) => [...document.querySelectorAll(s)].some((e) => e.textContent.trim() === k && e.getAttribute('aria-current') === 'page'), [sel, key]);
  // One step of a route: press, then wait for what it opens. 'ok', 'missing' (not on the page) or 'not shown'.
  const step = async (s) => {
    const at = await centre(s.press, s.name);
    if (!at) return 'missing';
    await click(...at);
    const done = s.current ? () => tabCurrent(s.press, s.name) : () => layerUp(s.opens);
    return (await until(done, SHOWN_MS, s.opens ?? s.name).then(() => true, () => false)) ? 'ok' : 'not shown';
  };
  // Back to the bare page: Escape closes the open layer (overlays/index.tsx); a fresh load only
  // when it does not (a page load is the slow part of this rule: one per layer took 4 min).
  const anyUp = () => ev(() => [...document.querySelectorAll('.overlay > *')].some((e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true })));
  let loaded = false;
  const bare = async () => {
    if (loaded && await anyUp()) { await key('Escape'); await until(async () => !(await anyUp()), 2000, 'the layer to close').catch(() => {}); }
    if (!loaded || await anyUp()) { await fresh(); loaded = true; }
  };
  const reach = async (r) => {
    await bare();
    for (const s of r?.steps ?? []) {
      const why = await step(s);
      if (why !== 'ok') return { ok: false, at: `${s.press}${s.name ? ` "${s.name}"` : ''}`, why };
    }
    return { ok: true };
  };
  const scope = (r) => (r ? `.overlay[data-overlay="${r.layer}"] ` : '');
  // The visible aria-haspopup controls in a layer (or on the page outside every layer, for null).
  const found = (r) => ev(([sc, page]) => {
    const name = (e) => e.getAttribute('aria-label') || e.textContent.trim().slice(0, 40);
    return [...document.querySelectorAll(`${sc}[aria-haspopup]:not([aria-haspopup=false])`)]
      .filter((e) => (page ? !e.closest('.overlay') : true) && e.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
      .map((e) => ({ name: name(e), popup: e.getAttribute('aria-haspopup') }));
  }, [scope(r), !r]);

  const seen = [];
  for (const r of [null, ...routes]) {
    const got = await reach(r);
    if (r) check(`${r.overlay} opens from the live page as a person opens it (${r.steps.map((s) => s.name ?? s.press).join(' > ')})`, got.ok, { overlay: r.overlay, ...got });
    if (!got.ok) continue;
    for (const c of await found(r)) if (!seen.some((s) => s.r === r && s.name === c.name)) seen.push({ r, ...c });
  }
  precondition('the live page and its layers hold at least one aria-haspopup control', seen.length > 0, seen.map((s) => s.name));

  for (const c of seen) {
    const role = c.popup === 'true' ? 'menu' : c.popup;
    const where = c.r ? ` (in ${c.r.overlay})` : '';
    const got = await reach(c.r);
    if (!got.ok) { check(`${c.name}${where}: its layer opens again`, false, got); continue; }
    // Mark the control, and what has the role before the click, so a menu the control sits in does not count.
    await ev(([sc, page, k, r]) => {
      const name = (e) => e.getAttribute('aria-label') || e.textContent.trim().slice(0, 40);
      document.querySelectorAll('[data-before-click], [data-popup-control]').forEach((e) => { e.removeAttribute('data-before-click'); e.removeAttribute('data-popup-control'); });
      document.querySelectorAll(`[role=${r}]`).forEach((e) => e.setAttribute('data-before-click', ''));
      [...document.querySelectorAll(`${sc}[aria-haspopup]`)].find((e) => (page ? !e.closest('.overlay') : true) && (name(e) === k || name(e).startsWith(`${k}, `)))?.setAttribute('data-popup-control', '');
    }, [scope(c.r), !c.r, c.name, role]);
    const at = await centre('[data-popup-control]', null);
    if (at) await click(...at);
    // New, visible, and the control's: named by its aria-controls, or within NEAR px of it.
    const owned = () => ev(([r, near]) => {
      const ctl = document.querySelector('[data-popup-control]');
      if (!ctl) return [];
      const ids = (ctl.getAttribute('aria-controls') ?? '').split(/\s+/).filter(Boolean);
      const a = ctl.getBoundingClientRect();
      return [...document.querySelectorAll(`[role=${r}]:not([data-before-click])`)]
        .filter((e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
        .map((e) => {
          const b = e.getBoundingClientRect();
          const gap = Math.round(Math.hypot(Math.max(0, a.left - b.right, b.left - a.right), Math.max(0, a.top - b.bottom, b.top - a.bottom)));
          const named = ids.some((id) => e.id === id || !!e.closest(`[id="${CSS.escape(id)}"]`));
          return { gap, named, mine: named || gap <= near };
        });
    }, [role, NEAR]);
    let shown = [];
    if (at) await until(async () => (shown = await owned()).some((x) => x.mine), SHOWN_MS, `a role=${role} from ${c.name}`).catch(() => {});
    check(`${c.name}${where} says aria-haspopup="${c.popup}"; once clicked, a new visible role=${role} shows that is its own (aria-controls, or within ${NEAR} px; control: none before the click)`, !!at && shown.some((x) => x.mine), { name: c.name, layer: c.r?.overlay ?? 'page', pressed: !!at, shown });
  }
  console.log(`  · ${routes.length} layers from the registry, ${seen.length} aria-haspopup control(s), ${((Date.now() - t0) / 1000).toFixed(1)} s (${loads} page loads, ${(loadMs / 1000).toFixed(1)} s of them)`);
}
