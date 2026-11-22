// A control that says it opens something (aria-haspopup) must open it: once clicked, an element
// with the role it names shows (true and "menu" name a menu), one that was not there before the
// click (task-b4c296c9fce46e06: Support and More said menu and opened nothing, so a screen reader
// announced a menu that never came).
// Where it looks: the live page (the oracle scene /gate/oracle-turn-1040, the real Shell) and every
// layer its triggers open, as a person reaches them: the page itself, then each trigger's layer.
// Every aria-haspopup control found there is clicked on a fresh page, its layer opened the same way.
// Control: the rule must find at least one such control, or it measured nothing.
const LAYERS = [null, 'Open account menu', 'Composer actions', 'Connect apps', 'New Bot', 'Edit Bot avatar'];

export async function popupOpens({ check, precondition, ev, open, base, click, wait, until }) {
  const fresh = async () => {
    await open(`${base}/gate/oracle-turn-1040`);
    await until(async () => !!(await ev(() => document.querySelector('button[aria-label^="Open account menu"]'))), 15000, 'the oracle scene').catch(() => {});
  };
  const centre = (sel, key) => ev(([s, k]) => {
    const name = (e) => e.getAttribute('aria-label') || e.textContent.trim().slice(0, 40);
    const e = [...document.querySelectorAll(s)].find((x) => k === null || name(x) === k || name(x).startsWith(`${k}, `));
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  }, [sel, key]);
  const press = async (sel, key) => { const at = await centre(sel, key); if (at) { await click(...at); await wait(400); } return !!at; };
  // The aria-haspopup controls in a layer (or on the page outside every layer, for null).
  const found = (layer) => ev((l) => {
    const name = (e) => e.getAttribute('aria-label') || e.textContent.trim().slice(0, 40);
    return [...document.querySelectorAll('[aria-haspopup]:not([aria-haspopup=false])')]
      .filter((e) => (l === null ? !e.closest('.overlay') : !!e.closest('.overlay')))
      .map((e) => ({ name: name(e), popup: e.getAttribute('aria-haspopup') }));
  }, layer);
  const reach = async (layer) => { await fresh(); return layer === null ? true : press('button', layer); };

  const seen = [];
  for (const layer of LAYERS) {
    if (!(await reach(layer))) continue;
    for (const c of await found(layer)) if (!seen.some((s) => s.layer === layer && s.name === c.name)) seen.push({ layer, ...c });
  }
  precondition('the live page and its layers hold at least one aria-haspopup control', seen.length > 0, seen);

  for (const c of seen) {
    const role = c.popup === 'true' ? 'menu' : c.popup;
    await reach(c.layer);
    // Mark what is there before the click, so a menu the control sits in does not count.
    await ev((r) => document.querySelectorAll(`[role=${r}]`).forEach((e) => e.setAttribute('data-before-click', '')), role);
    const pressed = await press('[aria-haspopup]', c.name);
    const shown = await ev((r) => [...document.querySelectorAll(`[role=${r}]`)].filter((e) => !e.hasAttribute('data-before-click')).length, role);
    check(`${c.name}${c.layer ? ` (in ${c.layer})` : ''} says aria-haspopup="${c.popup}"; once clicked, a new role=${role} shows (control: none before the click)`, pressed && shown > 0, { ...c, pressed, shown });
  }
}
