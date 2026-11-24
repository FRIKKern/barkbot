// npm run check: the repo's own rules. Every rule counts what it checked,
// and a rule that checked nothing fails (no skip-pass).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { path, read, items, journeys, slices } from './lib/data.mjs';
import { roadmapSvg } from './generate-roadmap.mjs';
import { journeysSvg, parityMd } from './generate-parity.mjs';
import { heroSvg } from './generate-hero.mjs';
import { controls, claims, unscoredBoxes } from './lib/controls.mjs';
import { boxCases, boxElements } from './lib/box-cases.mjs';
import { turnTraces } from './lib/turn-traces.mjs';
import { EXCEPTIONS, exception, judged } from './lib/versions.mjs';
import { guardBeforeSend } from './lib/host-guard.mjs';
import { sceneCard } from './lib/cards.mjs';
import { hostedNote, CLOCKS } from './lib/gate-b-hosted.mjs';
import { pickByLabel } from './lib/hover-label.mjs';
import { appSources, doorReds } from './lib/session-doors.mjs';
import { CASES as DOOR_CASES } from './lib/session-doors-cases.mjs';
import { VIEWER, dropPicked, labelPressAllowed, markPicked, pickedName, underPoint } from './lib/press-guard.mjs';

const fails = [];
const ran = {};
const rule = (name, n) => { ran[name] = (ran[name] || 0) + n; };
const fail = (msg) => fails.push(msg);

// 1. Doc caps: tighten, never raise.
const CAPS = { 'README.md': 80, 'AGENTS.md': 40, 'CONTRIBUTING.md': 30, 'QUALITY.md': 80, 'JOURNEYS.md': 40, 'docs/ROADMAP.md': 30 };
const decisions = readdirSync(path('docs', 'decisions')).filter((f) => f.endsWith('.md'));
for (const d of decisions) CAPS[`docs/decisions/${d}`] = 40;
for (const [f, cap] of Object.entries(CAPS)) {
  const n = read(f).trimEnd().split('\n').length;
  rule('doc caps', 1);
  if (n > cap) fail(`${f}: ${n} lines, cap ${cap}`);
}

