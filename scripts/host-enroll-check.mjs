// The one-time enrollment code reaches barkpark-chat-host on stdin, never in its argv (task-364357bd30fb1571):
// argv is in the process list for anyone on the computer to read. Runs scripts/host.sh enroll (the Mac)
// and scripts/vm/barkbot-owner-setup (the VM) against a stand-in barkpark-chat-host that writes down
// its argv and stdin, in a scratch folder, with a made-up code. Part of npm run check.
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { path } from './lib/data.mjs';

const CODE = `code-${Math.random().toString(36).slice(2, 12)}`;
const tmp = mkdtempSync(join(tmpdir(), 'barkbot-enroll-'));
const fails = [];
const stub = (file, body) => { writeFileSync(file, `#!/bin/sh\n${body}\n`); chmodSync(file, 0o755); };
// The stand-in: one argument per line to argv, then stdin as given.
const host = (file, out) => stub(file, `for a in "$@"; do printf '%s\\n' "$a"; done > '${out}.argv'\ncat > '${out}.stdin'\necho "enrolled host stand-in"`);
const seen = (out) => ({ argv: readFileSync(`${out}.argv`, 'utf8'), stdin: readFileSync(`${out}.stdin`, 'utf8') });
const judge = (name, s) => {
  if (s.argv.includes(CODE)) fails.push(`${name}: the code is in barkpark-chat-host's argv`);
  if (/^--token$/m.test(s.argv)) fails.push(`${name}: barkpark-chat-host is given --token`);
  if (s.stdin.trim() !== CODE) fails.push(`${name}: barkpark-chat-host's stdin is not the code`);
  if (!/^enroll$/m.test(s.argv) || !/^--root$/m.test(s.argv)) fails.push(`${name}: barkpark-chat-host was not asked to enroll with a root`);
};
try {
  // The Mac: a copy of host.sh with a host program already built, and no Barkpark checkout to build from.
  const mac = join(tmp, 'mac');
  mkdirSync(join(mac, 'scripts'), { recursive: true }); mkdirSync(join(mac, '.cache', 'bin'), { recursive: true }); mkdirSync(join(mac, 'home'));
  copyFileSync(path('scripts', 'host.sh'), join(mac, 'scripts', 'host.sh'));
  host(join(mac, '.cache', 'bin', 'barkpark-chat-host'), join(mac, 'seen'));
  execFileSync('sh', [join(mac, 'scripts', 'host.sh'), 'enroll'], { input: `${CODE}\n`, env: { ...process.env, HOME: join(mac, 'home'), BARKPARK_SRC: join(mac, 'no-barkpark') }, stdio: ['pipe', 'ignore', 'ignore'] });
  judge('scripts/host.sh enroll', seen(join(mac, 'seen')));

  // The VM: the owner's step, with barkpark-chat-host and claude on PATH as stand-ins.
  const vm = join(tmp, 'vm');
  mkdirSync(join(vm, 'bin'), { recursive: true }); mkdirSync(join(vm, 'home', 'BarkBot', 'home'), { recursive: true }); mkdirSync(join(vm, 'home', '.config', 'barkbot'), { recursive: true });
  host(join(vm, 'bin', 'barkpark-chat-host'), join(vm, 'seen'));
  stub(join(vm, 'bin', 'claude'), 'exit 0');
  execFileSync('bash', [path('scripts', 'vm', 'barkbot-owner-setup')], { input: `${CODE}\n`, env: { ...process.env, HOME: join(vm, 'home'), PATH: `${join(vm, 'bin')}:${process.env.PATH}` }, stdio: ['pipe', 'ignore', 'ignore'] });
  judge('scripts/vm/barkbot-owner-setup', seen(join(vm, 'seen')));
} catch (e) {
  fails.push(`could not run the enrollment scripts: ${e.message.split('\n')[0]}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
if (fails.length) { console.error(fails.map((f) => `✗ ${f}`).join('\n')); process.exit(1); }
console.log('host enroll: ok · the code reaches barkpark-chat-host on stdin, not argv · host.sh, barkbot-owner-setup');
