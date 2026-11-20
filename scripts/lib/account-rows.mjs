// The account menu's rows that open a dialog (item F8). On the oracle, Get Grok Bot for mobile
// opens the "Grok Bot on your phone" dialog (fixtures/states/oracle-get-mobile.json, captured by
// the sweep: Open account menu, then Get Grok Bot for mobile). Ours must open the same dialog, not
// just close the menu. Control: no dialog before the click, and a row with no target of its own
// (Upgrade plan) closes the menu without opening one.
// The page is the oracle scene (/gate/oracle-turn-1040): the real Shell, the menu opened by a real
// click on the account button.
export async function accountRows({ check, precondition, ev, open, base, click, wait, until, windowFocus }) {
  const look = () => ev(() => ({
    menu: !!document.querySelector('[role=menu][aria-label=Account]'),
    dialog: [...document.querySelectorAll('.overlay [role=dialog]')].map((d) => d.getAttribute('aria-label')),
  }));
  const at = (sel, text) => ev(([s, t]) => {
    const e = [...document.querySelectorAll(s)].find((x) => (t ? x.textContent.trim() === t : true));
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  }, [sel, text]);
  const press = async (sel, text) => { const p = await at(sel, text); if (p) await click(...p); await wait(300); return !!p; };
  const openMenu = async () => {
    await open(`${base}/gate/oracle-turn-1040`); await windowFocus(true);
    await until(async () => !!(await at('button[aria-label^="Open account menu"]')), 15000, 'the oracle scene').catch(() => {});
    return press('button[aria-label^="Open account menu"]');
  };

  const pressed = await openMenu();
  const before = await look();
  precondition('the oracle scene is up, the account menu open, no dialog', pressed && before.menu && before.dialog.length === 0, before);

  await press('[role=menuitem]', 'Upgrade plan');
  const near = await look();
  check('control: Upgrade plan (no target of its own) closes the account menu and opens no dialog', !near.menu && near.dialog.length === 0, near);

  await openMenu();
  const found = await press('[role=menuitem]', 'Get Grok Bot for mobile');
  const after = await look();
  check('Get Grok Bot for mobile opens the "Grok Bot on your phone" dialog, as the oracle (oracle-get-mobile; control: none before the click)',
    found && !after.menu && after.dialog.length === 1 && after.dialog[0] === 'Grok Bot on your phone', { found, ...after });
}
