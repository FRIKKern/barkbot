// docs/images/hero.svg: the oracle window, rebuilt from measurements, playing one real turn.
// Geometry and colours: fixtures/hero/oracle-turn-1040-2026-11-08.json (every box, in oracle points).
// Text widths and line breaks: fixtures/text-metrics.json (our own words in the oracle's font).
// Motion: traces/2026-11-08-storage.json (order, times) and -say-hi*.json (curves, offsets).
// Ours, not the oracle's: the words, the typing, the hold and the loop reset. Art is stand-ins.
// Never edit the SVG by hand. `--stdout` prints instead of writing.
import { writeFileSync, readFileSync } from 'node:fs';
import { path } from './lib/data.mjs';
import * as copy from './lib/hero-copy.mjs';

// The hero draws the first captured turn (2026-11-08), kept frozen in fixtures/hero/: the gated
// fixtures/states/ copy is re-captured as the Oracle chat grows and Grok updates, and the picture
// would move with it (its first bubble sits under the time row, which a longer chat scrolls away).
const STATE = JSON.parse(readFileSync(path('fixtures', 'hero', 'oracle-turn-1040-2026-11-08.json'), 'utf8'));
const METRICS = JSON.parse(readFileSync(path('fixtures', 'text-metrics.json'), 'utf8'));
const [VW, VH] = STATE.viewport;

// ---------- the oracle, measured ----------
export const ORACLE = {
  source: 'fixtures/hero/oracle-turn-1040-2026-11-08.json, fixtures/text-metrics.json, traces/2026-11-08-storage.json, traces/2026-11-08-say-hi.json, traces/2026-11-08-mark.json',
  userIn: 0.44, workIn: 2.03, ackIn: 3.53, typing: 9.0, replyIn: 9.84, workOut: 9.95,   // s after send
  enter: { px: 12, ms: 240, ease: 'cubic-bezier(.23,1,.32,1)' },                      // bubbles slide, no fade
  work: { rowMs: 180, rowScale: 0.92, rowEase: 'cubic-bezier(.22,1,.36,1)', markMs: 340, markScale: 0.6, markEase: 'cubic-bezier(.34,1.56,.64,1)', labelMs: 180, labelDelay: 0.22, labelPx: 4, labelEase: 'cubic-bezier(.22,1,.36,1)' },
  // The working mark is the bot's own face, upright, 20 pt, centred at x 126 on the label's line.
  // It is never still: traces/2026-11-08-mark.json caught two moves, frame by frame.
  face: {
    size: 20, cx: 126,
    squash: { downS: 0.4, upS: 0.55, min: 0.33, ease: 'cubic-bezier(.22,1,.36,1)' },   // shrinks to a third, springs back
    tilt: { deg: -15, outS: 0.3, holdS: 0.2, backS: 0.35, ease: 'cubic-bezier(.65,0,.35,1)' }, // leans left, comes back
    firstS: 0.45,                                                                        // first move after the label lands
  },
  workExit: { ms: 140, scale: 0.92, ease: 'cubic-bezier(.22,1,.36,1)' },
  // background-position 200% -> -200% over a 200%-wide gradient, steps(60): the bright band
  // crosses left to right twice per cycle. Dim = 40% ink; peak ink at 60%, back to dim by 75%.
  shimmer: { cycleS: 2.2, steps: 60, stops: [[0, 0], [0.25, 0], [0.6, 1], [0.75, 0], [1, 0]], dim: 0.4 },
  sendIcon: { ms: 200, scale: 0.5, ease: 'cubic-bezier(.22,1,.36,1)' },
  focus: { ms: 150, rest: 0.1, on: 0.22 },
  sleep: { periodS: 2.4, zStagger: 0.8, rise: 12, zScale: 0.6, breathe: [0.85, 1.04] },
};
// ---------- ours ----------
export const TIMING = { loop: 24, focus: 0.6, typeStart: 1.0, send: 4.2, hold: 19.6, blur: 21.1 };
// Ours: the order and spacing of the face's moves (the oracle picks them; a turn shows one or two).
const FACE_MOVES = [['squash', 0], ['tilt', 1.9], ['squash', 3.8], ['tilt', 5.5]];
// Ours: the reset leaves gently, newest first.
const RESET = { s: 0.6, lift: 6, stagger: 0.1, ease: 'cubic-bezier(.65,0,.35,1)' };
const L = TIMING.loop;
const at = (k) => TIMING.send + ORACLE[k];
const EPS = 0.002;
const IN = 'cubic-bezier(.5,0,.75,0)';

