// The rail's command-key hints, held to traces/2026-11-09-cmd-hints.json (GrokBot 0.79.3; task-
// 22996e1edb3434d3). While Meta alone is held each bot tile shows its shortcut (⌘1, ⌘2) at the
// recorded box, in the recorded look; on keyup they are gone and the open bot is the same.
// Rail.tsx and rail.css build them from that trace, but until this rule nothing read it, so a hint
// that moved, changed its look or never showed passed every gate.
// The page is the oracle scene (/gate/oracle-turn-1040): the real Shell, two bots, Oracle open.
// The oracle was read on a 2x screen (its traces' viewports say 2), and a 0.5 px border reads back
// as 1 px on a 1x page, so the rule runs the page at 2x (set once the page is up, and read back as
// a precondition), the same size in CSS px, and puts it back.
const TRACE = {
  hints: [
    { text: '⌘1', box: [41.3, 53, 26.5, 19] },
    { text: '⌘2', box: [41.3, 133.5, 26.5, 19] },
  ],
  look: {
    color: 'rgba(245, 245, 245, 0.66)',
    'font-size': '11px',
    'font-weight': '425',
    'line-height': '16px',
    'letter-spacing': '0.11px',
    'background-color': 'rgb(14, 14, 14)',
    'border-radius': '4px',
    // The trace's border is 0.5px solid rgba(245, 245, 245, 0.04). Its width is not judged: at 2x
    // (read back as devicePixelRatio 2) this page's 0.5px border reads back 1px (run 44260547175),
    // so a width check here fails on the reading, not the hint. Style and colour are judged.
    border: 'solid rgba(245, 245, 245, 0.04)',
    'box-shadow': 'rgb(14, 14, 14) 0px 0px 0px 2px',
    padding: '1px 4px',
    opacity: '1',
  },
};
const TOL = 1; // pt per edge, as Gate A

export async function cmdHints({ check, precondition, ev, open, base, wait, until, windowFocus, page }) {
  const meta = async (type) => {
    await page.send('Input.dispatchKeyEvent', type === 'down'
      ? { type: 'rawKeyDown', key: 'Meta', code: 'MetaLeft', windowsVirtualKeyCode: 91, modifiers: 4 }
      : { type: 'keyUp', key: 'Meta', code: 'MetaLeft', windowsVirtualKeyCode: 91, modifiers: 0 });
    await wait(150);
  };
  // Every hint on the page with its box and the trace's look keys, read as the oracle's recorder
  // read them (shorthands from their longhands, top edge for the border).
  const hints = () => ev(() => [...document.querySelectorAll('.rail .rail-hint')].map((h) => {
    const r = h.getBoundingClientRect();
    const cs = getComputedStyle(h);
    return {
      text: h.textContent.trim(),
      box: [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 10) / 10),
      look: {
        color: cs.color,
        'font-size': cs.fontSize,
        'font-weight': cs.fontWeight,
        'line-height': cs.lineHeight,
        'letter-spacing': cs.letterSpacing,
        'background-color': cs.backgroundColor,
        'border-radius': cs.borderTopLeftRadius,
        border: `${cs.borderTopStyle} ${cs.borderTopColor}`,
        borderWidth: cs.borderTopWidth,
        'box-shadow': cs.boxShadow,
        padding: `${cs.paddingTop} ${cs.paddingRight}`,
        opacity: cs.opacity,
      },
    };
  }));
  const active = () => ev(() => document.querySelector('.convo-head [role=heading]')?.textContent.trim() ?? null);

  try {
    await open(`${base}/gate/oracle-turn-1040`); await windowFocus(true);
    await until(async () => (await ev(() => document.querySelectorAll('.rail .rail-tile').length >= 2)), 15000, 'the oracle scene').catch(() => {});
    // 2x after the page is up (a navigation can leave the page at the window's own ratio), then read
    // back what the page sees, so a detail line says which ratio a border width was read at.
    const size = await ev(() => [innerWidth, innerHeight]);
    await page.send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 2, mobile: false });
    await wait(200);
    const dpr = await ev(() => devicePixelRatio);
    const was = await active();
    const before = await hints();
    precondition('the oracle scene is up at 2x, Oracle is open, and no hint shows', dpr === 2 && was === 'Oracle' && before.length === 0, { dpr, size, was, before });

    await meta('down');
    const held = await hints();
    const heldActive = await active();
    await meta('up');
    const after = await hints();
    const afterActive = await active();

    const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= TOL);
    const boxes = held.length === 2 && TRACE.hints.every((t, i) => held[i]?.text === t.text && near(held[i].box, t.box));
    check('Meta held (cmd-hints trace): the rail shows ⌘1 and ⌘2, each at its recorded box within 1 pt (control: no hint before)',
      boxes, { held: held.map(({ text, box }) => ({ text, box })), want: TRACE.hints });
    const off = held.flatMap((h) => Object.entries(TRACE.look).filter(([k, v]) => h.look[k] !== v).map(([k, v]) => `${h.text} ${k}: ${h.look[k]} (trace ${v})`));
    check('Meta held: each hint has the recorded look (colour, font, background, radius, border style and colour, ring, padding, opacity)',
      held.length === 2 && off.length === 0, { dpr: await ev(() => devicePixelRatio), borderTopWidth: held.map((h) => h.look.borderWidth), off });
    check('Meta let go: the hints are gone, and Oracle is still the open bot (the trace: the active bot stayed Oracle)',
      after.length === 0 && heldActive === was && afterActive === was, { after, heldActive, afterActive });
  } finally {
    await page.send('Emulation.clearDeviceMetricsOverride');
  }
}
