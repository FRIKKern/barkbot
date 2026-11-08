// docs/images/hero.svg: a wireframe of the oracle screen that plays one turn.
// Layout is measured from the 8 November screenshot. TIMING is GUESSED until
// H7 measures the oracle; then Gate B's recorded turn (traces/) replaces it.
// Never edit the SVG by hand. `--stdout` prints instead of writing.
import { writeFileSync } from 'node:fs';
import { path } from './lib/data.mjs';

export const TIMING = {
  source: 'guessed, not yet measured on the oracle (H7)',
  loop: 20,
  typeStart: 1.0, send: 4.2, wake: 4.4, ack: 5.2, workOn: 5.9, working: 6.4,
  r1: 8.6, r2: 9.3, grid: 10.0, gridLoaded: 11.5, saving: 12.1, workOff: 13.8,
  libDot: 14.1, asleep: 16.0, exit: 17.0, rewind: 17.75,
};
const DRAFT = 'How much storage do you have, and where?';
const L = TIMING.loop;
const OUT = 'cubic-bezier(.16,1,.3,1)';   // entrances and scrolls: quick start, long settle
const IN = 'cubic-bezier(.5,0,.75,0)';    // exits: leave faster than they came
const INOUT = 'cubic-bezier(.65,0,.35,1)'; // glides
const EPS = 0.002;

// ---------- keyframe builder ----------
const pct = (s) => `${((Math.min(Math.max(s, 0), L) / L) * 100).toFixed(3)}%`;
let n = 0;
const css = [];
// points: [seconds, declarations, easing for the segment that starts here]
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
// An ambient loop whose period divides L, started at `delay` so it begins when its owner appears.
function ambient(period, frames, base, delay = 0, ease = 'ease-in-out') {
  if (Math.abs(L / period - Math.round(L / period)) > 1e-9) throw new Error(`period ${period}s does not divide the ${L}s loop`);
  const name = `m${++n}`;
  css.push(`.${name}{${base};animation:${name} ${period}s ${ease} ${delay}s infinite}@keyframes ${name}{${frames}}`);
  return name;
}
const HID = 'opacity:0', VIS = 'opacity:1';
const DOWN = (px) => `opacity:0;transform:translateY(${px}px)`;
const HOME = 'opacity:1;transform:translateY(0)';
const GONE = 'opacity:0;transform:translateY(0)';
// enter at t (fade + drift), leave at x (fade, faster)
const enterLeave = (t, x, drift = 10, dur = 0.5) => anim([[0, DOWN(drift)], [t, DOWN(drift), OUT], [t + dur, HOME], [x, HOME, IN], [x + 0.35, GONE]], HOME);
// instant on at a, instant off at b
const window_ = (a, b, base = HID) => anim([[0, HID], [a - EPS, HID], [a, VIS], [b - EPS, VIS], [b, HID]], base);

// ---------- transcript rows (bottom-anchored stack) ----------
const T = TIMING;
const EXIT = { grid: T.exit, r2: T.exit + 0.08, r1: T.exit + 0.16, ack: T.exit + 0.24, user: T.exit + 0.32 };
const rows = [
  { kind: 'bot', side: 'bot', lines: [380, 420, 210], w: 460 },
  { kind: 'user', side: 'user', bar: 220, w: 260 },
  { kind: 'bot', side: 'bot', lines: [384, 250], w: 420 },
  { kind: 'user', side: 'user', bar: 296, w: 340 },
  { kind: 'bot', side: 'bot', lines: [260], w: 300 },
  { kind: 'user', side: 'user', bar: 180, w: 222 },
  { kind: 'bot', side: 'bot', lines: [372, 300], w: 410 },
  { kind: 'file', side: 'bot', id: 'file' },
  { kind: 'time', side: 'mid', id: 'time', at: T.send, exit: EXIT.user },
  { kind: 'said', side: 'user', id: 'user', text: DRAFT, w: 334, at: T.send, exit: EXIT.user },
  { kind: 'reply', side: 'bot', id: 'ack', text: 'I’ll check the disk space on my computer.', w: 343, at: T.ack, exit: EXIT.ack },
  { kind: 'reply', side: 'bot', id: 'r1', text: '38 GB free of 75 GB, on my computer in Nuremberg.', w: 424, skeleton: 372, at: T.r1, exit: EXIT.r1 },
  { kind: 'reply', side: 'bot', id: 'r2', text: 'Here are the pictures I saved today:', w: 305, skeleton: 252, at: T.r2, exit: EXIT.r2 },
  { kind: 'grid', side: 'bot', id: 'grid', at: T.grid, exit: EXIT.grid },
];
const H = { bot: (r) => 39 + (r.lines.length - 1) * 23, user: () => 38, file: () => 79, time: () => 16, said: () => 39, reply: () => 39, grid: () => 124 };
let y = 0;
rows.forEach((r, i) => {
  const p = rows[i - 1];
  if (p) y += r.kind === 'time' || p.kind === 'time' ? 16 : r.side === p.side ? 6 : 16;
  r.y = y; r.h = H[r.kind](r); y += r.h;
});
const row = Object.fromEntries(rows.filter((r) => r.id).map((r) => [r.id, r]));
const BOTTOM = 776;            // content rests here when nothing is working
const WL = 752;                // working line centre
const WORK = WL - 26;          // content rests here while the working line shows
const off = (id, anchor) => anchor - (row[id].y + row[id].h);

