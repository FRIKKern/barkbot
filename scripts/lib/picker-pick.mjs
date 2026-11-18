// A pick in the Voice chat card's pickers changes its row (task-d2fde20bf4539af1, item N4).
// Before this, a pick only closed the picker: the overlay host passed onPick={close}, so the value
// was dropped and the row kept what it had. Nothing caught it: Gate A holds each picker open on the
// captured pick, and the keys rule (overlay-keys.mjs) closes the pickers with Escape.
// The page is the oracle scene (/gate/oracle-turn-1040): the real Shell, the pickers opened from
// their rows by a real click, an option picked by a real click.
const ROWS = ['Voice', 'Speed', 'Language'];

export async function pickerPick({ check, precondition, ev, open, base, click, wait, until, windowFocus, page }) {
  const press = async (k, code) => {
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: code });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code });
    await wait(150);
  };
  const values = () => ev((rows) => Object.fromEntries(rows.map((r) => [r, document.querySelector(`[role=combobox][aria-label="${r}"]`)?.textContent.trim() ?? null])), ROWS);
  const shown = () => ev(() => document.querySelector('.overlay')?.getAttribute('data-overlay') ?? null);
  // The options as the open listbox shows them, and which one is checked.
  const listed = () => ev(() => {
    const opts = [...document.querySelectorAll('.overlay [role=option]')];
    const text = (o) => (o.querySelector('.option-text div') ?? o).textContent.trim();
    return { options: opts.map(text), checked: opts.filter((o) => o.getAttribute('aria-selected') === 'true').map(text) };
  });
  const clickOn = async (sel) => {
    const at = await ev((s) => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
    if (at) await click(...at);
    await wait(250);
    return !!at;
  };

  await open(`${base}/gate/oracle-turn-1040`); await windowFocus(true);
  await until(async () => (await ev(() => !!document.querySelector('[role=combobox][aria-label="Voice"]'))), 15000, 'the oracle scene').catch(() => {});
  const start = await values();
  precondition('the oracle scene shows the Voice chat card with a value in each row and no overlay open', ROWS.every((r) => start[r]) && (await shown()) === null, { start, overlay: await shown() });

  let want = { ...start };
  for (const row of ROWS) {
    await clickOn(`[role=combobox][aria-label="${row}"]`);
    const before = await listed();
    // The option two below the checked one (or the first, at the end): never the one already picked.
    const at = before.options.indexOf(before.checked[0]);
    const choice = before.options[(at + 2) % before.options.length];
    await ev((c) => [...document.querySelectorAll('.overlay [role=option]')].find((o) => (o.querySelector('.option-text div') ?? o).textContent.trim() === c)?.setAttribute('data-test-choice', ''), choice);
    await clickOn('.overlay [data-test-choice]');
    const closed = (await shown()) === null;
    const now = await values();
    want = { ...want, [row]: choice };
    await clickOn(`[role=combobox][aria-label="${row}"]`);
    const again = await listed();
    await press('Escape', 27);
    const r = { row, opened: before.checked, choice, closed, now, reopened: again.checked };
    check(`${row}: picking ${choice} closes the picker and the ${row} row says ${choice}; reopened, the picker checks ${choice}; the other rows keep their values (control: it opened with ${before.checked[0]} checked, the row's value)`,
      before.checked.length === 1 && before.checked[0] === start[row] && choice !== start[row] && closed && JSON.stringify(now) === JSON.stringify(want) && JSON.stringify(again.checked) === JSON.stringify([choice]), r);
    start[row] = choice;
  }
}
