// npm run build-check: a production build carries no test hook. A test hook is an env name that
// starts BARKBOT_TEST_ (today BARKBOT_TEST_MINT_FILE, app/src/chat/api.ts minter); it is read
// only under import.meta.env.DEV, so vite build leaves it out. Behaviour runs vite dev, so only a
// real build shows a guard that is gone. This builds app/ afresh into app/dist and reads every
// file there; any file holding the prefix fails, named in one line.
//
//   node scripts/build-check.mjs     exits 1 on a hook in the build, a failed build, or an empty one
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { path } from './lib/data.mjs';

const HOOK = 'BARKBOT_TEST_';
const app = path('app'), dist = path('app', 'dist');
const t0 = Date.now();
const fail = (line) => { console.error(`build-check: ${line}`); process.exit(1); };

// Afresh: a file left by an older build is never read as this one's (and no dist yet is fine).
rmSync(dist, { recursive: true, force: true });
try {
  execFileSync('pnpm', ['-s', 'exec', 'vite', 'build'], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
} catch (e) {
  process.stderr.write(`${e.stdout ?? ''}${e.stderr ?? ''}`);
  fail(`vite build failed in app/ (its output is above), so nothing was checked`);
}

const files = [];
const walk = (dir) => { for (const d of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, d.name); if (d.isDirectory()) walk(p); else if (d.isFile()) files.push(p); } };
try { walk(dist); } catch { fail('vite build made no app/dist, so nothing was checked'); }
if (!files.length) fail('vite build made an empty app/dist, so nothing was checked');

const hits = [];
for (const f of files) {
  const bytes = readFileSync(f);
  let at = bytes.indexOf(HOOK);
  if (at < 0) continue;
  const names = new Set();
  for (; at >= 0; at = bytes.indexOf(HOOK, at + 1)) names.add(/^[A-Z0-9_]+/.exec(bytes.subarray(at, at + 80).toString('latin1'))[0]);
  hits.push(`${relative(path(), f)} holds ${[...names].join(', ')}`);
}
if (hits.length) {
  for (const h of hits) console.error(`build-check: ${h}: a test hook in the production build; read it only under import.meta.env.DEV`);
  process.exit(1);
}
console.log(`build-check: ok · ${files.length} built files, none holds ${HOOK}* · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
