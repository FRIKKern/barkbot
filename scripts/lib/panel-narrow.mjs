// Below 800 Grok 1.3.0 draws no details panel (oracle-main-720, -790: none; oracle-main-800: 288),
// and it comes back at 800 (Shell useNarrow, styles/details.css). A press on View conversation
// details still opens it there, and Close hides it again.
// Control: at 800 the panel is drawn, 288 wide, without a press.
// The page is the oracle scene (/gate/oracle-turn-1040): the real Shell, the panel open.
export async function panelNarrow({ check, precondition, ev, open, base, click, wait, until, page }) {
  const size = (width) => page.send('Emulation.setDeviceMetricsOverride', { width, height: 760, deviceScaleFactor: 0, mobile: false });
  const look = () => ev(() => {
    const d = document.querySelector('aside.details');
    const pill = document.querySelector('button[aria-label="View conversation details"]');
    const r = d?.getBoundingClientRect();
    const p = pill?.getBoundingClientRect();
    return { width: r ? Math.round(r.width) : null, shown: d ? getComputedStyle(d).visibility === 'visible' : null, inert: d ? d.inert : null, expanded: pill?.getAttribute('aria-expanded') ?? null, pill: p ? [p.x + p.width / 2, p.y + p.height / 2] : null };
  });
  const settle = async (want) => { await until(async () => want(await look()), 3000, 'the panel').catch(() => {}); await wait(350); return look(); };

  try {
    await size(800);
    await open(`${base}/gate/oracle-turn-1040`);
    await until(async () => (await look()).pill !== null, 15000, 'the oracle scene').catch(() => {});
    const at800 = await settle((l) => l.width === 288);
    precondition('the oracle scene is up at 800 with the pill', at800.pill !== null, at800);
    check('control: at 800 the panel is drawn, 288 wide, open and not inert (oracle-main-800)', at800.shown && at800.width === 288 && at800.expanded === 'true' && at800.inert === false, at800);

    await size(720);
    const at720 = await settle((l) => l.expanded === 'false');
    check('at 720 no panel is drawn: none visible, none wide, inert, and the pill says it is closed (oracle-main-720, 1.3.0)', !at720.shown && at720.width === 0 && at720.inert === true && at720.expanded === 'false', at720);

    await click(...at720.pill);
    const opened = await settle((l) => l.expanded === 'true');
    check('at 720 a press on View conversation details opens the panel, 208 wide', opened.shown && opened.width === 208 && opened.expanded === 'true' && opened.inert === false, opened);

    await click(...opened.pill);
    const shut = await settle((l) => l.expanded === 'false');
    check('a second press closes it again', !shut.shown && shut.expanded === 'false', shut);

    await size(800);
    const back = await settle((l) => l.width === 288);
    check('widened to 800 the panel comes back, 288 wide, open', back.shown && back.width === 288 && back.expanded === 'true', back);
  } finally {
    await page.send('Emulation.clearDeviceMetricsOverride');
  }
}
