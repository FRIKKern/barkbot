// The details panel's close and open, held to traces/2026-11-08-feel-panel.json (task-
// aa111a74d3a95bb4, item F3). At 1040x760 the oracle's panel goes 320 -> 0 on Close and 0 -> 320 on
// open, a width transition of 300 ms on cubic-bezier(0.2, 0, 0, 1). details.css and base.css
// (--ease-panel) copy it, but until this rule nothing read the trace, so a change to the duration or
// the curve passed every gate.
// What the rule reads: the panel's computed transition for width (duration, easing, delay), and its
// width sampled every frame from before the press until it settles (armed in the page before the
// click, times taken from the press as the page saw it). Time is judged one-sided: the target no
// sooner than +250 ms (the trace: about 300) and by +500. The trace's mid-curve widths are not
// matched to times: the transition starts at the first style recalc after the click, and a stalled
// frame there shifts the whole curve (80 ms stalls are seen on hosted runners).
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
    return { property: i < 0 ? null : 'width', duration: at(cs.transitionDuration), easing: at(cs.transitionTimingFunction), delay: at(cs.transitionDelay) };
  });
  // Arm a per-frame sampler of the panel's width, then press, then read what it saw. The page
  // stamps the press itself (a capture click listener), and every time is taken from it. The
  // sampler stops once the width has sat at the target for 3 frames, or at 1500 ms: it must settle
  // ON the target, since a late start still sits at the start width.
  const sampled = async (sel, target) => {
    await ev((target) => {
      const el = document.querySelector('aside.details');
      window.__panelPress = null; window.__panelDone = false; window.__panelWidths = [];
      document.addEventListener('click', () => { window.__panelPress ??= performance.now(); }, { capture: true, once: true });
      const t0 = performance.now();
      let at = 0;
      const step = () => {
        const now = performance.now();
        const w = Math.round(el.getBoundingClientRect().width * 10) / 10;
        window.__panelWidths.push([now, w]);
        at = window.__panelPress !== null && Math.abs(w - target) <= 0.5 ? at + 1 : 0;
        if (at >= 3 || now - t0 >= 1500) { window.__panelDone = true; return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, target);
    const at = await ev((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
    if (at) await click(...at);
    await until(() => ev(() => window.__panelDone), 2500, 'the panel settles').catch(() => {});
    const { press, raw } = await ev(() => ({ press: window.__panelPress, raw: window.__panelWidths }));
    const widths = press === null ? [] : raw.map(([t, w]) => [Math.round(t - press), w]);
    const visibility = await ev(() => getComputedStyle(document.querySelector('aside.details')).visibility);
    // One-sided times, which a stalled frame cannot turn red (a stall only makes a sample later):
    // reached = the first sample at the target; late = the first sample at or after +500.
    const reached = widths.find(([t, w]) => t >= 0 && Math.abs(w - target) <= 0.5)?.[0] ?? null;
    const late = widths.find(([t]) => t >= 500);
    const settledBy500 = late ? Math.abs(late[1] - target) <= 0.5 : reached !== null && reached < 500;
    return { pressed: !!at && press !== null, widths, visibility, reached, settledBy500 };
  };
  const monotone = (ws, dir) => ws.every(([, w], i) => i === 0 || (dir < 0 ? w <= ws[i - 1][1] : w >= ws[i - 1][1]));
  const between = (ws) => ws.filter(([, w]) => w > 0.5 && w < TRACE.width - 0.5).length;

  await open(`${base}/gate/oracle-turn-1040`); await windowFocus(true);
  await until(async () => (await ev(() => !!document.querySelector('aside.details button[aria-label="Close"]'))), 15000, 'the oracle scene').catch(() => {});
  const start = await ev(() => ({ size: [innerWidth, innerHeight], width: document.querySelector('aside.details').getBoundingClientRect().width, panel: document.querySelector('.app').dataset.panel }));
  precondition('the oracle scene is up 1040 wide (the trace: 1040x760) with the panel open at 320', start.size[0] === 1040 && start.panel === 'open' && Math.abs(start.width - TRACE.width) <= 0.5, start);

  // The trace reaches 0 (close) and 320 (open) at about 300 ms after the press, and nothing in it
  // is delayed (its transitions list none; the width moves by 41 ms).
  const timed = (r) => r.reached !== null && r.reached >= 250 && r.settledBy500;
  const curve = (t) => t.duration === TRACE.duration && t.easing === TRACE.easing && t.delay === '0s';

  const close = await sampled('aside.details button[aria-label="Close"]', 0);
  const closedT = await transition();
  const cw = close.widths;
  check(`Close (feel-panel trace): the panel's width goes ${TRACE.width} -> 0 on a ${TRACE.duration} ${TRACE.easing} transition with no delay, never widening, with frames in between; it reaches 0 no sooner than 250 ms after the press and by 500 ms, and is hidden at the end (control: Close was pressed)`,
    close.pressed && curve(closedT) && cw.length > 0 && Math.abs(cw[0][1] - TRACE.width) <= 0.5 && cw.at(-1)[1] === 0 && monotone(cw, -1) && between(cw) >= 3 && timed(close) && close.visibility === 'hidden',
    { closed: closedT, reached: close.reached, settledBy500: close.settledBy500, widths: cw, visibility: close.visibility });

  const reopen = await sampled('button[aria-label="View conversation details"]', TRACE.width);
  const openT = await transition();
  const ow = reopen.widths;
  check(`Open again (feel-panel trace): the width goes 0 -> ${TRACE.width} on a ${TRACE.duration} ${TRACE.easing} transition with no delay, never narrowing, with frames in between; it reaches ${TRACE.width} no sooner than 250 ms after the press and by 500 ms, and the panel shows (control: the header pill was pressed)`,
    reopen.pressed && curve(openT) && ow.length > 0 && Math.abs(ow[0][1]) <= 0.5 && Math.abs(ow.at(-1)[1] - TRACE.width) <= 0.5 && monotone(ow, 1) && between(ow) >= 3 && timed(reopen) && reopen.visibility === 'visible',
    { open: openT, reached: reopen.reached, settledBy500: reopen.settledBy500, widths: ow, visibility: reopen.visibility });
}
