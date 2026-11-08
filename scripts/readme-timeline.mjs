// The README's "What happened" block from first-parent git history.
// Writes between <!-- timeline:start --> and <!-- timeline:end -->.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { path } from './lib/data.mjs';

const REPO = 'https://github.com/FRIKKern/barkbot';
const DAY = 86400000;

export function timeline(now = new Date()) {
  let log = '';
  try {
    log = execFileSync('git', ['log', '--first-parent', '--format=%ct%x09%s', '-n', '400'], { cwd: path(), encoding: 'utf8' });
  } catch { /* no commits yet */ }
  const commits = log.split('\n').filter(Boolean)
    .map((l) => { const [t, ...s] = l.split('\t'); return { at: new Date(Number(t) * 1000), subject: s.join('\t') }; })
    .filter((c) => !/^chore: refresh/.test(c.subject));
  if (!commits.length) return '- Nothing yet.';

  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const bucket = (d) => (d >= start ? 'Today' : d >= start - DAY ? 'Yesterday' : d >= start - 6 * DAY ? 'This week' : 'Earlier');
  const groups = new Map();
  for (const c of commits) {
    const b = bucket(c.at);
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b).push(c);
  }
  const link = (s) => s.replace(/\(#(\d+)\)/, `([#$1](${REPO}/pull/$1))`);
  const out = [];
  for (const [name, cs] of groups) {
    out.push(`- **${name}** · ${cs.length} change${cs.length === 1 ? '' : 's'}`);
    for (const c of cs.slice(0, 2)) out.push(`  - ${link(c.subject)}`);
  }
  return out.join('\n');
}

export function withTimeline(readme, body) {
  return readme.replace(/<!-- timeline:start -->[\s\S]*?<!-- timeline:end -->/, `<!-- timeline:start -->\n${body}\n<!-- timeline:end -->`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = path('README.md');
  writeFileSync(file, withTimeline(readFileSync(file, 'utf8'), timeline()));
}
