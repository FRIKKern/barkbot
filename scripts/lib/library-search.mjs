// Library's header gains a Search button in Grok 1.3.0 (oracle-library: a 36 round button at the
// panel's left, 732,12, drawn as Close is). It belongs to the Library tab: Activity has none.
// Look only (0005): the press does nothing yet, so only where it shows is checked.
// Control: on Activity no Search is drawn, and Close stays at the right on both tabs.
// The page is the oracle scene (/gate/oracle-turn-1040): the real Shell, the panel open on Activity.
export async function librarySearch({ check, precondition, ev, open, base, until }) {
  const look = () => ev(() => {
    const at = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
    const panel = document.querySelector('aside.details')?.getBoundingClientRect();
    return {
      tab: document.querySelector('aside.details [role=tab][aria-selected=true]')?.textContent.trim() ?? null,
      panel: panel ? [panel.x, panel.width] : null,
      search: at('aside.details .details-head button[aria-label="Search"]'),
      close: at('aside.details .details-head button[aria-label="Close"]'),
    };
  });
  const tab = (name) => ev((n) => [...document.querySelectorAll('aside.details [role=tab]')].find((t) => t.textContent.trim() === n)?.click(), name);

  await open(`${base}/gate/oracle-turn-1040`);
  await until(async () => (await look()).tab === 'Activity', 15000, 'the oracle scene').catch(() => {});
  const activity = await look();
  precondition('the oracle scene is up with the panel open on Activity', activity.tab === 'Activity' && !!activity.close && !!activity.panel, activity);
  check('control: on Activity the panel header has no Search, only Close at its right', activity.search === null && Math.round(activity.close[0] + activity.close[2]) === Math.round(activity.panel[0] + activity.panel[1] - 12), activity);

  await tab('Library');
  await until(async () => (await look()).tab === 'Library', 5000, 'the Library tab').catch(() => {});
  const library = await look();
  const [x, y, w, h] = library.search ?? [];
  check('on Library the header shows Search, 36 round at the panel\'s left (12 in, 12 down: oracle-library 1.3.0), and Close stays', library.tab === 'Library' && w === 36 && h === 36 && x === library.panel[0] + 12 && y === 12 && !!library.close, library);

  await tab('Activity');
  await until(async () => (await look()).tab === 'Activity', 5000, 'back to Activity').catch(() => {});
  check('back on Activity the Search goes again', (await look()).search === null, await look());
}