// 2. Local links in tracked Markdown resolve.
const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: path(), encoding: 'utf8' }).split('\n').filter(Boolean);
for (const f of tracked.filter((t) => t.endsWith('.md'))) {
  for (const m of read(f).matchAll(/\]\(([^)\s#]+)(#[^)]*)?\)/g)) {
    const target = m[1];
    if (/^[a-z]+:/i.test(target)) continue;
    rule('links', 1);
    if (!existsSync(join(path(), dirname(f), target))) fail(`${f}: broken link ${target}`);
  }
}

// 3. Items: known status, unique ids, real journeys and slices, evidence on done, decisions on outOfScope.
const its = items();
const jIds = new Set(journeys().map((j) => j.id));
const sIds = new Set(slices().map((s) => s.id));
const statuses = new Set(['done', 'partial', 'open', 'unknown']);
const seen = new Set();
for (const i of its) {
  rule('items', 1);
  if (seen.has(i.id)) fail(`items: duplicate id ${i.id}`);
  if (i.file !== `${i.id}.json`) fail(`items: ${i.file} holds ${i.id}; the file is named for its id`);
  seen.add(i.id);
  if (!statuses.has(i.status)) fail(`items: ${i.id} has status "${i.status}"`);
  if (!sIds.has(i.slice)) fail(`items: ${i.id} names unknown slice ${i.slice}`);
  if (i.journey && !jIds.has(i.journey)) fail(`items: ${i.id} names unknown journey ${i.journey}`);
  if (i.status === 'done' && (!i.gate || !i.evidence)) fail(`items: ${i.id} is done without gate and evidence`);
  for (const o of i.outOfScope || []) {
    const num = /^(\d{4}):/.exec(o)?.[1];
    if (!num || !decisions.some((d) => d.startsWith(num))) fail(`items: ${i.id} outOfScope "${o}" names no decision file`);
  }
}
for (const j of jIds) {
  rule('journeys covered', 1);
  if (!its.some((i) => i.journey === j)) fail(`journeys: ${j} has no item in parity/items/`);
}

// 4. Generated files match their sources.
const gen = [
  ['docs/images/hero.svg', heroSvg()],
  ['docs/images/roadmap.svg', roadmapSvg()],
  ['docs/images/journeys.svg', journeysSvg()],
  ['docs/PARITY.md', parityMd()],
];
for (const [f, want] of gen) {
  rule('fresh pictures', 1);
  if (!existsSync(path(f)) || readFileSync(path(f), 'utf8') !== want) fail(`${f} is stale: run npm run docs`);
}

// 5. No secrets in tracked files.
const SECRET = /(sk-ant-[A-Za-z0-9_-]{10,}|CLAUDE_CODE_OAUTH_TOKEN\s*=\s*\S{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
for (const f of tracked) {
  if (/\.(png|jpe?g|webp|gif)$/i.test(f) || !existsSync(path(f))) continue; // a deleted file has nothing to leak
  rule('secrets', 1);
  if (SECRET.test(readFileSync(path(f), 'utf8'))) fail(`${f}: looks like a secret`);
}

// 6. Inventory, offline: every control in every captured state belongs to an item (its `controls`).
const stateFiles = readdirSync(path('fixtures', 'states')).filter((f) => f.endsWith('.json'));
for (const f of stateFiles) {
  const state = judged(JSON.parse(read('fixtures', 'states', f)));
  for (const name of new Set(controls(state).map((c) => c.name))) {
    rule('controls tracked', 1);
    if (!its.some((i) => claims(i, name))) fail(`inventory: ${f} has control "${name}" that no item in parity/items/ claims`);
  }
}

// 6b. Every captured state comes from ONE oracle version. A Grok update moves numbers, so a
// mix means some states were measured on a different app: re-capture the stale ones. The one
// way past it is a named exception (scripts/lib/versions.mjs): that state, that version, a reason.
const versions = new Map();
for (const f of stateFiles) {
  rule('one oracle version', 1);
  const id = f.replace(/\.json$/, '');
  const v = JSON.parse(read('fixtures', 'states', f)).version;
  const ex = exception(id);
  if (!v) fail(`fixtures: ${f} names no oracle version: re-capture it`);
  else if (ex && v !== ex.version) fail(`fixtures: ${f} is excepted for ${ex.version} but was captured on ${v}: re-capture it, or correct the exception`);
  else if (!ex) versions.set(v, [...(versions.get(v) || []), f]);
}
const [baseline] = [...versions].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
if (versions.size > 1) {
  const main = baseline;
  for (const [v, fs] of versions) if (v !== main) fail(`fixtures: ${fs.length} state(s) captured on ${v}, the rest on ${main}: re-capture ${fs.slice(0, 4).join(', ')}${fs.length > 4 ? ', …' : ''}`);
}
for (const ex of EXCEPTIONS) {
  rule('one oracle version', 1);
  if (!stateFiles.includes(`${ex.id}.json`)) fail(`fixtures: the version exception for ${ex.id} names no state in fixtures/states: remove it`);
  if (!ex.version || !ex.reason) fail(`fixtures: the version exception for ${ex.id} needs a version and a reason`);
  if (ex.version === baseline) fail(`fixtures: ${ex.id} is excepted for ${ex.version}, which is the baseline itself: remove the exception`);
}

// 7. Gate A has a recorded run for every captured state, and it checked something.
for (const f of stateFiles) {
  rule('gate records', 1);
  const id = f.replace(/\.json$/, '');
  const file = path('parity', 'gate-a', `${id}.json`);
  const s = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  if (!s) fail(`gate: no Gate A run for ${id}: run npm run gate`);
  else if (!s.cases) fail(`gate: the Gate A run for ${id} checked nothing`);
}

// 7b. Gate B: every turn trace names its oracle version; each one Gate B judges has a recorded
// run that checked something; no record is left for a trace it no longer judges (superseded by a
// re-record on a newer oracle, scripts/lib/turn-traces.mjs), so no stale score is read as current.
const turns = turnTraces();
for (const t of turns.unversioned) { rule('turn records', 1); fail(`traces: ${t.id} names no oracle_version: re-record it`); }
for (const t of turns.judged) {
  rule('turn records', 1);
  const file = path('parity', 'gate-b', `${t.id}.json`);
  const s = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  if (!s) fail(`gate: no Gate B run for ${t.id}: run npm run gate:b`);
  else if (!s.cases) fail(`gate: the Gate B run for ${t.id} checked nothing`);
}
for (const f of readdirSync(path('parity', 'gate-b')).filter((x) => x.endsWith('.json'))) {
  rule('turn records', 1);
  const id = f.replace(/\.json$/, '');
  const old = turns.superseded.find((x) => x.trace.id === id);
  if (old) fail(`gate: parity/gate-b/${f} is the run of a superseded trace (oracle ${old.trace.oracle_version}; ${old.by.map((t) => t.id).join(', ')} replace it): remove it`);
  else if (!turns.judged.some((t) => t.id === id)) fail(`gate: parity/gate-b/${f} has no turn trace in traces/`);
}

// The live turn's check before a send fails closed (scripts/lib/host-guard.mjs, PR #288 reviews):
// a stub page, so no live send. A hook that never ran, or bubbles with no conversation stream,
// refuses. A page with no conversation yet goes only when it shows the --bot asked for on HOST's
// computer. The guard itself sends nothing.
const SID = '00000000-0000-4000-8000-0000000002a8', BOT = '00000000-0000-5000-8000-0000000002b0', VM = 'host-vm', MAC = 'host-mac';
const stub = (seen) => { const sent = []; return { sent, page: { evaluate: async () => seen, send: async (m) => { sent.push(m); } } }; };
const want = (bot, hostId) => ({ bot, hostId: async () => hostId });
for (const [name, seen, bubbles, w, expect] of [
  ['hook missing, empty page', { streams: undefined, bot: BOT, host: VM }, 0, want(BOT, VM), 'refuse'],
  ['hook missing, bubbles shown', { streams: undefined, bot: BOT, host: VM }, 3, want(BOT, VM), 'refuse'],
  ['hook ran, no conversation stream, bubbles shown', { streams: [], bot: BOT, host: VM }, 2, want(BOT, VM), 'refuse'],
  ['hook ran, only other streams, bubbles shown', { streams: ['http://localhost/api/other/events'], bot: BOT, host: VM }, 1, want(BOT, VM), 'refuse'],
  ['empty page, its bot on another computer', { streams: [], bot: BOT, host: MAC }, 0, want(BOT, VM), 'refuse'],
  ['empty page, no --bot given', { streams: [], bot: BOT, host: VM }, 0, want(null, VM), 'refuse'],
  ['empty page, another bot opened than --bot (rail[0])', { streams: [], bot: 'other-bot', host: VM }, 0, want(BOT, VM), 'refuse'],
  ['empty page, the page shows no bot or computer', { streams: [], bot: null, host: null }, 0, want(BOT, VM), 'refuse'],
  ['empty page, the computer named is not enrolled', { streams: [], bot: BOT, host: VM }, 0, want(BOT, null), 'refuse'],
  ['empty page, --bot on the computer named', { streams: [], bot: BOT, host: VM }, 0, want(BOT, VM), 'fresh'],
  ['hook ran, the conversation stream', { streams: [`http://localhost/api/chat/${SID}/events`], bot: BOT, host: MAC }, 2, want(BOT, VM), 'sid'],
]) {
  rule('host guard', 1);
  const s = stub(seen);
  const g = await guardBeforeSend(s.page, bubbles, w);
  const got = g.refuse ? 'refuse' : g.fresh ? 'fresh' : g.sid === SID ? 'sid' : JSON.stringify(g);
  if (got !== expect) fail(`host guard: ${name}: ${got}, not ${expect}`);
  if (s.sent.length) fail(`host guard: ${name}: the guard sent ${s.sent.length} CDP call(s)`);
}
// And turn-live sends only through sendText, whose first step is onHost({ before }). Outside its
// body no line may send by any other door (rev288b, task-908564cd6e7e80a3): a CDP Input.* call, a
// CDP method named by anything but a plain 'Domain.method' string, a DOM event (dispatchEvent),
// a form submit, a fetch or Barkpark call that writes (POST, PUT, PATCH, DELETE; live.call), or a
// click on anything but the answer control itself (.ask-allow / .ask-choice, as the element clicked).
// A text rule cannot see every way to send; this one names the doors there are.
{
  const lines = read('scripts/turn-live.mjs').split('\n');
  const from = lines.findIndex((l) => /^const sendText = async \(text, before\) => \{$/.test(l));
  const to = from < 0 ? -1 : lines.findIndex((l, i) => i > from && l === '};');
  rule('host guard', 1);
  if (from < 0 || to < 0) fail('host guard: scripts/turn-live.mjs has no `const sendText = async (text, before) => {` ... `};`');
  else if (lines[from + 1].trim() !== 'await onHost({ before });') fail(`host guard: scripts/turn-live.mjs:${from + 2}: sendText does not start with await onHost({ before })`);
  const ANSWER = /^\.ask-(allow|choice)\b/;
  // Every click on the line, and whether its element is the answer control: picked straight from
  // the query (querySelector('.ask-choice')[1].click()), or a const set from that query on the line.
  const clicksOk = (l) => {
    const clicks = l.match(/\bclick\b/g)?.length ?? 0;
    if (!clicks) return true;
    const picked = new Set([...l.matchAll(/\bconst (\w+) = document\.querySelector\('([^']*)'\)/g)].filter((m) => ANSWER.test(m[2])).map((m) => m[1]));
    let ok = 0;
    for (const m of l.matchAll(/querySelector(?:All)?\('([^']*)'\)(?:\[\d+\])?\.click\(\)/g)) if (ANSWER.test(m[1])) ok++;
    for (const m of l.matchAll(/(?<![\w.'")\]])(\w+)\.click\(\)/g)) if (picked.has(m[1])) ok++;
    return ok === clicks;
  };
  const doors = [
    ['a CDP Input.* call', (l) => /['"`]Input\./.test(l)],
    ['a CDP method that is not a plain string', (l) => /\.send\(/.test(l) && !/\.send\(\s*'[A-Z][A-Za-z]*\.[A-Za-z]+'\s*[,)]/.test(l)],
    ['a DOM event', (l) => /\bdispatchEvent\b/.test(l)],
    ['a form submit', (l) => /\b(requestSubmit|submit)\b/.test(l)],
    ['a write over HTTP', (l) => /\bmethod\s*:\s*['"`]?(POST|PUT|PATCH|DELETE)\b/i.test(l) || (/\bfetch\(/.test(l) && /\b(method|body)\b/.test(l))],
    ['a Barkpark call', (l) => /\blive\.call\b|\.call\(\s*['"`]\//.test(l)],
    ['a click on something but the answer control', (l) => !clicksOk(l)],
  ];
  lines.forEach((l, i) => {
    if (/^\s*\/\//.test(l)) return; // a comment line runs nothing
    const hit = doors.find(([, t]) => t(l));
    if (!hit) return;
    rule('host guard', 1);
    if (!(i > from && i < to)) fail(`host guard: scripts/turn-live.mjs:${i + 1} sends by ${hit[0]} outside sendText, so no check before the send guards it`);
  });
}

// A question card as a gate scene keeps its choices however the card is cut (scripts/lib/cards.mjs
// sceneCard, rev292): an answered card scrolled up so only its letter and label show is still
// answered B Cedar, with no question, not a question "B".
const card = (...kinds) => ({ parts: kinds.map((kind) => ({ kind, e: { textLength: 0 } })) });
for (const [name, c, want] of [
  ['an answered card, cut off above its choice', card('text:B', 'text:Cedar'), { card: 'question', question: null, answered: { letter: 'B', label: 'Cedar' } }],
  ['an answered card, whole', card('text:Which tree do you prefer?', 'text:B', 'text:Cedar'), { card: 'question', question: 'Which tree do you prefer?', answered: { letter: 'B', label: 'Cedar' } }],
  ['an open card, cut off above its first choice', card('control:A', 'text:A', 'text:Maple', 'control:B', 'text:B', 'text:Cedar'), { card: 'question', question: null, choices: ['Maple', 'Cedar'] }],
  ['an open card', card('text:Which tree do you prefer?', 'control:A', 'text:A', 'text:Maple', 'control:B', 'text:B', 'text:Cedar'), { card: 'question', question: 'Which tree do you prefer?', choices: ['Maple', 'Cedar'] }],
]) {
  rule('scene cards', 1);
  const got = JSON.stringify(sceneCard(c));
  if (got !== JSON.stringify(want)) fail(`scene cards: ${name}: ${got}, not ${JSON.stringify(want)}`);
}

// A gate scene carries only what the live page can draw (lead's ruling on rev295; #295 round 2):
// no row overlap (the oracle's list placed a row by an estimate, ours never does) and no lift above 0
// (a list pinned to its end never leaves its last row above it). Transcript.tsx no longer draws
// either, so a generator change that brought one back would quietly feed only the gate.
{
  const f = 'app/src/gate/transcripts.ts';
  const lines = readFileSync(path(f), 'utf8').split('\n');
  let inLifts = false;
  lines.forEach((l, i) => {
    if (/^\s*\/\//.test(l)) return; // a comment names, it draws nothing
    if (/^export const lifts\b/.test(l)) inLifts = true;
    else if (/^export const /.test(l)) inLifts = false;
    if (/^\s*"[^"]+": \[/.test(l)) rule('scene spacers', 1);
    if (/\boverlap\b/.test(l)) fail(`scene spacers: ${f}:${i + 1} carries a row overlap, which the live page never draws`);
    const lift = inLifts && l.match(/^\s*"([^"]+)":\s*(-?[\d.]+)/);
    if (lift) {
      rule('scene spacers', 1);
      if (Number(lift[2]) > 0) fail(`scene spacers: ${f}:${i + 1} lifts ${lift[1]} by ${lift[2]}, above 0: a spacer only the gate draws`);
    }
  });
}

// Hosted Gate B's line under a drop (rev299 on #311): runner timing only when every flipped case is a
// clock budget; anything else, or a mix, or a drop with nothing named, says "look at it". A clock
// budget is a case tagged clock: true whose key is in lib/gate-b-hosted.mjs CLOCKS, never a key that
// reads like a clock (task-4ce61dac9b63c95c; rev on #314). Here: CLOCKS equals gate-b.mjs's budget()
// keys in any quote style, and gate-b.mjs sets the tag in one place, inside budget().
{
  const GONE = 'budget: working line gone ≤ 250 ms after the reply';
  // Code only: a line comment that names the tag is not a tag.
  const src = read('scripts/gate-b.mjs').replace(/(^|\s)\/\/.*$/gm, '$1');
  const called = [...src.matchAll(/\bbudget\(\s*(['"`])((?:(?!\1).)+)\1/g)].map((m) => m[2]);
  for (const k of CLOCKS) { rule('gate b hosted', 1); if (!called.includes(k)) fail(`gate b hosted: CLOCKS names "${k}", but gate-b.mjs no longer judges it through budget()`); }
  rule('gate b hosted', 1);
  for (const k of called.filter((k) => !CLOCKS.includes(k))) fail(`gate b hosted: gate-b.mjs judges "${k}" through budget(): name it in CLOCKS (lib/gate-b-hosted.mjs) if it is a clock, or push its case untagged`);
  rule('gate b hosted', 1);
  const tags = [...src.matchAll(/\bclock\s*:\s*true\b|\.clock\s*=(?!=)|\[\s*['"`]clock['"`]\s*\]\s*[:=](?!=)/g)];
  const inBudget = src.slice(src.indexOf('const budget = '), src.indexOf('};', src.indexOf('const budget = ')));
  if (tags.length !== 1 || !/\bclock: true\b/.test(inBudget)) fail(`gate b hosted: gate-b.mjs sets the clock tag ${tags.length} time(s); it must be once, inside budget()`);
  rule('gate b hosted', 1);
  // budget() is only ever called by name: an alias (const tick = budget) or a pass-along would judge a
  // key this scan cannot see. Its flips would still say "look at it"; this names it at check time.
  const bare = [...src.matchAll(/\bbudget\b(?!\s*[(:])/g)].length;
  if (bare !== 1) fail(`gate b hosted: gate-b.mjs names budget ${bare} time(s) other than in a call; only its definition may`);
  rule('gate b hosted', 1);
  // A shared key stops the run before anything is judged or written (task-f294c8197a92c306), and the
  // hosted line is given this run's turns.
  const stop = src.search(/const shared = sharedKeys\(report\);\s*if \(shared\.length\) \{[^\n]*process\.exit\(1\); \}/);
  const first = Math.min(...['writeFileSync(opt(', 'const lower = '].map((n) => src.indexOf(n)).filter((i) => i >= 0));
  if (stop < 0 || !(stop < first)) fail('gate b hosted: gate-b.mjs no longer stops on a shared key (sharedKeys(report), exit 1) before it compares or writes');
  rule('gate b hosted', 1);
  if (!/hostedNote\(flipped, report\)/.test(src)) fail('gate b hosted: gate-b.mjs calls hostedNote without this run\'s turns (report)');
  for (const [name, flipped, want] of [
    ['only the exit budget', [{ id: 'say-hi', key: GONE, clock: true }, { id: 'storage', key: GONE, clock: true }], /^Gate B: report only, runner timing: /],
    ['the rail\'s unread mark', [{ id: 'say-hi', key: 'rail:unread#1' }, { id: 'storage', key: 'rail:unread#1' }], /^Gate B: report only: a non-timing case flipped \(say-hi · rail:unread#1, storage · rail:unread#1\): look at it\.$/],
    ['the exit budget and focus', [{ id: 'say-hi', key: GONE, clock: true }, { id: 'storage', key: 'budget: focus stays in Prompt' }], /^Gate B: report only: a non-timing case flipped \(storage · budget: focus stays in Prompt\): look at it\.$/],
    ['a drop with nothing named', [], /look at it/],
    ['a non-clock budget worded like a clock', [{ id: 'say-hi', key: 'budget: the card sits in 2 frames of the bubble' }], /^Gate B: report only: a non-timing case flipped \(say-hi · budget: the card sits in 2 frames of the bubble\): look at it\.$/],
    ['a stray tag on focus', [{ id: 'storage', key: 'budget: focus stays in Prompt', clock: true }], /^Gate B: report only: a non-timing case flipped \(storage · budget: focus stays in Prompt\): look at it\.$/],
    ['a stray tag on a key not in CLOCKS', [{ id: 'say-hi', key: GONE, clock: true }, { id: 'say-hi', key: 'nothing extra', clock: true }], /^Gate B: report only: a non-timing case flipped \(say-hi · nothing extra\): look at it\.$/],
    ['a tagged budget worded like a clock, not in CLOCKS', [{ id: 'say-hi', key: 'budget: the card sits in 2 frames of the bubble', clock: true }], /look at it\.$/],
    ['a clock key with no tag', [{ id: 'say-hi', key: GONE }], /^Gate B: report only: a non-timing case flipped \(say-hi · budget: working line gone ≤ 250 ms after the reply\): look at it\.$/],
  ]) {
    rule('gate b hosted', 1);
    // Each flip's turn holds that one case: no key shared.
    const turns = [...new Set(flipped.map((f) => f.id))].map((id) => ({ id, results: flipped.filter((f) => f.id === id).map((f) => ({ key: f.key })) }));
    const got = hostedNote(flipped, turns);
    if (!want.test(got)) fail(`gate b hosted: ${name}: ${got}`);
  }
  // A shared key (task-f294c8197a92c306): a failing case pushed under a clock key word for word, with a
  // computed tag, beside the real budget. Only it flips, tagged and in CLOCKS; the turn gives it away.
  const twin = [{ key: GONE, clock: true, pass: true }, { key: GONE, clock: true, pass: false }];
  for (const [name, flipped, turns, want] of [
    ['two cases of one turn share a clock key, one not from budget()', [{ id: 'say-hi', key: GONE, clock: true }], [{ id: 'say-hi', results: twin }, { id: 'storage', results: [{ key: GONE }] }], /^Gate B: report only: two cases of one turn share a key \(say-hi · budget: working line gone ≤ 250 ms after the reply\): a record cannot tell them apart: look at it\.$/],
    ['one key in two turns is no shared key (control)', [{ id: 'say-hi', key: GONE, clock: true }, { id: 'storage', key: GONE, clock: true }], [{ id: 'say-hi', results: [{ key: GONE }] }, { id: 'storage', results: [{ key: GONE }] }], /^Gate B: report only, runner timing: /],
  ]) {
    rule('gate b hosted', 1);
    const got = hostedNote(flipped, turns);
    if (!want.test(got)) fail(`gate b hosted: ${name}: ${got}`);
  }
  rule('gate b hosted', 1);
  let threw = false;
  try { hostedNote([{ id: 'say-hi', key: GONE, clock: true }]); } catch { threw = true; }
  if (!threw) fail('gate b hosted: hostedNote without the turns still answered: a shared key would go unseen');
}

// Hover label (the sweep's hoverLabel step, N2): on saved 1.2.3 captures, the pointer goes to the
// newest message's own group wholly on screen; a cut one or a tile's nested group is passed over,
// and a prefix with nothing to hover throws instead of capturing the resting screen.
{
  const st = (id) => JSON.parse(read(`fixtures/states/${id}.json`));
  const ORACLE = 'Message actions for Oracle message', YOURS = 'Message actions for your message';
  for (const [name, id, prefix, want] of [
    ["Oracle's one message", 'oracle-file-sent', ORACLE, 118],
    ['yours: the earlier message is cut off at the top', 'oracle-file-sent', YOURS, 143],
    ['yours: two wholly on screen, the newest wins', 'oracle-pictures-sent', YOURS, 135],
    ["yours: the message's own group, not its last tile's", 'oracle-ask-choice', YOURS, 93],
    ['yours: the only one is cut off', 'oracle-turn-1040', YOURS, /none wholly on screen/],
    ['a label nothing carries', 'oracle-turn-1040', 'Message actions for nobody', /nothing by that label on screen/],
    // The sweep's pressLabel (oracle-picture-viewer*): the openers inside the five-picture message.
    ['the viewer from a tile: the last whole tile, not the +3 one', 'oracle-pictures-sent', 'Open image full screen', 145],
    ['the viewer from the +3 tile', 'oracle-pictures-sent', 'Open the remaining 3 images full screen', 150],
  ]) {
    rule('hover label', 1);
    let got;
    try { got = pickByLabel(st(id), prefix).e.i; } catch (e) { got = e.message; }
    const ok = want instanceof RegExp ? typeof got === 'string' && want.test(got) : got === want;
    if (!ok) fail(`hover label: ${name} (${id}): got ${got}, want ${want}`);
  }
}

// Own session (task-26a1a137b955ef3b): deny by default (lib/session-doors.mjs), over every source
// file under app/. Every server function opens with `await requireOwnSessionFn(…)` and every method
// handler of every server route with `await requireOwnSessionRoute(…)` (app/src/server/own-session.ts),
// or it is on the open list with its reason; anything else is a red.
{
  const files = appSources(path('app'));
  // The walk itself: app/ outside src is read, generated output is not.
  rule('own session', 1);
  const seen = files.map((f) => f.path);
  if (!seen.includes('app/vite.config.ts') || !seen.includes('app/src/chat/api.ts') || seen.some((p) => /node_modules|routeTree\.gen/.test(p))) fail(`own session: the walk of app/ is not what it should be (${seen.length} files; vite.config.ts ${seen.includes('app/vite.config.ts')}, api.ts ${seen.includes('app/src/chat/api.ts')})`);
  const { doors, reds } = doorReds(files);
  for (const d of doors) rule('own session', 1);
  for (const r of reds) fail(`own session: ${r}`);
  // A floor, not a list: a scan that finds no guarded route or no guarded server function is broken.
  rule('own session', 1);
  const guarded = doors.filter((d) => !d.why);
  if (!guarded.some((d) => d.where.includes('/routes/')) || !guarded.some((d) => !d.where.includes('/routes/'))) fail(`own session: the scan found ${doors.length} door(s) but no guarded route or no guarded server function: it no longer reads the doors`);
  // The scan itself, on made-up sources (lib/session-doors-cases.mjs).
  for (const [name, files, want, open = {}, like] of DOOR_CASES) {
    rule('own session', 1);
    const got = doorReds(files, open).reds;
    if (got.length !== want || (like && !got.every((r) => like.test(r)))) fail(`own session: ${name}: the scan gave ${got.length} red(s), want ${want}${like ? ` like ${like}` : ''}: ${JSON.stringify(got)}`);
  }
}

// Unscored boxes (task-9350f7d5eee2c573, report only): Gate A prints, per state, the oracle's boxes of
// 20x20 or more that no case scores. The viewer's picture is one: a box the gate never compares.
{
  const at = (id) => JSON.parse(read(`fixtures/states/${id}.json`));
  const viewer = unscoredBoxes(at('oracle-picture-viewer'));
  rule('unscored boxes', 1);
  if (!viewer.some((e) => e.tag === 'img' && e.box.map(Math.round).join() === '436,213,256,256')) fail(`unscored boxes: oracle-picture-viewer's picture (img 436,213 256x256) is not in the unscored count (${viewer.length} boxes)`);
  // Control: a named control is never counted, nor a box that holds one, nor the conversation's.
  rule('unscored boxes', 1);
  const fake = { elements: [
    { i: 0, tag: 'div', box: [0, 0, 400, 400] },
    { i: 1, tag: 'button', label: 'Send', box: [10, 10, 40, 40], parent: 0 },
    { i: 2, tag: 'img', box: [100, 100, 50, 50] },
    { i: 3, tag: 'div', role: 'article', box: [200, 200, 100, 100] },
    { i: 4, tag: 'img', box: [210, 210, 40, 40], parent: 3 },
    { i: 5, tag: 'span', box: [300, 300, 19, 40] },
  ] };
  const got = unscoredBoxes(fake).map((e) => e.i);
  if (JSON.stringify(got) !== '[2]') fail(`unscored boxes: on the made-up state, want only the unlabelled img (2), got ${JSON.stringify(got)}`);
  // Gate A's box cases (lib/box-cases.mjs): the viewer's picture is one.
  rule('box cases', 1);
  const pic = boxElements(at('oracle-picture-viewer')).find(({ e }) => e.tag === 'img' && e.box.map(Math.round).join() === '436,213,256,256');
  if (pic?.key !== 'box:page › img#1') fail(`box cases: oracle-picture-viewer's picture is not the case box:page › img#1 (${pic?.key ?? 'none'})`);
  // Only what paints is a case: a clear wrapper (1) is not; a background (2), a top border (3), a
  // shadow (4), an img (5) and own text (6) are; a 19-wide box (7), a named control (8), the
  // control's own box again (9) and the transcript's time row (10) are not.
  rule('box cases', 1);
  const bg = { 'background-color': 'rgb(31, 31, 31)' };
  const paintState = { elements: [
    { i: 0, tag: 'div', box: [0, 0, 100, 100], style: { 'background-color': 'rgba(0, 0, 0, 0)' }, parent: 11 },
    { i: 1, tag: 'div', box: [0, 0, 90, 90], style: {}, parent: 0 },
    { i: 2, tag: 'div', box: [100, 0, 40, 40], style: bg, parent: 11 },
    { i: 3, tag: 'div', box: [150, 0, 40, 40], style: { 'border-top-width': '1px', 'border-top-color': 'rgba(245, 245, 245, 0.06)' }, parent: 11 },
    { i: 4, tag: 'div', box: [200, 0, 40, 40], style: { 'box-shadow': 'rgba(0, 0, 0, 0.2) 0px 1px 2px 0px' }, parent: 11 },
    { i: 5, tag: 'img', box: [250, 0, 40, 40], style: {}, parent: 11 },
    { i: 6, tag: 'p', box: [300, 0, 40, 40], style: {}, textLength: 12, parent: 11 },
    { i: 7, tag: 'div', box: [350, 0, 19, 40], style: bg, parent: 11 },
    { i: 8, tag: 'button', label: 'Go', box: [400, 0, 40, 40], style: bg, parent: 11 },
    { i: 9, tag: 'span', box: [400, 0, 40, 40], style: bg, parent: 8 },
    { i: 10, tag: 'time', box: [450, 0, 80, 28], style: {}, textLength: 13, parent: 11 },
    { i: 11, tag: 'div', box: [0, 0, 600, 100], style: { 'background-color': 'rgb(18, 18, 18)' } },
  ] };
  const painted = boxElements(paintState).map(({ e }) => e.i);
  if (JSON.stringify(painted) !== '[2,3,4,5,6,11]') fail(`box cases: what paints, want [2,3,4,5,6,11], got ${JSON.stringify(painted)}`);
  // Pairing by overlap, one to one, floor IoU > 0: ours has an extra painted box first and lacks one
  // of theirs. The extra reds only itself (extra) and moves nothing; the lacking one reds (missing);
  // concentric near-equal boxes pair with their own (24 and 25 of theirs; ours has only the 25: the
  // 24 is missing, never a green on the 25). A box of ours that shares no point with theirs (60,200)
  // does not pair with theirs at 0,200: both red.
  rule('box cases', 1);
  const els = (bs) => ({ page: 'rgb(18, 18, 18)', elements: bs.map(([x, y, w, h], i) => ({ i, tag: 'div', box: [x, y, w, h], style: bg })) });
  const them = els([[0, 0, 40, 40], [100, 0, 40, 40], [200, 0, 24, 24], [200, 0, 25, 25], [0, 200, 40, 40]]);
  const us = els([[50, 50, 30, 30], [0, 0, 40, 40], [100.5, 0, 40, 40], [200, 0, 25, 25], [60, 200, 40, 40]]);
  const res = boxCases(them, us).map((c) => (c.pass ? 'pass' : c.why.split(':')[0]));
  if (JSON.stringify(res) !== '["pass","pass","missing","pass","missing","extra","extra"]') fail(`box cases: pairing by overlap, want pass, pass, missing, pass, missing, extra, extra, got ${JSON.stringify(res)}`);
  // An svg by its centre, never its size: a padded 55 around a tight 33 at one centre passes; one
  // 2 pt off-centre fails. A background the colour of the box under it, opaque, is not paint (1 in 0);
  // a see-through one is (3 in 2), and so is another colour (4 in 0).
  rule('box cases', 1);
  const svg = (box) => ({ elements: [{ i: 0, tag: 'svg', box, style: {} }] });
  const svgRes = [boxCases(svg([0, 0, 55, 55]), svg([11, 11, 33, 33]))[0].pass, boxCases(svg([0, 0, 55, 55]), svg([13, 11, 33, 33]))[0].pass];
  const same = { elements: [
    { i: 0, tag: 'div', box: [0, 0, 300, 300], style: { 'background-color': 'rgb(18, 18, 18)' } },
    { i: 1, tag: 'div', box: [10, 10, 100, 100], style: { 'background-color': 'rgb(18, 18, 18)' }, parent: 0 },
    { i: 2, tag: 'div', box: [120, 10, 100, 100], style: { 'background-color': 'rgba(245, 245, 245, 0.04)' }, parent: 0 },
    { i: 3, tag: 'div', box: [130, 20, 50, 50], style: { 'background-color': 'rgba(245, 245, 245, 0.04)' }, parent: 2 },
    { i: 4, tag: 'div', box: [10, 120, 100, 100], style: { 'background-color': 'rgb(31, 31, 31)' }, parent: 0 },
  ] };
  const sameRes = boxElements(same).map(({ e }) => e.i);
  if (JSON.stringify(svgRes) !== '[true,false]' || JSON.stringify(sameRes) !== '[0,2,3,4]') fail(`box cases: svg by centre want [true,false], got ${JSON.stringify(svgRes)}; same-colour background want [0,2,3,4], got ${JSON.stringify(sameRes)}`);
  // The perception floor: laid over what is behind it, a fill or top border must move the pixel by
  // 4/255 or more. On rgb(18,18,18) (0, which paints): a 0.01 white fill moves it 2.4 (1, no), a 0.06
  // white hairline 14 (2, yes), the same colour 0 (3, no), a 0.01 border 2.3 (4, no), a 0.02 fill 4.5
  // (5, yes), and a 0.06 hairline on a box filled the page's colour 14 (6, yes). And the
  // page-wide pairing: one box, under the page on the oracle's side and under a named button on ours,
  // is one passing case, not a missing one and an extra.
  rule('box cases', 1);
  const line = (a) => ({ 'border-top-width': '1px', 'border-top-color': `rgba(255, 255, 255, ${a})` });
  const faint = { elements: [
    { i: 0, tag: 'div', box: [0, 0, 600, 100], style: { 'background-color': 'rgb(18, 18, 18)' } },
    { i: 1, tag: 'div', box: [0, 0, 40, 40], style: { 'background-color': 'rgba(255, 255, 255, 0.01)' }, parent: 0 },
    { i: 2, tag: 'div', box: [50, 0, 40, 40], style: line(0.06), parent: 0 },
    { i: 3, tag: 'div', box: [100, 0, 40, 40], style: { 'background-color': 'rgb(18, 18, 18)' }, parent: 0 },
    { i: 4, tag: 'div', box: [150, 0, 40, 40], style: line(0.01), parent: 0 },
    { i: 5, tag: 'div', box: [200, 0, 40, 40], style: { 'background-color': 'rgba(255, 255, 255, 0.02)' }, parent: 0 },
    { i: 6, tag: 'div', box: [250, 0, 40, 40], style: { 'background-color': 'rgb(18, 18, 18)', ...line(0.06) }, parent: 0 },
  ] };
  const faintRes = boxElements(faint).map(({ e }) => e.i);
  // With no painted ancestor a box lies on the page's own background (body's): rgb(18,18,18) on a
  // page of that colour is no paint (0), rgb(31,31,31) is (1). With no page in the capture (the
  // oracle's, before `page`) what is behind is unknown: both are kept marked unknown (?), and no
  // case is made of an unknown box of theirs, nor of the box of ours it pairs with.
  const onBody = (page) => boxElements({ page, elements: [
    { i: 0, tag: 'div', box: [0, 0, 40, 40], style: { 'background-color': 'rgb(18, 18, 18)' } },
    { i: 1, tag: 'div', box: [50, 0, 40, 40], style: { 'background-color': 'rgb(31, 31, 31)' } },
  ] }).map(({ e, unknown }) => `${e.i}${unknown ? '?' : ''}`);
  // A see-through ancestor does not cover the page, so what is behind stays unknown.
  const veiled = boxElements({ elements: [
    { i: 0, tag: 'div', box: [0, 0, 400, 400], style: { 'background-color': 'rgba(0, 0, 0, 0.7)' } },
    { i: 1, tag: 'div', box: [10, 10, 40, 40], style: { 'background-color': 'rgb(31, 31, 31)' }, parent: 0 },
  ] }).map(({ e, unknown }) => `${e.i}${unknown ? '?' : ''}`);
  const bodyRes = [onBody('rgb(18, 18, 18)'), onBody(undefined), veiled];
  const onPage = { page: 'rgb(18, 18, 18)', elements: [{ i: 0, tag: 'div', box: [10, 10, 50, 50], style: { 'background-color': 'rgb(31, 31, 31)' } }] };
  const inButton = { page: 'rgb(18, 18, 18)', elements: [
    { i: 0, tag: 'button', label: 'Go', box: [0, 0, 100, 100] },
    { i: 1, tag: 'div', box: [10, 10, 50, 50], style: { 'background-color': 'rgb(31, 31, 31)' }, parent: 0 },
  ] };
  const pageRes = boxCases(onPage, inButton).map((c) => c.pass);
  const blind = boxCases({ elements: onPage.elements }, inButton).length;
  if (JSON.stringify(faintRes) !== '[0,2,5,6]' || JSON.stringify(pageRes) !== '[true]' || JSON.stringify(bodyRes) !== '[["1"],["0?","1?"],["0?","1?"]]' || blind !== 0) fail(`box cases: perception floor want [0,2,5,6], got ${JSON.stringify(faintRes)}; on the page's background want [["1"],["0?","1?"],["0?","1?"]], got ${JSON.stringify(bodyRes)}; behind unknown want no case, got ${blind}; page-wide pairing want [true], got ${JSON.stringify(pageRes)}`);
}

// Press guard (the sweep's last look before a press, task-1c715b946dff6176, task-7521aa645350a9ed): the
// picked element is held in the page right after the pick (markPicked, found by collect's index and
// checked by its box and visible name), and the press must reach that very element (the nearest
// pressable ancestor-or-self of what is under the point), still in the picked box; a zero-size box is
// refused; pressLabel takes only the viewer's two openers. Run on a stand-in document whose elements
// answer what the page functions ask (closest, text, boxes, styles, aria-labels).
{
  let all = [];
  const view = { innerWidth: 1040, innerHeight: 760, __sweepPicked: null, getComputedStyle: (e) => e.style };
  const el = (tag, { label = null, text = '', role = null, rect, parent = null, style = {} }) => {
    const attrs = { ...(label ? { 'aria-label': label } : {}), ...(role ? { role } : {}) };
    const e = { tagName: tag.toUpperCase(), parentElement: parent, attrs, kids: [], rect, style: { visibility: 'visible', display: 'block', opacity: '1', ...style }, childNodes: text ? [{ nodeType: 3, textContent: text }] : [],
      getAttribute: (k) => attrs[k] ?? null };
    e.getBoundingClientRect = () => ({ x: e.rect[0], y: e.rect[1], width: e.rect[2], height: e.rect[3], left: e.rect[0], top: e.rect[1], right: e.rect[0] + e.rect[2], bottom: e.rect[1] + e.rect[3] });
    // A selector list of tag, tag[attr], [attr] and [attr=value] parts, as underPoint's PRESSABLE is.
    e.matches = (sel) => sel.split(',').map((x) => x.trim().match(/^(\w+)?(?:\[([\w-]+)(?:=([\w-]+))?\])?$/)).some((m) => m && (!m[1] || m[1].toUpperCase() === e.tagName) && (!m[2] || (m[2] in attrs && (m[3] === undefined || attrs[m[2]] === m[3]))) && (m[1] || m[2]));
    e.closest = (sel) => { for (let x = e; x; x = x.parentElement) if (x.matches(sel)) return x; return null; };
    e.querySelectorAll = () => { const out = []; const walk = (x) => x.kids.forEach((k) => { out.push(k); walk(k); }); walk(e); return out; };
    if (parent) parent.kids.push(e);
    all.push(e);
    return e;
  };
  const doc = (top, body) => ({ defaultView: view, body, elementFromPoint: () => top });
  const OPEN = 'Open image full screen', TILE = [386, 398, 156, 156], ROW = [600, 300, 200, 36], SET = [17, 698, 54, 54];
  const at = (box) => [box[0] + box[2] / 2, box[1] + box[3] / 2];
  const fresh = () => {
    all = []; delete view.__sweepPicked;
    const body = el('body', { rect: [0, 0, 1040, 760] });
    const tile = el('button', { label: OPEN, rect: TILE, parent: body }), img = el('img', { rect: TILE, parent: tile });
    const settings = el('button', { rect: SET, parent: body }), inner = el('span', { text: 'Settings', rect: SET, parent: settings });
    const menu = el('div', { role: 'menu', rect: [600, 264, 200, 108], parent: body }), row = el('div', { role: 'menuitem', text: 'Settings', rect: ROW, parent: menu });
    return { body, tile, img, settings, inner, menu, row };
  };
  // underPoint: [name, scene → [under the point, picked box, the held element], want].
  for (const [name, scene, want] of [
    ['the held tile itself under the point', ({ tile }) => [tile, TILE, tile], true],
    ["the held tile's own picture under the point (the press reaches its button)", ({ img, tile }) => [img, TILE, tile], true],
    ['a toast over the tile (nothing pressable under the point)', ({ body, tile }) => [el('div', { label: 'Saved', rect: [300, 420, 400, 60], parent: body }), TILE, tile], false],
    ['the right box with another label', ({ body, tile }) => [el('button', { label: 'Open the remaining 3 images full screen', rect: TILE, parent: body }), TILE, tile], false],
    ['nothing under the point', ({ tile }) => [null, TILE, tile], false],
    ['nothing held (markPicked did not run, or refused)', ({ tile }) => [tile, TILE, null], false],
    ['a plain press on the held control, reached through the text inside it', ({ inner, settings }) => [inner, SET, settings], true],
    ['a plain press with nothing pressable under the point', ({ body, settings }) => [el('div', { rect: [0, 600, 300, 160], parent: body }), SET, settings], false],
    // rev299 on #318 (b08f9a5 let each through):
    ['a label on a held parent, and a pressable child fills it ("Delete image" under the point)', ({ body }) => { const wrap = el('div', { label: OPEN, rect: TILE, parent: body }); return [el('button', { label: 'Delete image', rect: TILE, parent: wrap }), TILE, wrap]; }, false],
    ['a plain press after a one-row scroll: "Sign out" now in the held "Settings" box', ({ menu, row }) => [el('div', { role: 'menuitem', text: 'Sign out', rect: ROW, parent: menu }), ROW, row], false],
    ['two tiles swapped by a one-tile scroll', ({ body, tile }) => { tile.rect = [230, 398, 156, 156]; return [el('button', { label: OPEN, rect: TILE, parent: body }), TILE, tile]; }, false],
    ['a zero-size picked box, a button over its corner', ({ body }) => { const wrap = el('div', { rect: [17, 698, 0, 0], parent: body }); return [el('button', { text: 'Settings', rect: [7, 688, 40, 40], parent: wrap }), [17, 698, 0, 0], wrap]; }, false],
    ['a zero-size picked box that is itself pressable and held', ({ body }) => { const zero = el('button', { rect: [17, 698, 0, 0], parent: body }); return [el('span', { text: 'Settings', rect: [7, 688, 40, 40], parent: zero }), [17, 698, 0, 0], zero]; }, false],
    ['the held tile moved 10 px after the pick (only its box tells)', ({ tile }) => { tile.rect = [396, 398, 156, 156]; return [tile, TILE, tile]; }, false],
    // rev299 on #318's PASS (ac63acd let each through): a same-named twin in the picked box.
    ['a plain press: a second "Settings", scrolled up from below the fold, now in the held one\'s box', ({ menu, row }) => { row.rect = [600, 264, 200, 36]; return [el('div', { role: 'menuitem', text: 'Settings', rect: ROW, parent: menu }), ROW, row]; }, false],
    ['pressLabel: the held tile scrolled off the top, the next tile by that label now in its box', ({ body, tile }) => { tile.rect = [386, -170, 156, 156]; return [el('button', { label: OPEN, rect: TILE, parent: body }), TILE, tile]; }, false],
    ['pressLabel: an opacity-0 twin over the held tile turns visible', ({ body, tile }) => [el('button', { label: OPEN, rect: TILE, parent: body }), TILE, tile], false],
    ['control: the second of two tiles, held, under the point', ({ body }) => { const second = el('button', { label: OPEN, rect: [560, 398, 156, 156], parent: body }); return [second, [560, 398, 156, 156], second]; }, true],
  ]) {
    rule('press guard', 1);
    const s = fresh();
    const [top, box, held] = scene(s);
    view.__sweepPicked = held;
    const got = underPoint(...at(box), box, doc(top, s.body));
    if (got.ok !== want) fail(`press guard: ${name}: ok ${got.ok} (under ${got.under}), want ${want}`);
  }
  // markPicked: [name, scene → [collect's index, picked box, picked name, the element it must hold or null]].
  for (const [name, scene] of [
    // Counted as collect counts: body's children in document order, the hidden and the zero-size left out.
    ['holds the element collect gave that index, counting past a hidden and a zero-size one', ({ body }) => { el('div', { rect: [0, 0, 10, 10], parent: body, style: { display: 'none' } }); el('div', { rect: [0, 0, 0, 10], parent: body }); const b = el('button', { label: 'Close', rect: [900, 20, 30, 30], parent: body }); return [all.filter((x) => x !== body && x.rect[2] >= 1 && x.rect[3] >= 1 && x.style.display !== 'none').indexOf(b), [900, 20, 30, 30], 'Close', b]; }],
    ['refuses when that element moved between the pick and the mark', ({ tile }) => { tile.rect = [396, 398, 156, 156]; return [0, TILE, OPEN, null]; }],
    ['refuses when that index now holds another name', ({ row }) => { row.childNodes = [{ nodeType: 3, textContent: 'Sign out' }]; return [5, ROW, 'Settings', null]; }],
    // ac63acd read the first text inside, hidden or not, so a hidden first span made a good press refuse.
    ['a hidden first span inside the control: its visible text is its name, and the press goes', ({ body }) => { const b = el('button', { rect: [17, 600, 80, 30], parent: body }); el('span', { text: 'Beta', rect: [17, 600, 30, 30], parent: b, style: { display: 'none' } }); el('span', { text: 'Settings', rect: [47, 600, 50, 30], parent: b }); return [all.filter((x) => x !== body && x.rect[2] >= 1 && x.rect[3] >= 1 && x.style.display !== 'none').indexOf(b), [17, 600, 80, 30], 'Settings', b]; }],
  ]) {
    rule('press guard', 1);
    const s = fresh();
    const [i, box, want, held] = scene(s);
    const got = markPicked(i, box, want, doc(null, s.body));
    // A refusal leaves nothing on the window, not even a null (rev299 on #321).
    if (got.ok !== (held !== null) || (view.__sweepPicked ?? null) !== held || ('__sweepPicked' in view) !== (held !== null)) fail(`press guard: markPicked ${name}: ok ${got.ok} (${got.under}), held ${'__sweepPicked' in view ? view.__sweepPicked?.tagName ?? String(view.__sweepPicked) : 'nothing on the window'}`);
  }
  // markPicked's refusal says which changed: the box or the name (rev299's nit on #321).
  rule('press guard', 1);
  {
    const s = fresh(); s.tile.rect = [396, 398, 156, 156];
    const moved = markPicked(0, TILE, OPEN, doc(null, s.body)).under;
    const s2 = fresh(); s2.row.childNodes = [{ nodeType: 3, textContent: 'Sign out' }];
    const renamed = markPicked(5, ROW, 'Settings', doc(null, s2.body)).under;
    if (!/moved from the picked box/.test(moved) || /not the picked/.test(moved) || !/now named "Sign out", not the picked "Settings"/.test(renamed)) fail(`press guard: markPicked's refusal does not say which changed: ${JSON.stringify([moved, renamed])}`);
  }
  // press() itself, run as sweep.mjs's own text with stand-ins: whatever way it ends (pressed, refused,
  // or a throw after the mark), nothing of the pick is left on the window. cf8a058 left null on
  // every path and the held button on four throws (rev299 on #321).
  {
    const sweep = read('scripts/oracle/sweep.mjs');
    const from = sweep.indexOf('async function press('), to = sweep.indexOf('\n}\n', from) + 2;
    for (const [name, failAt, want] of [
      ['the press goes', null, /^pressed$/],
      ['the mark refuses: the control moved before it', 'mark', /^refusing.*moved from the picked box/],
      ['open -a fails after the mark', 'open', /no such app/],
      ['bringToFront fails after the mark', 'Page.bringToFront', /bringToFront failed/],
      ['mouseMoved fails after the mark', 'mouseMoved', /mouseMoved failed/],
      ['underPoint refuses: a twin took the box', 'under', /^refusing.*another element than the picked one/],
      ['mousePressed fails after underPoint said yes', 'mousePressed', /mousePressed failed/],
    ]) {
      rule('press guard', 1);
      all = []; delete view.__sweepPicked;
      const body = el('body', { rect: [0, 0, 1040, 760] });
      const button = el('button', { rect: SET, parent: body }), inner = el('span', { text: 'Settings', rect: SET, parent: button });
      const state = { elements: [{ i: 0, tag: 'button', box: SET, style: {} }, { i: 1, parent: 0, tag: 'span', text: 'Settings', box: SET, style: {} }] };
      const collect = () => state;
      const page = {
        evaluate: async (f, ...a) => {
          if (f === collect) return state;
          if (f === markPicked && failAt === 'mark') button.rect = [27, 698, 54, 54];
          if (f === markPicked && failAt !== 'mark') button.rect = SET;
          const top = failAt === 'under' ? el('button', { text: 'Settings', rect: SET, parent: body }) : inner;
          return f(...a, doc(top, body));
        },
        send: async (m, p) => { if (m === failAt || p?.type === failAt) throw new Error(`${m === failAt ? m : p.type} failed`); },
      };
      const deps = { mayPress: () => true, labelPressAllowed, VIEWER, page, collect, pickByLabel, controls, markPicked, pickedName, underPoint, dropPicked, wait: async () => {}, execFileSync: () => { if (failAt === 'open') throw new Error('open -a Grok Bot: no such app'); } };
      let got;
      try { await new Function(...Object.keys(deps), `return ${sweep.slice(from, to)}`)(...Object.values(deps))('Settings'); got = 'pressed'; } catch (e) { got = e.message; }
      if (!want.test(got) || '__sweepPicked' in view) fail(`press guard: press(), ${name}: ended "${got}", and the window ${'__sweepPicked' in view ? `still has __sweepPicked (${view.__sweepPicked?.tagName ?? String(view.__sweepPicked)})` : 'is clean'}`);
    }
  }
  // markPicked counts as collect does: collect.mjs's own two skip conditions, word for word.
  rule('press guard', 1);
  {
    const src = read('scripts/oracle/collect.mjs'), mark = markPicked.toString().replace(/view\.innerWidth/g, 'innerWidth').replace(/view\.innerHeight/g, 'innerHeight');
    const skips = [...src.matchAll(/if \(([^\n]*?)\) continue;/g)].map((m) => m[1]).filter((c) => /width < 1|visibility/.test(c));
    if (skips.length !== 2 || !skips.every((c) => mark.includes(c)) || !/document\.body\.querySelectorAll\('\*'\)/.test(src) || !/doc\.body\.querySelectorAll\('\*'\)/.test(mark)) fail(`press guard: markPicked no longer counts elements as collect.mjs does (${skips.length} skip conditions read from collect.mjs)`);
  }
  for (const [name, want] of [[OPEN, true], ['Open the remaining 3 images full screen', true], ['Settings', false], ['Close', false], ['Open image', false]]) {
    rule('press guard', 1);
    if (labelPressAllowed(name) !== want) fail(`press guard: pressLabel "${name}": allowed ${!want}, want ${want}`);
  }
}

// No skip-pass: every rule must have checked something.
for (const name of ['own session', 'doc caps', 'links', 'items', 'journeys covered', 'fresh pictures', 'secrets', 'controls tracked', 'one oracle version', 'gate records', 'turn records', 'host guard', 'scene cards', 'scene spacers', 'gate b hosted', 'hover label', 'press guard', 'unscored boxes', 'box cases']) {
  if (!ran[name]) fail(`${name}: checked nothing`);
}

const summary = Object.entries(ran).map(([k, v]) => `${k} ${v}`).join(' · ');
if (fails.length) {
  console.error(fails.map((f) => `✗ ${f}`).join('\n'));
  console.error(`\ncheck: ${fails.length} failure(s) · ${summary}`);
  process.exit(1);
}
console.log(`check: ok · ${summary}`);