const stackEvents = [
  [T.send, off('user', BOTTOM), 0.6, OUT],
  [T.ack, off('ack', BOTTOM), 0.6, OUT],
  [T.workOn, off('ack', WORK), 0.6, OUT],
  [T.r1, off('r1', WORK), 0.6, OUT],
  [T.r2, off('r2', WORK), 0.6, OUT],
  [T.grid, off('grid', WORK), 0.7, OUT],
  [T.workOff, off('grid', BOTTOM), 0.6, INOUT],
  [T.rewind, off('file', BOTTOM), 0.9, INOUT],
];
const ty = (v) => `transform:translateY(${v.toFixed(1)}px)`;
function stackAnim() {
  let cur = off('file', BOTTOM);
  const pts = [[0, ty(cur)]];
  for (const [t, to, d, e] of stackEvents) { pts.push([t, ty(cur), e], [t + d, ty(to)]); cur = to; }
  if (cur !== off('file', BOTTOM)) throw new Error('the stack does not return to its start, so the loop would jump');
  return anim(pts, ty(off('grid', BOTTOM)));
}

let clipN = 0;
const clips = [];
function clip(shape) { const id = `c${++clipN}`; clips.push(`<clipPath id="${id}">${shape}</clipPath>`); return id; }
// a soft light that sweeps once per period, starting when its owner appears
function sweep(x, yy, w, h, rx, period, delay, strength = 'shine') {
  const id = clip(`<rect x="${x}" y="${yy}" width="${w}" height="${h}" rx="${rx}"/>`);
  const band = Math.max(90, w * 0.45);
  const cls = ambient(period, `0%{transform:translateX(0)}100%{transform:translateX(${(w + band).toFixed(0)}px)}`, 'transform:translateX(0)', delay, INOUT);
  return `<g clip-path="url(#${id})"><rect class="${cls}" x="${(x - band).toFixed(0)}" y="${yy}" width="${band.toFixed(0)}" height="${h}" fill="url(#${strength})"/></g>`;
}