// ---------- fixture lookups ----------
const byText = (t) => { const e = STATE.elements.find((x) => x.text === t); if (!e) throw new Error(`fixture has no "${t}"`); return e; };
const byLabel = (l) => { const e = STATE.elements.find((x) => x.label === l); if (!e) throw new Error(`fixture has no label "${l}"`); return e; };
const metric = (s) => { const m = METRICS.strings[s]; if (!m) throw new Error(`no text metric for "${s}": run node scripts/oracle/measure-text.mjs`); return m; };

// ---------- svg helpers (all units are oracle points) ----------
const f1 = (v) => Math.round(v * 100) / 100;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const INK = '245,245,245';
// The oracle's own face is lighter than the system face at the same number; this shift matches
// stroke weight by eye against the capture (425 reads as the system's 365).
const WEIGHT_SHIFT = 60;
const ink = (a = 1) => (a === 1 ? `rgb(${INK})` : `rgba(${INK},${a})`);
// Text centred in a line box, held to a measured width so a different font cannot drift.
function text(x, top, lh, s, { size = 15, weight = 425, fill = ink(), w, anchor, ls, cls = '' } = {}) {
  const y = top + lh / 2 + 0.36 * size;
  const fit = w ? ` textLength="${f1(w)}" lengthAdjust="spacing"` : '';
  return `<text x="${f1(x)}" y="${f1(y)}" font-size="${size}" font-weight="${weight - WEIGHT_SHIFT}" fill="${fill}"${anchor ? ` text-anchor="${anchor}"` : ''}${ls !== undefined ? ` letter-spacing="${ls}"` : ''}${fit}${cls ? ` class="${cls}"` : ''}>${esc(s)}</text>`;
}
const label = (e, opts = {}) => text(e.box[0], e.box[1], e.box[3], e.text, { size: parseFloat(e.style['font-size']), weight: Number(e.style['font-weight']), fill: e.style.color, w: e.box[2], ls: parseFloat(e.style['letter-spacing']), ...opts });
function rr(x, y, w, h, [a, b, c, d]) {
  return `M${f1(x + a)} ${f1(y)}H${f1(x + w - b)}A${b} ${b} 0 0 1 ${f1(x + w)} ${f1(y + b)}V${f1(y + h - c)}A${c} ${c} 0 0 1 ${f1(x + w - c)} ${f1(y + h)}H${f1(x + d)}A${d} ${d} 0 0 1 ${f1(x)} ${f1(y + h - d)}V${f1(y + a)}A${a} ${a} 0 0 1 ${f1(x + a)} ${f1(y)}Z`;
}
const pill = ([x, y, w, h], fill, stroke, sw = 0.5) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/>`;
// The bots' avatars are art we never copy: a plain tilted rounded square of the same size and grey.
const avatar = (cx, cy, size, fill = 'rgb(108,108,108)') => `<rect x="${f1(cx - size / 2)}" y="${f1(cy - size * 0.44)}" width="${f1(size)}" height="${f1(size * 0.88)}" rx="${f1(size * 0.2)}" fill="${fill}" transform="rotate(-14 ${f1(cx)} ${f1(cy)})"/>`;
const chevronR = (x, y) => `<path d="M${x - 2} ${y - 4}l4 4-4 4" class="glyph"/>`;
const chevronD = (x, y) => `<path d="M${x - 3} ${y - 1.5}l3 3 3-3" class="glyph"/>`;

// ---------- keyframe builder (loop timeline) ----------
const pct = (s) => `${((Math.min(Math.max(s, 0), L) / L) * 100).toFixed(3)}%`;
let n = 0;
const css = [];
function anim(points, base) {
  const name = `m${++n}`;
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  const fr = [];
  if (pts[0][0] > 0) fr.push(`0%{${pts[0][1]}}`);
  for (const [t, d, e] of pts) fr.push(`${pct(t)}{${d}${e ? `;animation-timing-function:${e}` : ''}}`);
  if (pts.at(-1)[0] < L) fr.push(`100%{${pts.at(-1)[1]}}`);
  css.push(`.${name}{${base};animation:${name} ${L}s linear infinite}@keyframes ${name}{${fr.join('')}}`);
  return name;
}
function ambient(period, frames, base, delay = 0, ease = 'linear') {
  if (Math.abs(L / period - Math.round(L / period)) > 1e-9) throw new Error(`period ${period}s does not divide the ${L}s loop`);
  const name = `m${++n}`;
  css.push(`.${name}{${base};animation:${name} ${period}s ${ease} ${delay}s infinite}@keyframes ${name}{${frames}}`);
  return name;
}
const HID = 'opacity:0', VIS = 'opacity:1';
const FB = 'transform-box:fill-box;transform-origin:center';
const shown = (a, b, base = HID) => anim([[0, HID], [a - EPS, HID], [a, VIS], [b - EPS, VIS], [b, HID]], base);
const ty = (v) => `transform:translateY(${f1(v)}px)`;
// Present from a to the reset; enters with the oracle's slide (no fade), leaves with our reset fade.
const slideIn = (a, x) => anim([[0, `opacity:0;${ty(0)}`], [a - EPS, `opacity:0;${ty(0)}`], [a, `opacity:1;${ty(ORACLE.enter.px)}`, ORACLE.enter.ease],
  [a + ORACLE.enter.ms / 1000, `opacity:1;${ty(0)}`], [x, `opacity:1;${ty(0)}`, RESET.ease], [x + RESET.s, `opacity:0;${ty(-RESET.lift)}`]], `opacity:1;${ty(0)}`);

// ---------- transcript (top-aligned, as a short conversation is) ----------
const time = byText(STATE.elements.find((e) => e.tag === 'time').text);   // the oracle's time row: box and type
const BUBBLE = { padX: 12, padY: 7, lh: 22, max: 480, gapRun: 4, gap: 16 };
const msg = (side, s, id, t) => {
  const m = metric(s);
  const w = m.lines.length > 1 ? BUBBLE.max : f1(m.width + BUBBLE.padX * 2);
  return { side, s, id, t, m, w, h: BUBBLE.padY * 2 + BUBBLE.lh * m.lines.length };
};
const rows = [
  msg('bot', copy.GREETING, 'greet', null),
  msg('user', copy.DRAFT, 'user', at('userIn')),
  msg('bot', copy.ACK, 'ack', at('ackIn')),
  msg('bot', copy.ANSWER, 'reply', at('replyIn')),
];
let y = time.box[1] + time.box[3] + 12;            // first bubble: 12 below the time row (116 measured)
rows.forEach((r, i) => { if (i) y += r.side === rows[i - 1].side ? BUBBLE.gapRun : BUBBLE.gap; r.y = y; y += r.h; });
const R = Object.fromEntries(rows.map((r) => [r.id, r]));
const run = (a, b) => a && b && a.side === b.side;
function corners(i, withNext = true) {
  const r = rows[i], prev = run(rows[i - 1], r), next = withNext && run(r, rows[i + 1]);
  return r.side === 'bot' ? [prev ? 6 : 18, 18, 18, next ? 6 : 18] : [18, prev ? 6 : 18, next ? 6 : 18, 18];
}
function bubble(r, i) {
  const x = r.side === 'user' ? 704 - r.w : 104;
  const fill = r.side === 'user' ? ink(0.18) : ink(0.04);
  const shape = (c) => `<path d="${rr(x, r.y, r.w, r.h, c)}" fill="${fill}"/><path d="${rr(x, r.y, r.w, r.h, c)}" fill="url(#${r.side === 'user' ? 'sheenU' : 'sheen'})"/>`;
  // The short reply stands alone until the answer joins it; then its bottom-left corner tightens to 6.
  const body = r.id === 'ack'
    ? `<g class="${shown(0, at('replyIn'))}">${shape(corners(i, false))}</g><g class="${shown(at('replyIn'), L + 1, VIS)}">${shape(corners(i))}</g>`
    : shape(corners(i));
  const lines = r.m.lines.map((l, k) => text(x + BUBBLE.padX, r.y + BUBBLE.padY + k * BUBBLE.lh, BUBBLE.lh, l, { w: r.m.lineWidths[k], ls: 0.15 })).join('');
  const inner = body + lines;
  return r.t === null ? inner : `<g class="${slideIn(r.t, TIMING.hold + RESET.stagger * (r.id === 'user' ? 2 : r.id === 'ack' ? 1 : 0))}">${inner}</g>`;
}

// ---------- the working line ----------
// Its row sits 16 below the last bubble, 35 tall; mark centre at +15.5, label at x 149 (say-hi trace).
const workTop = (afterId) => R[afterId].y + R[afterId].h + 16;
let clipN = 0;
const clips = [];
function workingLine() {
  const w = ORACLE.work, t0 = at('workIn'), tOut = at('workOut'), tGone = tOut + ORACLE.workExit.ms / 1000;
  const top0 = workTop('user');
  // The row moves at once when a bubble lands above it, as the oracle's layout does.
  const move = anim([[0, ty(0)], [at('ackIn') - EPS, ty(0)], [at('ackIn'), ty(workTop('ack') - top0)], [at('replyIn') - EPS, ty(workTop('ack') - top0)], [at('replyIn'), ty(workTop('reply') - top0)], [tGone + 0.05, ty(workTop('reply') - top0)], [tGone + 0.06, ty(0)]], ty(0));
  const row = anim([[0, `opacity:0;transform:scale(${w.rowScale})`], [t0, `opacity:0;transform:scale(${w.rowScale})`, w.rowEase], [t0 + w.rowMs / 1000, 'opacity:1;transform:scale(1)'],
    [tOut, 'opacity:1;transform:scale(1)', ORACLE.workExit.ease], [tGone, `opacity:0;transform:scale(${ORACLE.workExit.scale})`]], `opacity:0;${FB}`);
  const mark = anim([[0, `opacity:0;transform:scale(${w.markScale})`], [t0, `opacity:0;transform:scale(${w.markScale})`, w.markEase], [t0 + w.markMs / 1000, 'opacity:1;transform:scale(1)']], `opacity:1;${FB}`);
  const lab = (s, from, to) => {
    const m = metric(s), lx = 149, ltop = top0 + 6, lh = 22;
    const id = `c${++clipN}`;
    clips.push(`<clipPath id="${id}">${text(lx, ltop, lh, s, { w: m.width, ls: 0.15 })}</clipPath>`);
    const a = from + (from === t0 ? w.labelDelay : 0);
    const show = anim([[0, `opacity:0;${ty(w.labelPx)}`], [a, `opacity:0;${ty(w.labelPx)}`, w.labelEase], [a + w.labelMs / 1000, `opacity:1;${ty(0)}`], [to - EPS, `opacity:1;${ty(0)}`], [to, `opacity:0;${ty(0)}`]], HID);
    // The bright band: a gradient twice the label's width, tiled, sliding one tile per half cycle.
    const W = m.width, half = ORACLE.shimmer.cycleS / 2, st = `steps(${ORACLE.shimmer.steps / 2},end)`;
    const pts = [[0, 'transform:translateX(0)']];
    for (let s0 = a; s0 < to; s0 += half) pts.push([s0, 'transform:translateX(0)', st], [Math.min(s0 + half, to) - EPS, `transform:translateX(${f1(2 * W * Math.min(1, (to - s0) / half))}px)`]);
    pts.push([to, 'transform:translateX(0)']);
    const slide = anim(pts, 'transform:translateX(0)');
    const band = `<g class="${slide}"><rect x="${f1(lx - 2 * W)}" y="${ltop}" width="${f1(2 * W)}" height="${lh}" fill="url(#band)"/><rect x="${lx}" y="${ltop}" width="${f1(2 * W)}" height="${lh}" fill="url(#band)"/></g>`;
    return `<g class="${show}">${text(lx, ltop, lh, s, { w: m.width, ls: 0.15, fill: ink(ORACLE.shimmer.dim) })}<g clip-path="url(#${id})">${band}</g></g>`;
  };
  // The face: one group squashes, one tilts, each driven by the move list.
  const fc = ORACLE.face, sq = fc.squash, tl = fc.tilt, start = t0 + w.labelDelay + fc.firstS;
  const squashPts = [[0, 'transform:scale(1)']], tiltPts = [[0, 'transform:rotate(0deg)']];
  for (const [kind, off] of FACE_MOVES) {
    const s0 = start + off;
    if (kind === 'squash' && s0 + sq.downS + sq.upS < tOut) squashPts.push([s0, 'transform:scale(1)', sq.ease], [s0 + sq.downS, `transform:scale(${sq.min})`, sq.ease], [s0 + sq.downS + sq.upS, 'transform:scale(1)']);
    if (kind === 'tilt' && s0 + tl.outS + tl.holdS + tl.backS < tOut) tiltPts.push([s0, 'transform:rotate(0deg)', tl.ease], [s0 + tl.outS, `transform:rotate(${tl.deg}deg)`], [s0 + tl.outS + tl.holdS, `transform:rotate(${tl.deg}deg)`, tl.ease], [s0 + tl.outS + tl.holdS + tl.backS, 'transform:rotate(0deg)']);
  }
  const squash = anim(squashPts, `transform:scale(1);${FB}`), tilt = anim(tiltPts, `transform:rotate(0deg);${FB}`);
  const cy = top0 + 17, h = fc.size / 2;
  const face = `<rect x="${fc.cx - h}" y="${cy - h}" width="${fc.size}" height="${fc.size}" rx="${fc.size * 0.22}" fill="rgb(108,108,108)"/>`;
  return `<g class="${move}"><g class="${row}"><rect x="104" y="${top0}" width="578" height="35" fill="none"/><g class="${mark}"><g class="${squash}"><g class="${tilt}">${face}</g></g></g>${lab(copy.LABELS[0], t0, at('typing'))}${lab(copy.LABELS[1], at('typing'), tGone)}</g></g>`;
}

// ---------- composer (typing is ours: a person writing) ----------
function composer() {
  const box = byLabel('Composer actions'), mic = byLabel('Start voice input'), voice = byLabel('Start voice chat');
  const field = STATE.elements.find((e) => e.box[0] === 104 && e.box[1] === 700 && e.box[2] === 600 && e.style['background-color']);
  const [fx, fy, fw, fh] = field.box;
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const times = [];
  let t = TIMING.typeStart;
  for (const c of copy.DRAFT) { times.push(t); t += 0.034 + rnd() * 0.036 + (c === ' ' ? 0.06 : 0) + (c === ',' ? 0.18 : 0); }
  if (t > TIMING.send - 0.25) throw new Error('typing runs into the send');
  if (METRICS.prefixes?.length !== copy.DRAFT.length) throw new Error('caret widths are stale: run node scripts/oracle/measure-text.mjs');
  const T = TIMING, si = ORACLE.sendIcon, fo = ORACLE.focus, fm = fo.ms / 1000;
  const border = anim([[0, `stroke:${ink(fo.rest)}`], [T.focus, `stroke:${ink(fo.rest)}`, 'ease'], [T.focus + fm, `stroke:${ink(fo.on)}`], [T.blur, `stroke:${ink(fo.on)}`, 'ease'], [T.blur + fm, `stroke:${ink(fo.rest)}`]], `stroke:${ink(fo.rest)}`);
  const ph = anim([[0, VIS], [T.typeStart - EPS, VIS], [T.typeStart, HID], [T.send - EPS, HID], [T.send, VIS]], VIS);
  const caretWin = anim([[0, HID], [T.focus - EPS, HID], [T.focus, VIS], [T.typeStart - EPS, VIS], [T.typeStart, HID], [T.send - EPS, HID], [T.send, VIS], [T.blur - EPS, VIS], [T.blur, HID]], HID);
  const blink = ambient(1, '0%,49%{opacity:1}50%,100%{opacity:0}', 'opacity:1');
  const cy = fy + fh / 2, tx = 149;
  const pm = metric(copy.PLACEHOLDER);
  // Each prefix is measured in proportion to the whole draft, so the caret tracks the real width.
  const typed = [...copy.DRAFT].map((_, i) => {
    const a = times[i], b = i + 1 < copy.DRAFT.length ? times[i + 1] : T.send;
    const s = copy.DRAFT.slice(0, i + 1);
    const pw = METRICS.prefixes[i];
    return `<g class="${shown(a, b)}">${text(tx, cy - 11, 22, s, { ls: 0.15, w: pw })}<path d="M${f1(tx + pw + 1)} ${cy - 9}V${cy + 9}" stroke="${ink()}" stroke-width="1.5"/></g>`;
  }).join('');
  const caretX = tx - 1;
  const icon = (a, b, base) => anim([[0, `opacity:0;transform:scale(${si.scale})`], [a, `opacity:0;transform:scale(${si.scale})`, si.ease], [a + si.ms / 1000, 'opacity:1;transform:scale(1)'], [b, 'opacity:1;transform:scale(1)', si.ease], [b + si.ms / 1000, `opacity:0;transform:scale(${si.scale})`]], `${base};${FB}`);
  const sendIcon = icon(T.typeStart, at('userIn'), 'opacity:0');
  const voiceIcon = anim([[0, 'opacity:1;transform:scale(1)'], [T.typeStart, 'opacity:1;transform:scale(1)', si.ease], [T.typeStart + si.ms / 1000, `opacity:0;transform:scale(${si.scale})`], [at('userIn'), `opacity:0;transform:scale(${si.scale})`, si.ease], [at('userIn') + si.ms / 1000, 'opacity:1;transform:scale(1)']], `opacity:1;${FB}`);
  const c = (e) => [e.box[0] + e.box[2] / 2, e.box[1] + e.box[3] / 2];
  const [px, py] = c(box), [mx, my] = c(mic), [vx, vy] = c(voice);
  return `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="${fh / 2}" fill="${field.style['background-color']}" stroke-width=".5" class="${border}"/>
