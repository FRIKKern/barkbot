// docs/images/hero.svg: a wireframe of the oracle screen that plays one real turn.
// Geometry: the live oracle window (1040x760 pt), scaled by S into 1152x841.
// Motion: measured from traces/2026-11-08-storage.json and -say-hi.json (H3).
// Ours, not the oracle's: the typing (a person), the hold, and the loop reset.
// Never edit the SVG by hand. `--stdout` prints instead of writing.
import { writeFileSync } from 'node:fs';
import { path } from './lib/data.mjs';
import { wrap } from './lib/svg.mjs';

// ---------- what the oracle does (seconds after send unless noted) ----------
export const ORACLE = {
  source: 'traces/2026-11-08-storage.json (turn order and times), traces/2026-11-08-say-hi.json (curves)',
  userIn: 0.44,         // your bubble is added
  workIn: 2.03,         // working line with its first label
  ackIn: 3.53,          // the bot's short reply, above the working line
  typing: 9.0,          // label becomes "Typing…"
  replyIn: 9.84,        // the answer
  workOut: 9.95,        // working line leaves
  enter: { px: 12, ms: 240, ease: 'cubic-bezier(.23,1,.32,1)' },          // bubbles: slide only, no fade
  work: { rowMs: 180, rowScale: 0.92, markMs: 340, markScale: 0.6, labelMs: 180, labelDelay: 0.22, labelPx: 4 },
  workExit: { ms: 140, scale: 0.92, ease: 'cubic-bezier(.22,1,.36,1)' },
  shimmerS: 2.2,        // background sweep on the working label; direction not yet verified
  sendIcon: { ms: 200, scale: 0.5, ease: 'cubic-bezier(.22,1,.36,1)' },
  focusMs: 150,         // composer border on focus
  sleep: { periodS: 2.4, zStagger: 0.8, rise: 12, zScale: 0.6, breathe: [0.85, 1.04] },
};
// ---------- ours ----------
export const TIMING = { loop: 24, focus: 0.6, typeStart: 1.0, send: 4.2, hold: 19.6, rewind: 20.15, blur: 21.1 };
const L = TIMING.loop;
const at = (k) => TIMING.send + ORACLE[k];

const S = 1152 / 1040;                       // oracle points to picture pixels
const X = (x) => 24 + S * x, Y = (y) => 24 + S * y, P = (v) => S * v;
const OUTQ = ORACLE.enter.ease, OUT = 'cubic-bezier(.22,1,.36,1)', IN = 'cubic-bezier(.5,0,.75,0)', INOUT = 'cubic-bezier(.65,0,.35,1)';
const EPS = 0.002;
const DRAFT = 'How much storage do you have, and where?';
const ACK = 'I’ll check how much storage I have on my computer.';
const ANSWER = 'I have 38 GB free of 75 GB. It is all on my own computer, a small Linux machine in a data centre in Nuremberg. Most of the space goes to the system and my work folder, and about 2 GB is browser cache I can clear. Want me to clear the cache and old downloads now?';

// ---------- keyframe builder ----------
const pct = (s) => `${((Math.min(Math.max(s, 0), L) / L) * 100).toFixed(3)}%`;
let n = 0;
const css = [];
function anim(points, base, extra = '') {
  const name = `m${++n}`;
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  const fr = [];
  if (pts[0][0] > 0) fr.push(`0%{${pts[0][1]}}`);
  for (const [t, d, e] of pts) fr.push(`${pct(t)}{${d}${e ? `;animation-timing-function:${e}` : ''}}`);
  if (pts.at(-1)[0] < L) fr.push(`100%{${pts.at(-1)[1]}}`);
  css.push(`.${name}{${base};animation:${name} ${L}s linear infinite${extra}}@keyframes ${name}{${fr.join('')}}`);
  return name;
}
// A loop that is always on screen: its period must divide L or the seam shows.
function ambient(period, frames, base, delay = 0, ease = 'linear') {
  if (Math.abs(L / period - Math.round(L / period)) > 1e-9) throw new Error(`period ${period}s does not divide the ${L}s loop`);
  const name = `m${++n}`;
  css.push(`.${name}{${base};animation:${name} ${period}s ${ease} ${delay}s infinite}@keyframes ${name}{${frames}}`);
  return name;
}
const HID = 'opacity:0', VIS = 'opacity:1';
const FB = 'transform-box:fill-box;transform-origin:center';
const window_ = (a, b, base = HID) => anim([[0, HID], [a - EPS, HID], [a, VIS], [b - EPS, VIS], [b, HID]], base);
// Present from a to the reset; enters with the oracle's slide (no fade), leaves with our reset fade.
const slideIn = (a, x) => anim([[0, 'opacity:0;transform:translateY(0)'], [a - EPS, 'opacity:0;transform:translateY(0)'],
  [a, `opacity:1;transform:translateY(${P(ORACLE.enter.px).toFixed(1)}px)`, OUTQ], [a + ORACLE.enter.ms / 1000, 'opacity:1;transform:translateY(0)'],
  [x, 'opacity:1;transform:translateY(0)', IN], [x + 0.35, 'opacity:0;transform:translateY(0)']], 'opacity:1;transform:translateY(0)');