function renderRow(r) {
  const g = (inner, cls = '') => `<g transform="translate(0 ${r.y})"><g${cls ? ` class="${cls}"` : ''}>${inner}</g></g>`;
  if (r.kind === 'bot') {
    const bars = r.lines.map((w, k) => `<rect x="158" y="${15.5 + k * 23}" width="${w}" height="8" rx="4" class="flat"/>`).join('');
    return g(`<rect x="140.5" y=".5" width="${r.w}" height="${r.h - 1}" rx="18" class="wire2"/>${bars}`);
  }
  if (r.kind === 'user') return g(`<rect x="${804 - r.w}" y="0" width="${r.w}" height="38" rx="19" class="mine-old"/><rect x="${821 - r.w}" y="15" width="${r.bar}" height="8" rx="4" class="flat2"/>`);
  if (r.kind === 'file') return g(`<rect x="140.5" y=".5" width="331" height="78" rx="19" class="wire2"/><rect x="164.5" y="23.5" width="25" height="32" rx="5" class="wire"/><path d="M170 33H184M170 39H184M170 45H180" stroke="#6a6a70" stroke-width="1.6" stroke-linecap="round"/><text x="210" y="36" font-size="15" class="ink">BARKBOT_HANDOV… .md</text><text x="210" y="57" font-size="13" class="dim">11kB</text>`);
  if (r.kind === 'time') return g(`<text x="471" y="12" font-size="12.5" text-anchor="middle" class="faint">Today 9:17 PM</text>`, enterLeave(r.at, r.exit, 6));
  if (r.kind === 'said') return g(`<rect x="${804 - r.w}" y="0" width="${r.w}" height="39" rx="19.5" fill="#26262a"/><text x="${821 - r.w}" y="25" font-size="15.5" class="ink">${r.text}</text>`, enterLeave(r.at + 0.06, r.exit, 12));
  if (r.kind === 'reply') {
    let inner = `<rect x="140.5" y=".5" width="${r.w}" height="38" rx="19" class="wire2"/>`;
    if (r.skeleton) {
      const until = r.at + 0.9;
      const sk = anim([[0, VIS], [until, VIS, OUT], [until + 0.3, HID]], HID);
      const tx = anim([[0, HID], [until, HID, OUT], [until + 0.4, VIS]], VIS);
      inner += `<g class="${sk}"><rect x="158" y="15" width="${r.skeleton}" height="9" rx="4.5" class="flat"/>${sweep(158, 15, r.skeleton, 9, 4.5, 1, r.at + 0.06)}</g>`;
      inner += `<text x="158" y="25" font-size="15.5" class="ink ${tx}">${r.text}</text>`;
    } else inner += `<text x="158" y="25" font-size="15.5" class="ink">${r.text}</text>`;
    return g(inner, enterLeave(r.at + 0.06, r.exit, 10));
  }
  if (r.kind === 'grid') {
    const tiles = [[140.5, 165], [312.5, 196], [515.5, 156]];
    const content = [
      `<g class="wire"><rect x="153.5" y="13.5" width="140" height="98" rx="5"/><path d="M153.5 27.5H293.5"/></g><rect x="162" y="36" width="60" height="6" rx="3" fill="#2a2a2e"/><rect x="162" y="49" width="118" height="6" rx="3" fill="#232326"/><rect x="162" y="62" width="96" height="6" rx="3" fill="#232326"/><rect x="232" y="85" width="52" height="16" rx="8" fill="#2a2a2e"/>`,
      `<rect x="324.5" y="13.5" width="172" height="98" rx="5" class="wire"/><rect x="412" y="22" width="76" height="14" rx="7" fill="#2c2c30"/><rect x="333" y="45" width="110" height="6" rx="3" fill="#232326"/><rect x="333" y="58" width="140" height="18" rx="6" fill="#1f1f22" stroke="#2f2f33"/><rect x="333" y="83" width="120" height="18" rx="6" fill="#1f1f22" stroke="#2f2f33"/>`,
      `<rect x="527.5" y="13.5" width="132" height="98" rx="5" class="wire"/><rect x="536" y="23" width="70" height="6" rx="3" fill="#2a2a2e"/><rect x="584" y="37" width="66" height="10" rx="5" fill="#2c2c30"/><rect x="516" y="1" width="155" height="123" rx="10" fill="#0f0f10" opacity=".72"/><text x="593.5" y="70" font-size="24" font-weight="500" text-anchor="middle" class="ink">+2</text>`,
    ];
    const inner = tiles.map(([x, w], i) => {
      const at = r.at + 0.06 + i * 0.07, loaded = T.gridLoaded + i * 0.07, leave = r.exit + (2 - i) * 0.04;
      const ld = anim([[0, VIS], [loaded, VIS, OUT], [loaded + 0.4, HID]], HID);
      const ct = anim([[0, HID], [loaded, HID, OUT], [loaded + 0.5, VIS]], VIS);
      return `<g class="${enterLeave(at, leave, 10)}"><rect x="${x}" y=".5" width="${w}" height="123" rx="10" class="wire2"/><g class="${ld}"><rect x="${x + 0.5}" y="1" width="${w - 1}" height="122" rx="10" class="flat"/>${sweep(x + 0.5, 1, w - 1, 122, 10, 1.25, at)}</g><g class="${ct}">${content[i]}</g></g>`;
    }).join('');
    return g(inner);
  }
  throw new Error(`unknown row ${r.kind}`);
}