<circle cx="${px}" cy="${py}" r="14" fill="${ink(0.04)}" stroke="${ink(0.06)}" stroke-width=".5"/><path d="M${px - 6} ${py}h12M${px} ${py - 6}v12" class="glyph"/>
<g class="${ph}">${text(tx, cy - 11, 22, copy.PLACEHOLDER, { w: pm.width, fill: ink(0.32), ls: 0.15 })}</g>
<g class="${caretWin}"><path d="M${caretX} ${cy - 9}V${cy + 9}" stroke="${ink()}" stroke-width="1.5" class="${blink}"/></g>
${typed}
<circle cx="${mx}" cy="${my}" r="14" fill="${ink(0.04)}" stroke="${ink(0.06)}" stroke-width=".5"/><rect x="${mx - 2.75}" y="${my - 6.5}" width="5.5" height="9" rx="2.75" class="glyph"/><path d="M${mx - 5} ${my - 0.5}c0 5.5 10 5.5 10 0M${mx} ${my + 4.5}v2" class="glyph"/>
<circle cx="${vx}" cy="${vy}" r="14" fill="${voice.style['background-color']}"/>
<g class="${voiceIcon}"><path d="M${vx - 6} ${vy - 2}v4M${vx - 3} ${vy - 5}v10M${vx} ${vy - 7}v14M${vx + 3} ${vy - 4.5}v9M${vx + 6} ${vy - 2}v4" stroke="rgb(18,18,18)" stroke-width="1.8" stroke-linecap="round"/></g>
<g class="${sendIcon}"><path d="M${vx} ${vy + 6}V${vy - 6}M${vx - 5} ${vy - 1}L${vx} ${vy - 6}L${vx + 5} ${vy - 1}" fill="none" stroke="rgb(18,18,18)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

