// npm run check: the repo's own rules. Every rule counts what it checked,
// and a rule that checked nothing fails (no skip-pass).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { path, read, items, journeys, slices } from './lib/data.mjs';
import { roadmapSvg } from './generate-roadmap.mjs';
import { journeysSvg, parityMd } from './generate-parity.mjs';

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
  if (!its.some((i) => i.journey === j)) fail(`journeys: ${j} has no item in parity/items.json`);
}

// 4. Generated files match their sources.
const gen = [
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
  if (/\.(png|jpe?g|webp|gif)$/i.test(f)) continue;
  rule('secrets', 1);
  if (SECRET.test(readFileSync(path(f), 'utf8'))) fail(`${f}: looks like a secret`);
}

// No skip-pass: every rule must have checked something.
for (const name of ['doc caps', 'links', 'items', 'journeys covered', 'fresh pictures', 'secrets']) {
  if (!ran[name]) fail(`${name}: checked nothing`);
}

const summary = Object.entries(ran).map(([k, v]) => `${k} ${v}`).join(' · ');
if (fails.length) {
  console.error(fails.map((f) => `✗ ${f}`).join('\n'));
  console.error(`\ncheck: ${fails.length} failure(s) · ${summary}`);
  process.exit(1);
}
console.log(`check: ok · ${summary}`);
