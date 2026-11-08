// Record one oracle turn (H3): run a fixed recipe, then watch the window
// change over time. Writes traces/<id>.json with what appeared, in what
// order, how each part faded and moved, and how the transcript scrolled.
// Text inside bubbles is stored as a length; short status labels as text.
// Usage: node scripts/oracle/record.mjs <recipe> [--id name] [--max 90] [--quiet 6]
import { writeFileSync, mkdirSync } from 'node:fs';
import { connect } from './cdp.mjs';
import { run, activeBot } from './recipes.mjs';
import { path } from '../lib/data.mjs';

const args = process.argv.slice(2);
const recipe = args[0];
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const id = opt('id', `${new Date().toISOString().slice(0, 10)}-${recipe}`);
const maxS = Number(opt('max', 90)), quietS = Number(opt('quiet', 6));

const page = await connect();
// Every CSS transition, CSS animation and Web Animation the engine starts, with its timing.
// Each one is resolved the moment it starts, before its node can leave the page.
const anims = [];
const pending = [];
const tStart = { wall: 0 };
const READ = `function () {
  const e = this.effect, el = e && e.target;
  const kf = e ? e.getKeyframes().map((k) => { const o = {}; for (const [p, v] of Object.entries(k)) if (!['composite', 'computedOffset'].includes(p)) o[p] = typeof v === 'string' ? v.slice(0, 120) : v; return o; }) : [];
  const tm = e ? e.getTiming() : {};
  const who = el ? (el.nodeType === 1 ? el : el.parentElement) : null;
  const cs = who ? getComputedStyle(who) : null;
  const look = cs ? Object.fromEntries(['color', 'background-image', 'background-size', 'background-clip', '-webkit-text-fill-color', 'transform-origin']
    .map((k) => [k, cs.getPropertyValue(k).slice(0, 200)]).filter(([, v]) => v && v !== 'none' && v !== 'auto')) : undefined;
  return { keyframes: kf, look, timing: { duration: tm.duration, delay: tm.delay, easing: tm.easing, iterations: tm.iterations === Infinity ? 'infinite' : tm.iterations, fill: tm.fill },
           pseudo: e && e.pseudoElement || undefined, target: who && window.__oracle ? window.__oracle.describe(who) : null };
}`;
page.on('Animation.animationStarted', ({ animation: a }) => {
  // The engine's own timing, kept even when the node leaves before it can be resolved.
  const rec = { wall: Date.now(), type: a.type, name: a.name || undefined,
    timing: { duration: a.source?.duration, delay: a.source?.delay, easing: a.source?.easing, iterations: a.source?.iterations } };
  anims.push(rec);
  pending.push(page.send('Animation.resolveAnimation', { animationId: a.id })
    .then(({ remoteObject }) => page.send('Runtime.callFunctionOn', { objectId: remoteObject.objectId, functionDeclaration: READ, returnByValue: true }))
    .then((r) => { const v = r.result.value; Object.assign(rec, v, { timing: { ...rec.timing, ...Object.fromEntries(Object.entries(v.timing || {}).filter(([, x]) => x !== undefined)) } }); })
    .catch((err) => { rec.error = String(err.message || err).slice(0, 80); }));
});
await page.send('Animation.enable');
await page.send('DOM.enable');
await page.evaluate(() => {
  if (window.__oracle) window.__oracle.stop();
  const t0 = performance.now();
  const now = () => Math.round((performance.now() - t0) * 10) / 10;
  const events = [], samples = [], scroll = [];
  const seen = new WeakSet();
  let tracked = [];
  const kindOf = (el) => {
    const row = el.closest?.('[data-rowkey]');
    const art = el.matches?.('[role=article][data-role]') ? el : el.querySelector?.('[role=article][data-role]');
    if (el.closest?.('aside[aria-label="Conversation details"]')) return 'panel';
    if (el.closest?.('aside[aria-label="Bots"]')) return 'rail';
    if (art) return `bubble:${art.dataset.role}`;
    if (row && el.querySelector?.('time') && !el.querySelector('[role=article]')) return 'row';
    if (el.closest?.('main')) return 'main';
    return 'other';
  };
  const describe = (el) => {
    const r = el.getBoundingClientRect();
    const inBubble = !!el.closest('[role=article][data-role]');
    const t = (el.innerText || '').trim();
    const short = !inBubble && t.length && t.length <= 48 && !t.includes('\n');
    return {
      tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || undefined,
      label: el.getAttribute('aria-label')?.slice(0, 60) || undefined,
      data: Object.keys(el.dataset).length ? Object.keys(el.dataset).join(' ') : undefined,
      box: [r.x, r.y, r.width, r.height].map(Math.round), text: short ? t : undefined, textLength: t.length || undefined,
    };
  };
  const scroller = () => [...document.querySelectorAll('main div')].find((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight);
  const track = (el, n) => tracked.push({ el, n, until: performance.now() + 1500 });
  const mo = new MutationObserver((list) => {
    const t = now();
    for (const m of list) {
      if (m.type === 'childList') {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1 || seen.has(node)) continue;
          seen.add(node);
          const r = node.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) continue;
          const n = events.length;
          events.push({ t, type: 'add', kind: kindOf(node), ...describe(node) });
          track(node, n);
        }
        for (const node of m.removedNodes) if (node.nodeType === 1) events.push({ t, type: 'remove', kind: kindOf(m.target), tag: node.tagName.toLowerCase(), label: node.getAttribute?.('aria-label')?.slice(0, 60) });
      } else if (m.type === 'characterData') {
        const el = m.target.parentElement;
        if (!el || el.closest('[role=article][data-role]')) continue;
        const txt = (el.innerText || '').trim();
        if (txt.length <= 48) events.push({ t, type: 'text', kind: kindOf(el), text: txt });
      } else if (m.type === 'attributes' && ['aria-busy', 'data-state', 'aria-hidden', 'aria-label'].includes(m.attributeName)) {
        events.push({ t, type: 'attr', kind: kindOf(m.target), name: m.attributeName, value: m.target.getAttribute(m.attributeName)?.slice(0, 60), tag: m.target.tagName.toLowerCase() });
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-busy', 'data-state', 'aria-hidden', 'aria-label'] });
  let raf, lastScroll = null;
  const frame = () => {
    const t = now(), pn = performance.now();
    const sc = scroller();
    if (sc && sc.scrollTop !== lastScroll) { scroll.push([t, Math.round(sc.scrollTop), sc.scrollHeight]); lastScroll = sc.scrollTop; }
    tracked = tracked.filter((x) => {
      if (pn > x.until || !x.el.isConnected) return false;
      const cs = getComputedStyle(x.el);
      const r = x.el.getBoundingClientRect();
      samples.push([x.n, t, Number(cs.opacity), cs.transform === 'none' ? null : cs.transform, Math.round(r.y)]);
      return true;
    });
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  window.__oracle = { events, samples, scroll, now, describe: (el) => ({ kind: kindOf(el), ...describe(el) }), stop: () => { mo.disconnect(); cancelAnimationFrame(raf); } };
});

const bot = await activeBot(page);
const started = Date.now();
tStart.wall = started;
await run(page, recipe);
console.error(`recording "${recipe}" in bot "${bot}" (max ${maxS}s, stops after ${quietS}s quiet)`);
let lastCount = -1, quietSince = Date.now();
while (Date.now() - started < maxS * 1000) {
  await new Promise((ok) => setTimeout(ok, 500));
  const c = await page.evaluate(() => window.__oracle.events.length + window.__oracle.scroll.length);
  if (c !== lastCount) { lastCount = c; quietSince = Date.now(); }
  else if (Date.now() - quietSince > quietS * 1000 && Date.now() - started > 3000) break;
}
const data = await page.evaluate(() => { window.__oracle.stop(); const { events, samples, scroll } = window.__oracle; return { events, samples, scroll }; });
await Promise.all(pending);
for (const a of anims) { a.t = a.wall - tStart.wall; delete a.wall; }
data.animations = anims;
const trace = {
  id, recipe, bot, captured: new Date().toISOString(), engine: 'electron', durationS: (Date.now() - started) / 1000,
  viewport: await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]),
  note: 'times in ms from the gesture; samples are [eventIndex, t, opacity, transform, y]; scroll is [t, scrollTop, scrollHeight]',
  ...data,
};
mkdirSync(path('traces'), { recursive: true });
writeFileSync(path('traces', `${id}.json`), JSON.stringify(trace, null, 1) + '\n');
console.log(`traces/${id}.json: ${data.events.length} events, ${anims.length} animations, ${data.samples.length} samples, ${data.scroll.length} scroll steps`);
page.close();