// ---------- the working line: one line, fixed at the bottom, label changes ----------
function workingLine() {
  const grp = anim([[0, DOWN(6)], [T.workOn, DOWN(6), OUT], [T.workOn + 0.5, HOME], [T.workOff, HOME, IN], [T.workOff + 0.3, GONE]], 'opacity:0');
  const a = anim([[0, HOME], [T.saving, HOME, IN], [T.saving + 0.25, 'opacity:0;transform:translateY(-5px)']], HOME);
  const b = anim([[0, DOWN(5)], [T.saving + 0.15, DOWN(5), OUT], [T.saving + 0.6, HOME]], HOME);
  const label = (text, w, delay) => {
    const id = clip(`<text x="172" y="${WL + 5}" font-size="15">${text}</text>`);
    const glint = ambient(2.5, `0%{transform:translateX(0)}70%,100%{transform:translateX(${w + 120}px)}`, 'transform:translateX(0)', delay, INOUT);
    const dots = [0, 1, 2].map((k) => `<circle cx="${172 + w + 12 + k * 9}" cy="${WL + 0.5}" r="2.2" fill="#9d9da3" class="${ambient(1.25, '0%,100%{opacity:.2}45%{opacity:.75}', 'opacity:.5', delay + k * 0.18)}"/>`).join('');
    return `<text x="172" y="${WL + 5}" font-size="15" fill="#808086">${text}</text><g clip-path="url(#${id})"><rect class="${glint}" x="92" y="${WL - 12}" width="80" height="24" fill="url(#glint)"/></g>${dots}`;
  };
  return `<g class="${grp}"><circle cx="152" cy="${WL}" r="9" fill="#26262a" stroke="#45454b"/><g class="${a}">${label('Checking the storage', 148, T.workOn)}</g><g class="${b}">${label('Saving to Library', 124, T.saving)}</g></g>`;
}

// ---------- composer: placeholder, caret, typing one character at a time ----------
function composer() {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const times = [];
  let t = T.typeStart;
  for (const c of DRAFT) { times.push(t); t += 0.034 + rnd() * 0.036 + (c === ' ' ? 0.06 : 0) + (c === ',' ? 0.18 : 0); }
  if (t > T.send - 0.25) throw new Error('typing runs into the send');
  const ph = anim([[0, VIS], [T.typeStart - EPS, VIS], [T.typeStart, HID], [T.send + 0.05, HID, OUT], [T.send + 0.4, VIS]], VIS);
  const caretWin = anim([[0, VIS], [T.typeStart - EPS, VIS], [T.typeStart, HID], [T.send + 0.05, HID], [T.send + 0.06, VIS]], VIS);
  const blink = ambient(1, '0%,45%{opacity:1}55%,95%{opacity:0}100%{opacity:1}', 'opacity:1', 0, 'linear');
  const typed = [...DRAFT].map((_, i) => {
    const a = times[i], b = i + 1 < DRAFT.length ? times[i + 1] : T.send;
    const pts = i + 1 < DRAFT.length
      ? [[0, HID], [a - EPS, HID], [a, VIS], [b - EPS, VIS], [b, HID]]
      : [[0, HID], [a - EPS, HID], [a, VIS], [b, VIS, IN], [b + 0.15, HID]];
    const text = DRAFT.slice(0, i + 1).replace(/&/g, '&amp;');
    return `<text x="189" y="830" font-size="15.5" class="ink ${anim(pts, HID)}">${text}<tspan class="caretglyph" dx="1">|</tspan></text>`;
  }).join('\n');
  const press = anim([[0, 'transform:scale(1)'], [T.send - 0.14, 'transform:scale(1)', OUT], [T.send - 0.04, 'transform:scale(.88)', OUT], [T.send + 0.35, 'transform:scale(1)']], 'transform:scale(1);transform-box:fill-box;transform-origin:center');
  return `<rect x="140.5" y="801.5" width="663" height="46" rx="23" class="wire2"/>
<circle cx="164" cy="824.5" r="14.5" class="wire"/><path d="M158 824.5H170M164 818.5V830.5" class="icon"/>
<text x="191" y="830" font-size="15.5" class="faint ${ph}">Message Grookie</text>
<g class="${caretWin}"><path d="M188.5 813V836" stroke="#e9e9e7" stroke-width="1.5" class="${blink}"/></g>
${typed}
<circle cx="739" cy="824.5" r="14.5" class="wire"/><rect x="735" y="816.5" width="8" height="12" rx="4" class="icon"/><path d="M731.5 824.5C731.5 831 746.5 831 746.5 824.5M739 830.5V833" class="icon"/>
<g class="${press}"><circle cx="779" cy="824.5" r="15" fill="#e9e9e7"/><path d="M772 821.5V827.5M776 818V831M780 815.5V833.5M784 819V830M788 822V827" stroke="#0f0f10" stroke-width="2" stroke-linecap="round"/></g>`;
}

