// Snapshot the Barkpark board into parity/board.json, so the pictures and CI
// need no Barkpark token. Reads the BarkBot goal's children through `bp`.
// Slice tasks are matched by title: "BarkBot S<n> ...".
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { path } from './lib/data.mjs';

const { goal } = JSON.parse(readFileSync(path('.barkpark.json'), 'utf8'));
const raw = execFileSync('bp', ['task', 'get', goal, '-o', 'json'], { encoding: 'utf8' });
const children = JSON.parse(raw).children || [];

const slices = {};
for (const c of children) {
  const m = /^BarkBot (S\d+)\b/.exec(c.title || '');
  if (!m) continue;
  slices[m[1]] = { task: c.doc_id, status: c.lifecycle_status, criteria: c.criteria_progress ?? null };
}
if (!Object.keys(slices).length) {
  console.error(`board: no "BarkBot S<n>" tasks under ${goal}; refusing to write an empty board`);
  process.exit(1);
}
const sorted = Object.fromEntries(Object.entries(slices).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })));
writeFileSync(path('parity', 'board.json'), JSON.stringify({ goal, slices: sorted }, null, 2) + '\n');
console.log(`board: ${Object.keys(sorted).length} slices from ${goal}`);
