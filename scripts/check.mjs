// npm run check: the repo's own rules. Every rule counts what it checked,
// and a rule that checked nothing fails (no skip-pass).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { path, read, items, journeys, slices } from './lib/data.mjs';
import { roadmapSvg } from './generate-roadmap.mjs';
import { journeysSvg, parityMd } from './generate-parity.mjs';
import { heroSvg } from './generate-hero.mjs';
import { controls, claims } from './lib/controls.mjs';
import { turnTraces } from './lib/turn-traces.mjs';
import { EXCEPTIONS, exception, judged } from './lib/versions.mjs';
import { guardBeforeSend } from './lib/host-guard.mjs';
import { sceneCard } from './lib/cards.mjs';
import { hostedNote, CLOCKS } from './lib/gate-b-hosted.mjs';
import { pickByLabel } from './lib/hover-label.mjs';
import { doorReds, SOURCE } from './lib/session-doors.mjs';
import { CASES as DOOR_CASES } from './lib/session-doors-cases.mjs';

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

// Own session (task-26a1a137b955ef3b): deny by default (lib/session-doors.mjs). Every server function
// and every method handler of every server route opens with `await requireOwnSession(…)`
// (app/src/server/own-session.ts), or is on the open list with its reason; anything else is a red.
{
  const walk = (d) => readdirSync(path(d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : SOURCE.test(e.name) ? [`${d}/${e.name}`] : []));
  const { doors, reds } = doorReds(walk('app/src').map((p) => ({ path: p, src: read(p) })));
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

// No skip-pass: every rule must have checked something.
for (const name of ['own session', 'doc caps', 'links', 'items', 'journeys covered', 'fresh pictures', 'secrets', 'controls tracked', 'one oracle version', 'gate records', 'turn records', 'host guard', 'scene cards', 'scene spacers', 'gate b hosted', 'hover label']) {
  if (!ran[name]) fail(`${name}: checked nothing`);
}

const summary = Object.entries(ran).map(([k, v]) => `${k} ${v}`).join(' · ');
if (fails.length) {
  console.error(fails.map((f) => `✗ ${f}`).join('\n'));
  console.error(`\ncheck: ${fails.length} failure(s) · ${summary}`);
  process.exit(1);
}
console.log(`check: ok · ${summary}`);