// ---------- rail, header, panel: drawn from the fixture ----------
function chrome() {
  const rail = byLabel('Bots'), badge = byLabel('Main Bot'), tile = byLabel('Oracle');
  const me = STATE.elements.find((e) => e.tag === 'img' && e.box[0] < 88 && e.box[1] > 600);
  const head = byLabel('View conversation details'), headName = STATE.elements.find((e) => e.parent !== undefined && e.text === copy.BOT && e.box[1] < 60);
  const headAv = STATE.elements.find((e) => e.tag === 'img' && e.parent !== undefined && e.box[1] === 18);
  const share = byLabel('Share'), shareText = byText('Share');
  const close = byLabel('Close'), panelAv = STATE.elements.find((e) => e.icon && e.box[0] > 800 && e.box[1] < 100), nameBox = byLabel('Bot name');
  const tabA = byText('Activity'), tabL = byText('Library');
  const cards = STATE.elements.filter((e) => e.tag === 'ul');
  const thumb = STATE.elements.find((e) => e.box[0] > 940 && e.box[1] > 400 && e.box[1] < 410 && e.box[2] === 64);
  const zz = (k) => ambient(ORACLE.sleep.periodS, `0%{opacity:0;transform:translateY(0) scale(${ORACLE.sleep.zScale});animation-timing-function:ease-out}25%{opacity:1;animation-timing-function:ease-out}100%{opacity:0;transform:translateY(-${ORACLE.sleep.rise}px) scale(1)}`, `opacity:0;${FB}`, -k * ORACLE.sleep.zStagger);
  const breathe = ambient(ORACLE.sleep.periodS, `0%,100%{opacity:${ORACLE.sleep.breathe[0]};transform:scale(1)}50%{opacity:1;transform:scale(${ORACLE.sleep.breathe[1]})}`, `opacity:${ORACLE.sleep.breathe[0]};${FB}`, 0, 'ease-in-out');
  const combos = STATE.elements.filter((e) => e.role === 'combobox');
  const comboText = (cb) => STATE.elements.find((e) => e.text && e.i > cb.i && e.box[0] >= cb.box[0] && e.box[1] >= cb.box[1] && e.box[0] + e.box[2] <= cb.box[0] + cb.box[2] + 0.1);
  const rowLabel = (t) => label(byText(t));
  const [tx, tyy, tw, th] = thumb.box;
  return `
<rect x="0" y="0" width="${rail.box[2]}" height="${VH}" fill="${rail.style['background-color']}"/>
<g fill="${ink(0.14)}"><circle cx="20" cy="20" r="6"/><circle cx="40" cy="20" r="6"/><circle cx="60" cy="20" r="6"/></g>
<circle cx="43.8" cy="75" r="17" fill="#fff"/>
<circle cx="${badge.box[0] + 6}" cy="${badge.box[1] + 6}" r="7.25" fill="${rail.style['background-color']}"/><circle cx="${badge.box[0] + 6}" cy="${badge.box[1] + 6}" r="6" fill="${badge.style['background-color']}"/>
<path d="M16 112.25H72" stroke="${ink(0.1)}" stroke-width=".5"/>
<rect x="${tile.box[0]}" y="${tile.box[1]}" width="${tile.box[2]}" height="${tile.box[3]}" rx="12" fill="${tile.style['background-color']}"/>
${avatar(tile.box[0] + 27, tile.box[1] + 27, 27)}
<path d="M37 644h14M44 637v14" class="glyph" stroke-width="1.5"/>
<g class="glyph" stroke-width="1.4" transform="translate(37 671)"><rect x="0" y="0" width="5.5" height="5.5" rx="1"/><rect x="8.5" y="0" width="5.5" height="5.5" rx="1"/><rect x="0" y="8.5" width="5.5" height="5.5" rx="1"/><path d="M11.25 8.5V14M8.5 11.25H14"/></g>
<circle cx="${me.box[0] + 18}" cy="${me.box[1] + 18}" r="18" fill="rgb(52,56,72)" stroke="${ink(0.06)}" stroke-width=".5"/><circle cx="${me.box[0] + 18}" cy="${me.box[1] + 14}" r="6" fill="rgb(86,90,108)"/><path d="M${me.box[0] + 7} ${me.box[1] + 32}c3-8 19-8 22 0" fill="rgb(86,90,108)"/>
${pill(head.box, head.style['background-color'], ink(0.06))}
${avatar(headAv.box[0] + 12, headAv.box[1] + 12, 17)}
${label(headName)}
${pill(share.box, share.style['background-color'], ink(0.06), 1)}${label(shareText)}
${text(time.box[0] + time.box[2] / 2, time.box[1], time.box[3], copy.TIME, { size: 12, fill: time.style.color, anchor: 'middle', ls: 0.12, w: metric(copy.TIME).width * 12 / 15 })}
<path d="M720.25 0V${VH}" stroke="${ink(0.06)}" stroke-width=".5"/>
${pill(close.box, close.style['background-color'], ink(0.06), 1)}<path d="M${close.box[0] + 13} ${close.box[1] + 13}l10 10m0-10l-10 10" class="glyph" stroke="${ink()}"/>
${avatar(panelAv.box[0] + panelAv.box[2] / 2, panelAv.box[1] + panelAv.box[3] / 2, 55)}
${text(nameBox.box[0] + nameBox.box[2] / 2, nameBox.box[1], nameBox.box[3], copy.BOT, { size: 17, weight: 500, anchor: 'middle' })}
${pill(tabA.box, tabA.style['background-color'])}${text(tabA.box[0] + tabA.box[2] / 2, tabA.box[1], tabA.box[3], 'Activity', { size: 13, anchor: 'middle', ls: 0.195 })}${text(tabL.box[0] + tabL.box[2] / 2, tabL.box[1], tabL.box[3], 'Library', { size: 13, anchor: 'middle', fill: tabL.style.color, ls: 0.195 })}
${['Suggested', 'Computer', 'Voice chat'].map((t) => rowLabel(t)).join('')}
${cards.map((u) => `<rect x="${u.box[0] + 0.25}" y="${u.box[1] + 0.25}" width="${u.box[2] - 0.5}" height="${u.box[3] - 0.5}" rx="12" fill="${u.style['background-color']}" stroke="${ink(0.06)}" stroke-width=".5"/>`).join('')}
<g transform="translate(753.5 282.5)" fill="${ink(0.66)}"><rect width="6" height="6" rx="1.5"/><rect x="8" width="6" height="6" rx="1.5"/><rect y="8" width="6" height="6" rx="1.5"/><rect x="8" y="8" width="6" height="6" rx="1.5"/></g>
${rowLabel('Add to Slack')}${chevronR(1004, 289.25)}
<circle cx="760.5" cy="325.5" r="7.25" class="glyph"/><path d="M760.5 321.5v4l2.5 1.5" class="glyph"/>
${rowLabel('Create a routine')}${chevronR(1004, 325.25)}
${rowLabel("Bot's computer")}${rowLabel('Asleep')}
<rect x="${tx}" y="${tyy}" width="${tw}" height="${th}" rx="8" fill="${ink(0.04)}"/><rect x="${tx}" y="${tyy}" width="${tw}" height="${th}" rx="8" fill="url(#thumbA)"/><rect x="${tx}" y="${tyy}" width="${tw}" height="${th}" rx="8" fill="url(#thumbB)"/>
<g class="${breathe}">${avatar(tx + 32, tyy + 21, 20, 'rgb(150,150,150)')}</g>
${[0, 1, 2].map((k) => `<text x="${996 + k * 3}" y="${408 - k * 3}" font-size="${7 + k}" fill="${ink(0.8)}" class="${zz(k)}">z</text>`).join('')}
${['Voice', 'Speed', 'Language'].map(rowLabel).join('')}
${combos.map((cb) => { const t = comboText(cb); return `<rect x="${cb.box[0] + 0.5}" y="${cb.box[1] + 0.5}" width="${cb.box[2] - 1}" height="${cb.box[3] - 1}" rx="8" fill="none" stroke="${ink(0.04)}"/>${label(t)}${chevronD(cb.box[0] + cb.box[2] - 10.5, cb.box[1] + 12)}`; }).join('')}`;
}