// A rounded rect with its own radius per corner: [top-left, top-right, bottom-right, bottom-left].
function rr(x, y, w, h, [a, b, c, d]) {
  return `M${x + a} ${y}H${x + w - b}A${b} ${b} 0 0 1 ${x + w} ${y + b}V${y + h - c}A${c} ${c} 0 0 1 ${x + w - c} ${y + h}H${x + d}A${d} ${d} 0 0 1 ${x} ${y + h - d}V${y + a}A${a} ${a} 0 0 1 ${x + a} ${y}Z`;
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ---------- transcript, in oracle points ----------
// Measured: bubble 15px/22px text, 7px x 12px padding, max 480 wide; 16 between speakers, 4 within a run.
const CH = 7.16;                                  // average glyph advance at 15px, from a measured bubble
const lineH = 22, padY = 7, padX = 12;
const bubbleH = (lines) => padY * 2 + lineH * lines;
const textW = (s) => Math.min(456, Math.ceil(s.length * CH));
const rows = [
  { kind: 'bars', side: 'bot', bars: [380, 420, 300] },
  { kind: 'bars', side: 'bot', bars: [250] },
  { kind: 'bars', side: 'user', bars: [190] },
  { kind: 'grid', side: 'bot' },
  { kind: 'bars', side: 'user', bars: [270] },
  { kind: 'bars', side: 'bot', bars: [410, 330] },
  { kind: 'file', side: 'bot' },
  { kind: 'time', side: 'mid', id: 'time', at: at('userIn') },
  { kind: 'msg', side: 'user', id: 'user', text: DRAFT, at: at('userIn') },
  { kind: 'msg', side: 'bot', id: 'ack', text: ACK, at: at('ackIn') },
  { kind: 'msg', side: 'bot', id: 'reply', text: ANSWER, at: at('replyIn') },
];
for (const r of rows) {
  if (r.kind === 'msg') { r.lines = wrap(r.text, 62); r.w = (r.lines.length > 1 ? 456 : textW(r.text)) + padX * 2; r.h = bubbleH(r.lines.length); }
  if (r.kind === 'bars') { r.w = Math.max(...r.bars) + padX * 2; r.h = bubbleH(r.bars.length); }
  if (r.kind === 'grid') { r.w = 480; r.h = 114; }
  if (r.kind === 'file') { r.w = 300; r.h = 72; }
  if (r.kind === 'time') { r.w = 600; r.h = 38; }
}
let y = 0;
rows.forEach((r, i) => {
  const p = rows[i - 1];
  if (p) y += r.kind === 'time' || p.kind === 'time' ? 8 : r.side === p.side ? 4 : 16;
  r.y = y; y += r.h;
});
// Corners: a run of one speaker tightens to 6 on that speaker's side (measured on the oracle).
const sameRun = (a, b) => a && b && a.side === b.side && a.side !== 'mid';
function corners(i, joinPrev = true, joinNext = true) {
  const r = rows[i], prev = joinPrev && sameRun(rows[i - 1], r), next = joinNext && sameRun(r, rows[i + 1]);
  return r.side === 'bot' ? [prev ? 6 : 18, 18, 18, next ? 6 : 18] : [18, prev ? 6 : 18, next ? 6 : 18, 18];
}
const row = Object.fromEntries(rows.filter((r) => r.id).map((r) => [r.id, r]));
const BOTTOM = 648;                                // last content bottom when idle (oracle points)
const WORKROW = 52;                                // the working line's row
const off = (id, work) => BOTTOM - (work ? WORKROW : 0) - (row[id] ? row[id].y + row[id].h : 0);
const lastHistory = rows.filter((r) => !r.id).at(-1);
const off0 = BOTTOM - (lastHistory.y + lastHistory.h);

// The list stays pinned to the bottom: each change moves it at once, as the oracle's scroller does.
function stackAnim() {
  const ev = [
    [at('userIn'), off('user')],
    [at('workIn'), off('user', true)],
    [at('ackIn'), off('ack', true)],
    [at('replyIn'), off('reply', true)],
    [at('workOut') + ORACLE.workExit.ms / 1000, off('reply')],
  ];
  const ty = (v) => `transform:translateY(${(24 + P(v)).toFixed(1)}px)`;
  const pts = [[0, ty(off0)]];
  let cur = off0;
  for (const [t, to] of ev) { pts.push([t - EPS, ty(cur)], [t, ty(to)]); cur = to; }
  pts.push([TIMING.rewind, ty(cur), INOUT], [TIMING.rewind + 0.9, ty(off0)]);
  return anim(pts, ty(off('reply')));
}

function bubble(r, i, cls = '') {
  const x = r.side === 'user' ? 704 - r.w : 104;
  const fill = r.side === 'user' ? 'mine' : 'theirs';
  const shape = (c) => `<path d="${rr(X(x), 0, P(r.w), P(r.h), c.map(P))}" class="${fill}"/>`;
  let body;
  if (r.id === 'ack') {
    // Alone until the answer arrives, then joined to it: the bottom-left corner tightens.
    body = `<g class="${window_(0, at('replyIn'), HID)}">${shape(corners(i, true, false))}</g><g class="${window_(at('replyIn'), L + 1, VIS)}">${shape(corners(i))}</g>`;
  } else body = shape(corners(i));
  if (r.kind === 'msg') {
    const tx = X(x + padX), ty0 = P(padY + 16);
    body += `<text x="${tx.toFixed(1)}" y="${ty0.toFixed(1)}" class="ink body">${r.lines.map((l, k) => `<tspan x="${tx.toFixed(1)}" dy="${k ? P(lineH).toFixed(1) : 0}">${esc(l)}</tspan>`).join('')}</text>`;
  } else {
    body += r.bars.map((w, k) => `<rect x="${X(x + padX).toFixed(1)}" y="${P(padY + 7 + k * lineH).toFixed(1)}" width="${P(w).toFixed(1)}" height="${P(8).toFixed(1)}" rx="${P(4).toFixed(1)}" class="${r.side === 'user' ? 'flat2' : 'flat'}"/>`).join('');
  }
  return `<g transform="translate(0 ${P(r.y).toFixed(1)})"><g${cls ? ` class="${cls}"` : ''}>${body}</g></g>`;
}

function renderRow(r, i) {
  const ty = P(r.y).toFixed(1);
  if (r.kind === 'bars') return bubble(r, i);
  if (r.kind === 'msg') return bubble(r, i, slideIn(r.at, TIMING.hold + (r.id === 'reply' ? 0 : r.id === 'ack' ? 0.08 : 0.16)));
  if (r.kind === 'time') return `<g transform="translate(0 ${ty})"><g class="${slideIn(r.at, TIMING.hold + 0.16)}"><text x="${X(404).toFixed(1)}" y="${P(25).toFixed(1)}" font-size="${P(12).toFixed(1)}" text-anchor="middle" class="faint">Today 9:17 PM</text></g></g>`;
  if (r.kind === 'file') {
    const x0 = X(104);
    return `<g transform="translate(0 ${ty})"><path d="${rr(x0, 0, P(r.w), P(r.h), corners(i).map(P))}" class="theirs"/><rect x="${(x0 + P(16)).toFixed(1)}" y="${P(18).toFixed(1)}" width="${P(24).toFixed(1)}" height="${P(30).toFixed(1)}" rx="5" class="wire"/><path d="M${(x0 + P(22)).toFixed(1)} ${P(27).toFixed(1)}h${P(12).toFixed(1)}M${(x0 + P(22)).toFixed(1)} ${P(33).toFixed(1)}h${P(12).toFixed(1)}M${(x0 + P(22)).toFixed(1)} ${P(39).toFixed(1)}h${P(8).toFixed(1)}" stroke="#6a6a70" stroke-width="1.5" stroke-linecap="round"/><text x="${(x0 + P(54)).toFixed(1)}" y="${P(32).toFixed(1)}" class="ink body">BARKBOT_HANDOV… .md</text><text x="${(x0 + P(54)).toFixed(1)}" y="${P(52).toFixed(1)}" font-size="${P(12).toFixed(1)}" class="dim">11kB</text></g>`;
  }
  if (r.kind === 'grid') {
    const x0 = X(104), w = [150, 176, 146], gap = 4;
    let cx = x0;
    const tiles = w.map((tw, k) => {
      const x = cx; cx += P(tw + gap);
      const inner = k === 2
        ? `<rect x="${x.toFixed(1)}" y="0" width="${P(tw).toFixed(1)}" height="${P(r.h).toFixed(1)}" rx="${P(10)}" fill="#0f0f10" opacity=".6"/><text x="${(x + P(tw / 2)).toFixed(1)}" y="${P(r.h / 2 + 8).toFixed(1)}" font-size="${P(22).toFixed(1)}" font-weight="500" text-anchor="middle" class="ink">+2</text>`
        : `<rect x="${(x + P(10)).toFixed(1)}" y="${P(12).toFixed(1)}" width="${P(tw * 0.45).toFixed(1)}" height="${P(6).toFixed(1)}" rx="3" class="flat2"/><rect x="${(x + P(10)).toFixed(1)}" y="${P(26).toFixed(1)}" width="${P(tw * 0.75).toFixed(1)}" height="${P(6).toFixed(1)}" rx="3" class="flat"/><rect x="${(x + P(10)).toFixed(1)}" y="${P(40).toFixed(1)}" width="${P(tw * 0.6).toFixed(1)}" height="${P(6).toFixed(1)}" rx="3" class="flat"/>`;
      return `<rect x="${x.toFixed(1)}" y=".5" width="${P(tw).toFixed(1)}" height="${(P(r.h) - 1).toFixed(1)}" rx="${P(10).toFixed(1)}" class="wire2"/>${inner}`;
    }).join('');
    return `<g transform="translate(0 ${ty})">${tiles}</g>`;
  }
  throw new Error(`unknown row ${r.kind}`);
}

// ---------- the working line (measured: three layers enter, one exit) ----------
let clipN = 0;
const clips = [];
function workingLine() {
  const w = ORACLE.work, t0 = at('workIn'), tOut = at('workOut');
  const cy = Y(BOTTOM - WORKROW + 36);
  const rowA = anim([[0, `opacity:0;transform:scale(${w.rowScale})`], [t0 - EPS, `opacity:0;transform:scale(${w.rowScale})`], [t0, `opacity:0;transform:scale(${w.rowScale})`, OUT], [t0 + w.rowMs / 1000, 'opacity:1;transform:scale(1)'],
    [tOut, 'opacity:1;transform:scale(1)', ORACLE.workExit.ease], [tOut + ORACLE.workExit.ms / 1000, `opacity:0;transform:scale(${ORACLE.workExit.scale})`]], `opacity:0;${FB}`);
  const mark = anim([[0, `opacity:0;transform:scale(${w.markScale})`], [t0, `opacity:0;transform:scale(${w.markScale})`, OUT], [t0 + w.markMs / 1000, 'opacity:1;transform:scale(1)']], `opacity:1;${FB}`);
  const label = (text, from, to) => {
    const tx = X(149), ty = cy + P(5);
    const id = `c${++clipN}`;
    clips.push(`<clipPath id="${id}"><text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" class="body">${text}</text></clipPath>`);
    const a = from + (from === t0 ? w.labelDelay : 0);
    const show = anim([[0, `opacity:0;transform:translateY(${P(w.labelPx).toFixed(1)}px)`], [a - EPS, `opacity:0;transform:translateY(${P(w.labelPx).toFixed(1)}px)`], [a, `opacity:0;transform:translateY(${P(w.labelPx).toFixed(1)}px)`, OUT],
      [a + w.labelMs / 1000, 'opacity:1;transform:translateY(0)'], [to - EPS, 'opacity:1;transform:translateY(0)'], [to, 'opacity:0;transform:translateY(0)']], HID);
    // The sweep repeats every 2.2 s from the moment the label shows, inside the loop's own timeline.
    const dist = P(text.length * CH) + 120;
    const pts = [[0, 'transform:translateX(0)']];
    for (let s = a; s < to; s += ORACLE.shimmerS) pts.push([s, 'transform:translateX(0)'], [Math.min(s + ORACLE.shimmerS, to) - EPS, `transform:translateX(${dist.toFixed(0)}px)`]);
    pts.push([to, 'transform:translateX(0)']);
    const sweep = anim(pts, 'transform:translateX(0)');
    return `<g class="${show}"><text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" class="body worktext">${text}</text><g clip-path="url(#${id})"><rect class="${sweep}" x="${(tx - 100).toFixed(1)}" y="${(cy - 14).toFixed(1)}" width="90" height="28" fill="url(#glint)"/></g></g>`;
  };
  return `<g class="${rowA}"><g class="${mark}"><circle cx="${X(124.5).toFixed(1)}" cy="${cy.toFixed(1)}" r="${P(7.5).toFixed(1)}" fill="#2a2a2e" stroke="#4a4a50"/></g>${label('Checking system storage', t0, at('typing'))}${label('Typing…', at('typing'), tOut + ORACLE.workExit.ms / 1000)}</g>`;
}

// ---------- composer (typing is ours: a person writing) ----------
function composer() {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const times = [];
  let t = TIMING.typeStart;
  for (const c of DRAFT) { times.push(t); t += 0.034 + rnd() * 0.036 + (c === ' ' ? 0.06 : 0) + (c === ',' ? 0.18 : 0); }
  if (t > TIMING.send - 0.25) throw new Error('typing runs into the send');
  const T = TIMING, si = ORACLE.sendIcon, fm = ORACLE.focusMs / 1000;
  const focusBorder = anim([[0, 'stroke:#2f2f33'], [T.focus, 'stroke:#2f2f33', 'ease'], [T.focus + fm, 'stroke:#55555c'], [T.blur, 'stroke:#55555c', 'ease'], [T.blur + fm, 'stroke:#2f2f33']], 'stroke:#2f2f33');
  const ph = anim([[0, VIS], [T.typeStart - EPS, VIS], [T.typeStart, HID], [T.send - EPS, HID], [T.send, VIS]], VIS);
  const caretWin = anim([[0, HID], [T.focus - EPS, HID], [T.focus, VIS], [T.typeStart - EPS, VIS], [T.typeStart, HID], [T.send - EPS, HID], [T.send, VIS], [T.blur - EPS, VIS], [T.blur, HID]], HID);
  const blink = ambient(1, '0%,49%{opacity:1}50%,100%{opacity:0}', 'opacity:1', 0, 'linear');
  const typed = [...DRAFT].map((_, i) => {
    const a = times[i], b = i + 1 < DRAFT.length ? times[i + 1] : T.send;
    return `<text x="${X(149).toFixed(1)}" y="830" class="ink body ${window_(a, b)}">${esc(DRAFT.slice(0, i + 1))}<tspan class="caretglyph" dx="1">|</tspan></text>`;
  }).join('\n');
  // Voice at rest; Send while there is text. Each icon leaves at half size and fades (measured 200 ms).
  const icon = (a, b, base) => anim([[0, `opacity:0;transform:scale(${si.scale})`], [a, `opacity:0;transform:scale(${si.scale})`, si.ease], [a + si.ms / 1000, 'opacity:1;transform:scale(1)'], [b, 'opacity:1;transform:scale(1)', si.ease], [b + si.ms / 1000, `opacity:0;transform:scale(${si.scale})`]], `${base};${FB}`);
  const sendIcon = icon(T.typeStart, T.send, 'opacity:0');
  const voiceIcon = anim([[0, 'opacity:1;transform:scale(1)'], [T.typeStart, 'opacity:1;transform:scale(1)', si.ease], [T.typeStart + si.ms / 1000, `opacity:0;transform:scale(${si.scale})`], [T.send, `opacity:0;transform:scale(${si.scale})`, si.ease], [T.send + si.ms / 1000, 'opacity:1;transform:scale(1)']], `opacity:1;${FB}`);
  return `<rect x="${X(104).toFixed(1)}" y="${Y(700).toFixed(1)}" width="${P(600).toFixed(1)}" height="${P(44).toFixed(1)}" rx="${P(22).toFixed(1)}" fill="#141414" class="${focusBorder}"/>
<circle cx="${X(126).toFixed(1)}" cy="${Y(722).toFixed(1)}" r="${P(13).toFixed(1)}" class="wire"/><path d="M${X(121).toFixed(1)} ${Y(722).toFixed(1)}h${P(10).toFixed(1)}M${X(126).toFixed(1)} ${Y(717).toFixed(1)}v${P(10).toFixed(1)}" class="icon"/>
<text x="${X(149).toFixed(1)}" y="830" class="faint body ${ph}">Message Grookie</text>
<g class="${caretWin}"><path d="M${(X(149) - 1.5).toFixed(1)} 814V835" stroke="#e9e9e7" stroke-width="1.5" class="${blink}"/></g>
${typed}
<circle cx="${X(658).toFixed(1)}" cy="${Y(722).toFixed(1)}" r="${P(13).toFixed(1)}" class="wire"/><rect x="${(X(658) - 4).toFixed(1)}" y="${(Y(722) - 8).toFixed(1)}" width="8" height="12" rx="4" class="icon"/><path d="M${(X(658) - 7.5).toFixed(1)} ${Y(722).toFixed(1)}c0 6.5 15 6.5 15 0M${X(658).toFixed(1)} ${(Y(722) + 6).toFixed(1)}v2.5" class="icon"/>
<circle cx="${X(688).toFixed(1)}" cy="${Y(722).toFixed(1)}" r="${P(14).toFixed(1)}" fill="#e9e9e7"/>
<g class="${voiceIcon}"><path d="M${(X(688) - 7).toFixed(1)} ${(Y(722) - 3).toFixed(1)}v6M${(X(688) - 3.5).toFixed(1)} ${(Y(722) - 6.5).toFixed(1)}v13M${X(688).toFixed(1)} ${(Y(722) - 9).toFixed(1)}v18M${(X(688) + 3.5).toFixed(1)} ${(Y(722) - 5.5).toFixed(1)}v11M${(X(688) + 7).toFixed(1)} ${(Y(722) - 2.5).toFixed(1)}v5" stroke="#0f0f10" stroke-width="2" stroke-linecap="round"/></g>
<g class="${sendIcon}"><path d="M${X(688).toFixed(1)} ${(Y(722) + 7).toFixed(1)}V${(Y(722) - 7).toFixed(1)}M${(X(688) - 6).toFixed(1)} ${(Y(722) - 1).toFixed(1)}L${X(688).toFixed(1)} ${(Y(722) - 7).toFixed(1)}L${(X(688) + 6).toFixed(1)} ${(Y(722) - 1).toFixed(1)}" fill="none" stroke="#0f0f10" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

// ---------- right panel (Computer asleep: measured zzz and breathing) ----------
function panel() {
  const sl = ORACLE.sleep;
  const z = (k) => ambient(sl.periodS, `0%{opacity:0;transform:translateY(0) scale(${sl.zScale});animation-timing-function:ease-out}25%{opacity:1;animation-timing-function:ease-out}100%{opacity:0;transform:translateY(-${P(sl.rise).toFixed(1)}px) scale(1)}`, `opacity:0;${FB}`, -k * sl.zStagger);
  const breathe = ambient(sl.periodS, `0%,100%{opacity:${sl.breathe[0]};transform:scale(1)}50%{opacity:1;transform:scale(${sl.breathe[1]})}`, `opacity:${sl.breathe[0]};${FB}`, 0, 'ease-in-out');
  return `<path d="M${X(720)} 24V865" class="hair"/>
<circle cx="${X(1010).toFixed(1)}" cy="${Y(30).toFixed(1)}" r="${P(18).toFixed(1)}" fill="#1f1f1f"/><path d="M${(X(1010) - 5.5).toFixed(1)} ${(Y(30) - 5.5).toFixed(1)}l11 11m0-11l-11 11" class="icon"/>
<circle cx="${X(880).toFixed(1)}" cy="${Y(100).toFixed(1)}" r="${P(32).toFixed(1)}" fill="#26262a" stroke="#45454b"/>
<text x="${X(880).toFixed(1)}" y="${Y(170).toFixed(1)}" font-size="${P(17).toFixed(1)}" font-weight="500" text-anchor="middle" class="ink">Grookie</text>
<rect x="${X(818).toFixed(1)}" y="${Y(193).toFixed(1)}" width="${P(63).toFixed(1)}" height="${P(26).toFixed(1)}" rx="${P(13).toFixed(1)}" fill="#1b1b1b"/>
<text x="${X(849.5).toFixed(1)}" y="${Y(210.5).toFixed(1)}" font-size="${P(13).toFixed(1)}" text-anchor="middle" class="ink">Activity</text>
<text x="${X(912.5).toFixed(1)}" y="${Y(210.5).toFixed(1)}" font-size="${P(13).toFixed(1)}" text-anchor="middle" class="dim">Library</text>
${section(239, 'CODING', `<g fill="none" stroke="#4d8ef7" stroke-width="1.5" transform="translate(${X(752).toFixed(1)} ${Y(284).toFixed(1)})"><circle cx="0" cy="0" r="3"/><circle cx="0" cy="18" r="3"/><circle cx="12" cy="18" r="3"/><path d="M0 3V15M12 15V8C12 4.5 9.5 2.5 6 2.5"/></g><text x="${X(775).toFixed(1)}" y="${Y(290).toFixed(1)}" font-size="${P(13).toFixed(1)}" class="ink">Barkpark remote-agent cloud fe…</text><text x="${X(775).toFixed(1)}" y="${Y(308).toFixed(1)}" font-size="${P(12).toFixed(1)}" class="dim">Ready for review · #25415</text>`, 49)}
${section(347, 'SUGGESTED', `<rect x="${X(753).toFixed(1)}" y="${Y(390).toFixed(1)}" width="${P(13).toFixed(1)}" height="${P(13).toFixed(1)}" rx="4" fill="none" stroke="#9d9da3" stroke-width="1.3" stroke-dasharray="2.5 2"/><text x="${X(779).toFixed(1)}" y="${Y(402).toFixed(1)}" font-size="${P(13).toFixed(1)}" class="ink">Add to Slack</text><path d="M${X(752)} ${Y(416)}H${X(1012)}" class="hair"/><circle cx="${X(759.5).toFixed(1)}" cy="${Y(434).toFixed(1)}" r="${P(6.5).toFixed(1)}" class="icon"/><text x="${X(779).toFixed(1)}" y="${Y(438).toFixed(1)}" font-size="${P(13).toFixed(1)}" class="ink">Create a routine</text>`, 72)}
${section(478, 'COMPUTER', `<text x="${X(753).toFixed(1)}" y="${Y(532).toFixed(1)}" font-size="${P(13).toFixed(1)}" class="ink">Bot’s computer</text><text x="${X(753).toFixed(1)}" y="${Y(550).toFixed(1)}" font-size="${P(12).toFixed(1)}" class="dim">Asleep</text><rect x="${X(948).toFixed(1)}" y="${Y(517).toFixed(1)}" width="${P(64).toFixed(1)}" height="${P(40).toFixed(1)}" rx="7" class="wire"/><g class="${breathe}"><circle cx="${X(979.5).toFixed(1)}" cy="${Y(537).toFixed(1)}" r="${P(9).toFixed(1)}" fill="#2a2a2e" stroke="#4a4a50"/></g>${[0, 1, 2].map((k) => `<text x="${X(992 + k * 4).toFixed(1)}" y="${Y(528 - k * 3).toFixed(1)}" font-size="${P(8 + k).toFixed(1)}" class="dim ${z(k)}">z</text>`).join('')}`, 52)}
${section(589, 'VOICE CHAT', `<g font-size="${P(13).toFixed(1)}"><text x="${X(753).toFixed(1)}" y="${Y(641).toFixed(1)}" class="ink">Voice</text><text x="${X(1003).toFixed(1)}" y="${Y(641).toFixed(1)}" text-anchor="end" class="dim">Liora</text><text x="${X(753).toFixed(1)}" y="${Y(671).toFixed(1)}" class="ink">Speed</text><text x="${X(1003).toFixed(1)}" y="${Y(671).toFixed(1)}" text-anchor="end" class="dim">1x</text><text x="${X(753).toFixed(1)}" y="${Y(701).toFixed(1)}" class="ink">Language</text><text x="${X(1003).toFixed(1)}" y="${Y(701).toFixed(1)}" text-anchor="end" class="dim">Auto-detect</text></g><g class="icon" stroke-width="1.3">${[641, 671, 701].map((yy) => `<path d="M${X(1007).toFixed(1)} ${(Y(yy) - 6).toFixed(1)}l3.5 3.5 3.5-3.5"/>`).join('')}</g>`, 96)}`;
}
function section(top, title, inner, h) {
  return `<text x="${X(741).toFixed(1)}" y="${Y(top + 16).toFixed(1)}" class="cap">${title}</text><rect x="${X(741).toFixed(1)}" y="${Y(top + 30).toFixed(1)}" width="${P(279).toFixed(1)}" height="${P(h).toFixed(1)}" rx="${P(10).toFixed(1)}" class="wire2"/>${inner}`;
}

export function heroSvg() {
  n = 0; clipN = 0; css.length = 0; clips.length = 0;
  const stackCls = stackAnim();
  const transcript = rows.map(renderRow).join('\n');
  const wl = workingLine(), comp = composer(), side = panel();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="889" viewBox="0 0 1200 889" role="img" aria-labelledby="t d">
<title id="t">The oracle screen, recreated as a wireframe</title>
<desc id="d">A wireframe of the oracle's window, laid out from the live app (1040 by 760 points) with a plain circle standing in for the bot's avatar. It plays one real turn, timed from a recording of the oracle: a question is typed and sent, the bubble slides up, a working line reads Checking system storage with a sweeping shimmer, the bot's short reply lands above it, the line changes to Typing, the answer arrives and the line leaves. The bot's computer sleeps on the right, its z's rising. The typing and the loop reset are ours. With reduced motion it shows the finished turn, still. Generated by scripts/generate-hero.mjs.</desc>
<style>
  .page { fill: #f4f3ef; } .grid { fill: #dedcd5; }
  @media (prefers-color-scheme: dark) { .page { fill: #0a0a0b; } .grid { fill: #1c1c1e; } }
  text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; letter-spacing: .15px; }
  .body { font-size: ${P(15).toFixed(1)}px; }
  .ink { fill: #f5f5f5; } .dim { fill: rgba(245,245,245,.66); } .faint { fill: rgba(245,245,245,.4); }
  .worktext { fill: rgba(245,245,245,.5); }
  .cap { fill: rgba(245,245,245,.5); font-size: 11px; font-weight: 600; letter-spacing: 1.2px; }
  .mine { fill: #3b3b3b; } .theirs { fill: #1b1b1b; stroke: #2a2a2d; stroke-width: 1; }
  .wire { fill: none; stroke: #2f2f33; } .wire2 { fill: #151515; stroke: #2a2a2d; }
  .soft { fill: #1b1b1b; stroke: #2a2a2d; } .hair { stroke: #242424; }
  .flat { fill: #262628; } .flat2 { fill: #4a4a4a; }
  .icon { fill: none; stroke: rgba(245,245,245,.66); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
  .caretglyph { fill: #f5f5f5; font-weight: 300; }
  ${css.join('\n  ')}
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
<defs>
  <pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" class="grid"/></pattern>
  <linearGradient id="glint"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="fadeTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>
  <mask id="scroll" maskUnits="userSpaceOnUse" x="${X(88)}" y="0" width="${P(632)}" height="${Y(700)}"><rect x="${X(88)}" y="${Y(60)}" width="${P(632)}" height="150" fill="url(#fadeTop)"/><rect x="${X(88)}" y="${Y(60) + 149}" width="${P(632)}" height="${Y(700) - Y(60) - 149}" fill="#fff"/></mask>
  <clipPath id="win"><rect x="24" y="24" width="1152" height="841" rx="16"/></clipPath>
  ${clips.join('\n  ')}
</defs>
<rect class="page" width="1200" height="889" rx="18"/>
<rect width="1200" height="889" rx="18" fill="url(#dots)"/>
<rect x="24" y="24" width="1152" height="841" rx="16" fill="#121212" stroke="#2c2c30"/>
<g clip-path="url(#win)">
<rect x="24" y="24" width="${P(88).toFixed(1)}" height="841" fill="#0e0e0e"/>
<g class="wire" stroke-width="1.2"><circle cx="49.5" cy="51" r="6"/><circle cx="71" cy="51" r="6"/><circle cx="92.5" cy="51" r="6"/></g>
<path d="M${X(88)} 24V865" class="hair"/>
<rect x="${X(17).toFixed(1)}" y="${Y(48).toFixed(1)}" width="${P(54).toFixed(1)}" height="${P(54).toFixed(1)}" rx="${P(12).toFixed(1)}" fill="#252525"/>
<circle cx="${X(44).toFixed(1)}" cy="${Y(75).toFixed(1)}" r="${P(17).toFixed(1)}" fill="#2e2e32" stroke="#4a4a50"/>
<circle cx="${X(56).toFixed(1)}" cy="${Y(87).toFixed(1)}" r="${P(6).toFixed(1)}" fill="rgb(246,148,18)" stroke="#0e0e0e" stroke-width="2.5"/>
<path d="M${(X(44) - 7).toFixed(1)} ${Y(644).toFixed(1)}h14M${X(44).toFixed(1)} ${(Y(644) - 7).toFixed(1)}v14" class="icon"/>
<g class="icon" transform="translate(${(X(44) - 9).toFixed(1)} ${(Y(678) - 9).toFixed(1)})"><rect x="0" y="0" width="7" height="7" rx="1.5"/><rect x="11" y="0" width="7" height="7" rx="1.5"/><rect x="0" y="11" width="7" height="7" rx="1.5"/><path d="M14.5 11V18M11 14.5H18"/></g>
<circle cx="${X(44).toFixed(1)}" cy="${Y(725).toFixed(1)}" r="${P(17).toFixed(1)}" class="soft"/><circle cx="${X(44).toFixed(1)}" cy="${(Y(725) - 5).toFixed(1)}" r="5.5" class="icon"/><path d="M${(X(44) - 10).toFixed(1)} ${(Y(725) + 10).toFixed(1)}c2-7 18-7 20 0" class="icon"/>
<circle cx="${(X(44) + 13).toFixed(1)}" cy="${(Y(725) + 12).toFixed(1)}" r="4.5" fill="#3d8bfd" stroke="#0e0e0e" stroke-width="2"/>
<rect x="${X(96).toFixed(1)}" y="${Y(10).toFixed(1)}" width="${P(36).toFixed(1)}" height="${P(36).toFixed(1)}" rx="${P(18).toFixed(1)}" class="wire"/><rect x="${(X(114) - 8.5).toFixed(1)}" y="${(Y(28) - 6.5).toFixed(1)}" width="17" height="13" rx="3" class="icon"/><path d="M${(X(114) - 3).toFixed(1)} ${(Y(28) - 6.5).toFixed(1)}v13" class="icon"/>
<rect x="${X(349).toFixed(1)}" y="${Y(10).toFixed(1)}" width="${P(106).toFixed(1)}" height="${P(40).toFixed(1)}" rx="${P(20).toFixed(1)}" class="wire2"/><circle cx="${X(368).toFixed(1)}" cy="${Y(30).toFixed(1)}" r="${P(10).toFixed(1)}" fill="#2e2e32" stroke="#4a4a50"/>
<text x="${X(384).toFixed(1)}" y="${(Y(30) + 5.5).toFixed(1)}" font-size="${P(14.5).toFixed(1)}" class="ink">Grookie</text>
<rect x="${X(635).toFixed(1)}" y="${Y(12).toFixed(1)}" width="${P(73).toFixed(1)}" height="${P(36).toFixed(1)}" rx="${P(18).toFixed(1)}" class="wire"/><text x="${X(671.5).toFixed(1)}" y="${(Y(30) + 5).toFixed(1)}" font-size="${P(13.5).toFixed(1)}" text-anchor="middle" class="ink">Share</text>
<g mask="url(#scroll)"><g class="${stackCls}">
${transcript}
</g></g>
${wl}
${comp}
${side}
</g>
</svg>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const svg = heroSvg();
  if (process.argv.includes('--stdout')) process.stdout.write(svg);
  else writeFileSync(path('docs', 'images', 'hero.svg'), svg);
}
