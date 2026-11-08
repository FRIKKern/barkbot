// Reads the repo's single sources of truth. Every generator and check goes
// through here, so a table means the same thing everywhere.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const path = (...p) => join(ROOT, ...p);
export const read = (...p) => readFileSync(path(...p), 'utf8');

export function items() {
  return JSON.parse(read('parity', 'items.json')).items;
}

// Markdown table rows after the header separator: [[cell, cell, ...], ...]
export function tableRows(markdown, firstHeader) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`| ${firstHeader} |`));
  if (start < 0) throw new Error(`no table starting with "| ${firstHeader} |"`);
  const rows = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) break;
    rows.push(line.split('|').slice(1, -1).map((c) => c.trim()));
  }
  return rows;
}

export function slices() {
  return tableRows(read('docs', 'ROADMAP.md'), 'Id').map(([id, name, reward, journeys]) => ({
    id, name, reward, journeys: journeys === '—' ? [] : journeys.split(/\s+/),
  }));
}

export function journeys() {
  return tableRows(read('JOURNEYS.md'), 'Id').map(([id, slice, text, proof]) => ({ id, slice, text, proof }));
}

// parity/board.json is a snapshot of the Barkpark board, written by
// `npm run board`, so generators and CI need no Barkpark token.
export function board() {
  const p = path('parity', 'board.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { slices: {} };
}

export function sliceStatus(all = slices(), its = items(), b = board()) {
  const out = {};
  let nowTaken = false;
  for (const s of all) {
    const mine = its.filter((i) => i.slice === s.id);
    const done = mine.filter((i) => i.status === 'done').length;
    const task = b.slices[s.id];
    let state;
    if (task && task.status === 'done') state = 'done';
    else if (!nowTaken) { state = 'now'; nowTaken = true; }
    else state = 'later';
    out[s.id] = { state, done, total: mine.length, task };
  }
  return out;
}

export function journeyStatus(j, its = items()) {
  const mine = its.filter((i) => i.journey === j.id);
  const done = mine.filter((i) => i.status === 'done').length;
  let state = 'open';
  if (mine.length && done === mine.length) state = 'done';
  else if (mine.some((i) => i.status === 'done' || i.status === 'partial')) state = 'partial';
  else if (mine.length && mine.every((i) => i.status === 'unknown')) state = 'unknown';
  return { state, done, total: mine.length };
}