export function heroSvg() {
  n = 0; clipN = 0; css.length = 0; clips.length = 0;
  const S = 1152 / VW;
  const transcript = rows.map(bubble).join('\n');
  const wl = workingLine(), comp = composer(), side = chrome();
  const band = ORACLE.shimmer.stops.map(([o, a]) => `<stop offset="${o}" stop-color="rgb(${INK})" stop-opacity="${a}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${Math.round(48 + VH * S)}" viewBox="0 0 1200 ${Math.round(48 + VH * S)}" role="img" aria-labelledby="t d">
<title id="t">The oracle screen, rebuilt from measurements</title>
<desc id="d">The oracle's window, drawn from a capture of the live app (${VW} by ${VH} points): every box, colour and corner is measured, and the bots' avatars are plain grey stand-ins. It plays one real turn, timed from a recording: a question is typed and sent, the bubble slides up, a working line reads Checking system storage under a moving shimmer, the bot's short reply lands above it, the line changes to Typing, the answer arrives and the line leaves. The bot's computer sleeps on the right. The words, the typing and the loop reset are ours. With reduced motion it shows the finished turn, still. Generated by scripts/generate-hero.mjs.</desc>
<style>
  .page { fill: #f4f3ef; } .grid { fill: #dedcd5; }
  @media (prefers-color-scheme: dark) { .page { fill: #0a0a0b; } .grid { fill: #1c1c1e; } }
  text { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Helvetica, Arial, sans-serif; }
  .glyph { fill: none; stroke: ${ink(0.66)}; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
  ${css.join('\n  ')}
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
<defs>
  <pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" class="grid"/></pattern>
  <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="sheenU" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".01"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="band">${band}</linearGradient>
  <radialGradient id="thumbA" cx=".15" cy=".08" r="1" gradientTransform="translate(.15 .08) scale(1.15 .9) translate(-.15 -.08)"><stop offset="0" stop-color="rgb(190,190,190)" stop-opacity=".26"/><stop offset=".68" stop-color="rgb(190,190,190)" stop-opacity="0"/></radialGradient>
  <radialGradient id="thumbB" cx=".9" cy=".82" r=".85"><stop offset="0" stop-color="rgb(120,120,120)" stop-opacity=".2"/><stop offset=".7" stop-color="rgb(120,120,120)" stop-opacity="0"/></radialGradient>
  <clipPath id="win"><rect width="${VW}" height="${VH}" rx="11"/></clipPath>
  ${clips.join('\n  ')}
</defs>
<rect class="page" width="1200" height="${Math.round(48 + VH * S)}" rx="18"/>
<rect width="1200" height="${Math.round(48 + VH * S)}" rx="18" fill="url(#dots)"/>
<g transform="translate(24 24) scale(${f1(S * 1e4) / 1e4})">
<rect width="${VW}" height="${VH}" rx="11" fill="rgb(18,18,18)" stroke="${ink(0.12)}" stroke-width=".9"/>
<g clip-path="url(#win)">
${side}
${transcript}
${wl}
${comp}
</g>
</g>
</svg>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const svg = heroSvg();
  if (process.argv.includes('--stdout')) process.stdout.write(svg);
  else writeFileSync(path('docs', 'images', 'hero.svg'), svg);
}
