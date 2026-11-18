// New Bot hides the rest of the window while it is open (task-1f469ccf6966e2fb, item N5).
// traces/2026-11-08-new-bot.json: 317.2 ms after the click the dialog appears and, in the same
// frame, the oracle (Floating UI) sets aria-hidden="true" on the rail's aside, the main column, its
// header and the panel's aside. The trace ends with the dialog still open, so what happens on close
// is not recorded, and the rule asks nothing about it.
// The page is the oracle scene (/gate/oracle-turn-1040): the real Shell, the panel open, New Bot
// opened by a real click on its button.
const REGIONS = {
  rail: 'aside.rail',
  main: 'main.convo',
  header: 'main.convo > header',
  panel: 'aside.details',
};

export async function newBotHides({ check, precondition, ev, open, base, click, wait, until, windowFocus }) {
  // For each region: is it under aria-hidden="true" (itself or an ancestor)? And the dialog.
  const hidden = () => ev((regions) => {
    const under = (el) => !!el?.closest('[aria-hidden="true"]');
    const out = Object.fromEntries(Object.entries(regions).map(([k, s]) => [k, document.querySelector(s) ? under(document.querySelector(s)) : null]));
    const dialog = document.querySelector('.overlay [role=dialog]');
    out.dialog = dialog ? under(dialog) : null;
    return out;
  }, REGIONS);
  const clickOn = async (sel) => {
    const at = await ev((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
    if (at) await click(...at);
    await wait(300);
    return !!at;
  };

  await open(`${base}/gate/oracle-turn-1040`); await windowFocus(true);
  await until(async () => (await ev(() => !!document.querySelector('button[aria-label="New Bot"]'))), 15000, 'the oracle scene').catch(() => {});
  const before = await hidden();
  precondition('the oracle scene is up with the panel open, no dialog, and nothing under aria-hidden',
    before.rail === false && before.main === false && before.header === false && before.panel === false && before.dialog === null, before);

  await clickOn('button[aria-label="New Bot"]');
  const during = await hidden();
  check('New Bot open (new-bot trace, 317.2 ms): the rail, the main column, its header and the panel are each under aria-hidden="true", and the dialog is not (control: the dialog is up)',
    during.dialog === false && during.rail === true && during.main === true && during.header === true && during.panel === true, during);
}
