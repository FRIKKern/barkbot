// The details panel's close and open, held to traces/2026-11-08-feel-panel.json (task-
// aa111a74d3a95bb4, item F3). At 1040x760 the oracle's panel goes 320 -> 0 on Close and 0 -> 320 on
// open, a width transition of 300 ms on cubic-bezier(0.2, 0, 0, 1). details.css and base.css
// (--ease-panel) copy it, but until this rule nothing read the trace, so a change to the duration or
// the curve passed every gate.
// What the rule reads: the panel's computed transition for width, and its width sampled every frame
// from before the press to past the end (armed in the page before the click, so the first frames are
// in it). The trace's sampled widths are not matched frame by frame: a hosted runner's frame times
// drift by more than the curve moves in one frame (190 -> 110 pt between 73 and 105 ms).
// The page is the oracle scene (/gate/oracle-turn-1040): the real Shell, panel open, 1040x760.
const TRACE = { width: 320, duration: '0.3s', easing: 'cubic-bezier(0.2, 0, 0, 1)' };

export async function panelCurve({ check, precondition, ev, open, base, click, wait, until, windowFocus }) {
  // The transition entry for width, from the computed lists (they pair up by index).
  const transition = () => ev(() => {
    const cs = getComputedStyle(document.querySelector('aside.details'));
    const props = cs.transitionProperty.split(', ');
    const i = props.indexOf('width');
    const at = (list) => {
      const items = list.split(/, (?![^(]*\))/); // commas inside cubic-bezier(...) stay
      return i < 0 ? null : items[i % items.length];
    };
    return { property: i < 0 ? null : 'width', duration: at(cs.transitionDuration), easing: at(cs.transitionTimingFunction) };
  });
  // Arm a per-frame sampler of the panel's width, then press, then read what it saw.
  const sampled = async (sel, ms = 500) => {
    await ev((ms) => {
      const el = document.querySelector('aside.details');
      const t0 = performance.now();
      window.__panelWidths = [];
      const step = () => {
        const t = performance.now() - t0;
        window.__panelWidths.push([Math.round(t), Math.round(el.getBoundingClientRect().width * 10) / 10]);
        if (t < ms) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, ms);
    const at = await ev((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
    if (at) await click(...at);
    await wait(ms + 150);
    const widths = await ev(() => window.__panelWidths);
    const visibility = await ev(() => getComputedStyle(document.querySelector('aside.details')).visibility);
    return { pressed: !!at, widths, visibility };
  };
  const monotone = (ws, dir) => ws.every(([, w], i) => i === 0 || (dir < 0 ? w <= ws[i - 1][1] : w >= ws[i - 1][1]));
  const between = (ws) => ws.filter(([, w]) => w > 0.5 && w < TRACE.width - 0.5).length;

  await open(`${base}/gate/oracle-turn-1040`); await windowFocus(true);
  await until(async () => (await ev(() => !!document.querySelector('aside.details button[aria-label="Close"]'))), 15000, 'the oracle scene').catch(() => {});
  const start = await ev(() => ({ size: [innerWidth, innerHeight], width: document.querySelector('aside.details').getBoundingClientRect().width, panel: document.querySelector('.app').dataset.panel }));
  precondition('the oracle scene is up 1040 wide (the trace: 1040x760) with the panel open at 320', start.size[0] === 1040 && start.panel === 'open' && Math.abs(start.width - TRACE.width) <= 0.5, start);

  const openT = await transition();
  const close = await sampled('aside.details button[aria-label="Close"]');
  const closedT = await transition();
  const cw = close.widths;
  check(`Close (feel-panel trace): the panel's width goes ${TRACE.width} -> 0 on a ${TRACE.duration} ${TRACE.easing} transition, never widening, with frames in between, and is hidden at the end (control: Close was pressed)`,
    close.pressed && openT.duration === TRACE.duration && openT.easing === TRACE.easing && closedT.duration === TRACE.duration && closedT.easing === TRACE.easing &&
    Math.abs(cw[0][1] - TRACE.width) <= 0.5 && cw.at(-1)[1] === 0 && monotone(cw, -1) && between(cw) >= 3 && close.visibility === 'hidden',
    { open: openT, closed: closedT, widths: cw, visibility: close.visibility });

  const reopen = await sampled('button[aria-label="View conversation details"]');
  const ow = reopen.widths;
  check(`Open again (feel-panel trace): the width goes 0 -> ${TRACE.width} on the same transition, never narrowing, with frames in between, and the panel shows (control: the header pill was pressed)`,
    reopen.pressed && Math.abs(ow[0][1]) <= 0.5 && Math.abs(ow.at(-1)[1] - TRACE.width) <= 0.5 && monotone(ow, 1) && between(ow) >= 3 && reopen.visibility === 'visible',
    { widths: ow, visibility: reopen.visibility });
}