// ---------- right panel ----------
function panel() {
  const ring = (t, scale, peak) => anim([[0, 'opacity:0;transform:scale(1)'], [t, `opacity:${peak};transform:scale(1)`, OUT], [t + 1, `opacity:0;transform:scale(${scale})`]], 'opacity:0;transform-box:fill-box;transform-origin:center');
  const asleep = anim([[0, VIS], [T.wake, VIS, OUT], [T.wake + 0.4, HID], [T.asleep, HID, OUT], [T.asleep + 0.7, VIS]], VIS);
  const waking = anim([[0, HID], [T.wake, HID, OUT], [T.wake + 0.4, VIS], [T.working, VIS, OUT], [T.working + 0.4, HID]], HID);
  const working = anim([[0, HID], [T.working, HID, OUT], [T.working + 0.4, VIS], [T.asleep, VIS, OUT], [T.asleep + 0.7, HID]], HID);
  const libDot = anim([[0, HID], [T.libDot, HID, OUT], [T.libDot + 0.4, VIS], [T.exit, VIS, IN], [T.exit + 0.35, HID]], VIS);
  const libInk = anim([[0, HID], [T.libDot, HID, OUT], [T.libDot + 0.4, VIS], [T.libDot + 1.6, VIS, INOUT], [T.libDot + 2.4, HID]], HID);
  return `<path d="M821.5 24V865" class="hair"/>
<circle cx="1142" cy="58" r="19" class="wire"/><path d="M1136.5 52.5L1147.5 63.5M1147.5 52.5L1136.5 63.5" class="icon"/>
<circle cx="1001" cy="135" r="32" fill="#26262a" stroke="#45454b"/>
<text x="1001" y="205" font-size="18" font-weight="500" text-anchor="middle" class="ink">Grookie</text>
<rect x="933.5" y="233.5" width="68" height="29" rx="14.5" fill="#202023" stroke="#303035"/>
<text x="967.5" y="253" font-size="13.5" text-anchor="middle" class="ink">Activity</text>
<text x="1037" y="253" font-size="13.5" text-anchor="middle" class="dim">Library</text>
<text x="1037" y="253" font-size="13.5" text-anchor="middle" class="ink ${libInk}">Library</text>
<circle cx="1064" cy="240" r="3.5" fill="none" stroke="#f08c2e" stroke-width="1.2" class="${ring(T.libDot, 3, 0.8)}"/>
<circle cx="1064" cy="240" r="3.5" fill="#f08c2e" class="${libDot}"/>
<text x="853" y="296" class="cap">CODING</text>
<rect x="840.5" y="309.5" width="318" height="63" rx="13" class="wire2"/>
<g fill="none" stroke="#4d8ef7" stroke-width="1.5"><circle cx="862" cy="332" r="3"/><circle cx="862" cy="350" r="3"/><circle cx="874" cy="350" r="3"/><path d="M862 335V347M874 347V340C874 336.5 871.5 334.5 868 334.5"/></g>
<text x="885" y="336" font-size="14" class="ink">Barkpark remote-agent cloud fe…</text>
<text x="885" y="356" font-size="13" class="dim">Ready for review · #25415</text>
<path d="M1134 336l5 5-5 5" class="icon"/>
<text x="853" y="426" class="cap">SUGGESTED</text>
<rect x="840.5" y="439.5" width="318" height="88" rx="13" class="wire2"/>
<rect x="859.5" y="456.5" width="14" height="14" rx="4" fill="none" stroke="#9d9da3" stroke-width="1.3" stroke-dasharray="2.5 2"/>
<text x="887" y="468" font-size="14" class="ink">Add to Slack</text><path d="M1134 458l5 5-5 5" class="icon"/>
<path d="M856 483.5H1143" class="hair"/>
<circle cx="866.5" cy="505" r="7" class="icon"/><path d="M866.5 501.5V505L868.8 507" class="icon"/>
<text x="887" y="510" font-size="14" class="ink">Create a routine</text><path d="M1134 500l5 5-5 5" class="icon"/>
<text x="853" y="571" class="cap">COMPUTER</text>
<rect x="840.5" y="584.5" width="318" height="67" rx="13" class="wire2"/>
<text x="856" y="612" font-size="14" class="ink">Bot’s computer</text>
<rect x="1074.5" y="596.5" width="70" height="43" rx="8" class="wire"/>
<g class="${asleep}"><text x="856" y="633" font-size="13" class="dim">Asleep</text><circle cx="1109.5" cy="618" r="9" fill="#26262a" stroke="#45454b"/><text x="1129" y="608" font-size="9" class="faint">z</text><text x="1134" y="603" font-size="7" class="faint">z</text></g>
<g class="${waking}"><circle cx="860" cy="628.5" r="3.5" fill="#efb453"/><text x="870" y="633" font-size="13" class="dim">Waking</text><circle cx="1109.5" cy="618" r="9" fill="#26262a" stroke="#efb453"/></g>
<g class="${working}"><circle cx="860" cy="628.5" r="3.5" fill="#4cc38a"/><circle cx="860" cy="628.5" r="3.5" fill="none" stroke="#4cc38a" stroke-width="1.2" class="${ring(T.working, 2.6, 0.7)}"/><text x="870" y="633" font-size="13" class="dim">Working</text><rect x="1081" y="603" width="57" height="30" rx="4" fill="#141416"/><rect x="1086" y="608" width="30" height="4" rx="2" class="flat2"/><rect x="1086" y="616" width="46" height="4" rx="2" class="flat2"/><rect x="1086" y="624" width="38" height="4" rx="2" class="flat2"/></g>
<text x="853" y="695" class="cap">VOICE CHAT</text>
<rect x="840.5" y="708.5" width="318" height="108" rx="13" class="wire2"/>
<g font-size="14"><text x="856" y="736" class="ink">Voice</text><text x="1122" y="736" text-anchor="end" class="dim">Liora</text><text x="856" y="768" class="ink">Speed</text><text x="1122" y="768" text-anchor="end" class="dim">1x</text><text x="856" y="800" class="ink">Language</text><text x="1122" y="800" text-anchor="end" class="dim">Auto-detect</text></g>
<g class="icon" stroke-width="1.3"><path d="M1129 730l3.5 3.5 3.5-3.5"/><path d="M1129 762l3.5 3.5 3.5-3.5"/><path d="M1129 794l3.5 3.5 3.5-3.5"/></g>
<path d="M856 748.5H1143M856 780.5H1143" class="hair"/>`;
}

export function heroSvg() {
  n = 0; clipN = 0; css.length = 0; clips.length = 0;
  const stackCls = stackAnim();
  const transcript = rows.map(renderRow).join('\n');
  const wl = workingLine(), comp = composer(), side = panel();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="889" viewBox="0 0 1200 889" role="img" aria-labelledby="t d">
<title id="t">The oracle screen, recreated as a wireframe</title>
<desc id="d">A wireframe of the oracle's desktop window, laid out from measurements of a screenshot of 8 November 2026, with a plain circle standing in for the bot's avatar. It plays one turn in a ${L} second loop: a message is typed and sent, the bot says it will check, one working line at the bottom reads Checking the storage while the Computer card wakes, replies arrive above it and the conversation scrolls up, a picture grid loads, the line changes to Saving to Library, and a dot lands on the Library tab. Timing is ${TIMING.source}. With reduced motion it shows the finished turn, still. Generated by scripts/generate-hero.mjs.</desc>
<style>
  .page { fill: #f4f3ef; } .grid { fill: #dedcd5; }
  @media (prefers-color-scheme: dark) { .page { fill: #0a0a0b; } .grid { fill: #1c1c1e; } }
  text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  .ink { fill: #e9e9e7; } .dim { fill: #8a8a8f; } .faint { fill: #5c5c61; }
  .cap { fill: #6e6e74; font-size: 11px; font-weight: 600; letter-spacing: 1.4px; }
  .wire { fill: none; stroke: #2f2f33; } .wire2 { fill: #131315; stroke: #2f2f33; }
  .soft { fill: #19191c; stroke: #303035; } .hair { stroke: #232326; }
  .mine-old { fill: #1c1c1f; } .flat { fill: #1f1f23; } .flat2 { fill: #2a2a2f; }
  .icon { fill: none; stroke: #9d9da3; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
  .caretglyph { fill: #e9e9e7; font-weight: 300; }
  ${css.join('\n  ')}
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
<defs>
  <pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" class="grid"/></pattern>
  <linearGradient id="glint"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="shine"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".09"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="fadeTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>
  <mask id="scroll" maskUnits="userSpaceOnUse" x="120" y="0" width="702" height="800"><rect x="120" y="84" width="702" height="190" fill="url(#fadeTop)"/><rect x="120" y="273" width="702" height="517" fill="#fff"/></mask>
  <clipPath id="win"><rect x="24" y="24" width="1152" height="841" rx="16"/></clipPath>
  ${clips.join('\n  ')}
</defs>
<rect class="page" width="1200" height="889" rx="18"/>
<rect width="1200" height="889" rx="18" fill="url(#dots)"/>
<rect x="24" y="24" width="1152" height="841" rx="16" fill="#0f0f10" stroke="#2c2c30"/>
<g clip-path="url(#win)">
<g class="wire" stroke-width="1.2"><circle cx="49.5" cy="51" r="6"/><circle cx="71" cy="51" r="6"/><circle cx="92.5" cy="51" r="6"/></g>
<path d="M119.5 24V865" class="hair"/>
<rect x="42" y="77" width="58" height="58" rx="13" class="soft"/>
<circle cx="71" cy="106" r="18" fill="#26262a" stroke="#45454b"/>
<circle cx="88" cy="123" r="6.5" fill="#f08c2e" stroke="#0f0f10" stroke-width="2.5"/>
<path d="M63 738H79M71 730V746" class="icon"/>
<g class="icon"><rect x="62" y="767" width="7" height="7" rx="1.5"/><rect x="73" y="767" width="7" height="7" rx="1.5"/><rect x="62" y="778" width="7" height="7" rx="1.5"/><path d="M76.5 778V785M73 781.5H80"/></g>
<circle cx="71" cy="828" r="17" class="soft"/><circle cx="71" cy="823" r="5.5" class="icon"/><path d="M61 838C63 831 79 831 81 838" class="icon"/>
<circle cx="84" cy="840" r="4.5" fill="#3d8bfd" stroke="#0f0f10" stroke-width="2"/>
<circle cx="150" cy="55" r="19" class="wire"/><rect x="141.5" y="48.5" width="17" height="13" rx="3" class="icon"/><path d="M147 48.5V61.5" class="icon"/>
<rect x="386.5" y="36.5" width="116" height="39" rx="19.5" class="wire2"/><circle cx="408" cy="56" r="11" fill="#26262a" stroke="#45454b"/>
<text x="428" y="61.5" font-size="15.5" class="ink">Grookie</text>
<rect x="750.5" y="37.5" width="79" height="38" rx="19" class="wire"/><text x="790" y="61.5" font-size="14.5" text-anchor="middle" class="ink">Share</text>
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
