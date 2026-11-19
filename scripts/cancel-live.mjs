// J05 on a registered computer, checked at the plumbing. C1 is open: the app has no Stop (the
// oracle has none), so this does what a Stop would: it asks one conversation for a long reply,
// interrupts it once text streams (POST /v1/chat/sessions/:id/interrupt), and checks that the turn
// ends within END_MS and that the computer's host program has no child left running.
// Owner-run, like turn-live: the owner's bp login and the computer online.
//
//   BARKBOT_HOST_NAME="BarkBot VM" BARKBOT_LIVE_DIR=vm node scripts/cancel-live.mjs \
//     --session <id> --ssh barkbot@<ip> [--ssh-key <file>]
//
// --ssh reads the host program's children on the computer (systemd unit barkbot-host).
// It records counts and times only, never a message's text (O2). Passing writes cancel.json in
// parity/live/ (or parity/live/<BARKBOT_LIVE_DIR>/). Exits 1 if any step fails; then nothing is written.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { path } from './lib/data.mjs';

const args = process.argv.slice(2);
const opt = (k) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
const SESSION = opt('session'), SSH = opt('ssh'), KEY = opt('ssh-key');
const HOST = process.env.BARKBOT_HOST_NAME || 'BarkBot Mac';
const LIVE = process.env.BARKBOT_LIVE_DIR ? ['parity', 'live', process.env.BARKBOT_LIVE_DIR] : ['parity', 'live'];
const MESSAGE = 'Count from 1 to 400, one number per line, each followed by one word that rhymes with it. No tools.';
const TEXT_MS = 90000, END_MS = 2000, SETTLE_MS = 3000;
const stopWith = (why) => { console.error(`Live cancel: failed: ${why}`); process.exit(1); };
if (!SESSION || !SSH) stopWith('needs --session <id> and --ssh <user@ip>');

let bpConf = {};
try { bpConf = JSON.parse(readFileSync(join(homedir(), '.config', 'barkpark', 'config.json'), 'utf8')); } catch {}
const URL = (process.env.BARKPARK_URL || bpConf.server || '').replace(/\/$/, '');
const TOKEN = process.env.BARKPARK_TOKEN || bpConf.token;
if (!URL || !TOKEN) stopWith('no Barkpark login (bp login, or BARKPARK_URL and BARKPARK_TOKEN)');
const call = async (p, init = {}) => {
  const res = await fetch(URL + p, { ...init, headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers } });
  const text = await res.text();
  if (!res.ok) stopWith(`${init.method || 'GET'} ${p.split('?')[0]} answered ${res.status}`);
  return text ? JSON.parse(text) : null;
};
// The host program's children on the computer: claude runs as one while a turn is open.
const children = () => {
  const remote = 'P=$(systemctl show -p MainPID --value barkbot-host); [ "$P" -gt 0 ] || exit 3; ps -o comm= --ppid "$P" | grep -c . || true';
  const out = execFileSync('ssh', [...(KEY ? ['-i', KEY] : []), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', SSH, remote], { encoding: 'utf8' });
  return Number(out.trim());
};

const { hosts } = await call(`/w/${encodeURIComponent(process.env.BARKPARK_WORKSPACE || bpConf.workspace || 'default')}/v1/chat-hosts`);
const host = hosts.find((h) => h.name === HOST && h.enrolled && !h.revoked);
if (!host?.online) stopWith(`no online computer named ${HOST}`);
const session = await call(`/v1/chat/sessions/${encodeURIComponent(SESSION)}?since=999999999`);
if (session.execution_host_id !== host.id) stopWith(`that conversation is not on ${HOST}`);
const idle = children();

// The session's own stream, opened before the send and with no cursor, so only this turn's events arrive.
const ac = new AbortController();
const stream = await fetch(`${URL}/v1/chat/sessions/${encodeURIComponent(SESSION)}/events`, { headers: { authorization: `Bearer ${TOKEN}`, accept: 'text/event-stream' }, signal: ac.signal });
if (!stream.ok) stopWith(`the event stream answered ${stream.status}`);
const seen = []; // [ms, event type]
let textChars = 0, ended = null, onText, onEnd;
const textOnce = new Promise((ok) => { onText = ok; });
const endOnce = new Promise((ok) => { onEnd = ok; });
let t0 = 0;
(async () => {
  const dec = new TextDecoder(); let buf = '';
  try {
    for await (const chunk of stream.body) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, i); buf = buf.slice(i + 2);
        const name = frame.match(/^event: ?(.*)$/m)?.[1] ?? 'message';
        let data = null; try { data = JSON.parse(frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n')); } catch {}
        // A registered host's frames are `event: runtime` with {kind, native} (useConversation.ts reads the same).
        const type = name === 'runtime' ? String(data?.kind ?? 'runtime') : name;
        seen.push([Date.now() - t0, type]);
        const delta = data?.native?.params?.delta ?? data?.native?.delta;
        if (/text_delta/.test(type) && typeof delta === 'string') { textChars += delta.length; onText(); }
        if (/turn_completed|turn_failed|turn_interrupted|^error$/.test(type)) { const n = data?.native ?? {}; ended = { type, terminal_state: data?.terminal_state ?? n.terminal_state ?? n.params?.terminal_state ?? null }; onEnd(); }
      }
    }
  } catch {}
})();

t0 = Date.now();
await call(`/v1/chat/sessions/${encodeURIComponent(SESSION)}/messages`, { method: 'POST', body: JSON.stringify({ content: MESSAGE }) });
const timeout = (ms) => new Promise((ok) => setTimeout(() => ok('timeout'), ms));
if (await Promise.race([textOnce, timeout(TEXT_MS)]) === 'timeout') stopWith(`no text within ${TEXT_MS / 1000} s (event kinds: ${[...new Set(seen.map((s) => s[1]))].join(', ')})`);
await new Promise((ok) => setTimeout(ok, 1500)); // let the reply run a little
const busy = children();
const textBefore = textChars, sentAt = Date.now();
await call(`/v1/chat/sessions/${encodeURIComponent(SESSION)}/interrupt`, { method: 'POST', body: '{}' });
if (await Promise.race([endOnce, timeout(END_MS)]) === 'timeout') stopWith(`the turn did not end within ${END_MS / 1000} s of the interrupt (events after: ${seen.filter((s) => s[0] >= sentAt - t0).map((s) => s[1]).join(', ')})`);
const endMs = Date.now() - sentAt;
await new Promise((ok) => setTimeout(ok, SETTLE_MS));
const textAfterEnd = textChars - textBefore;
const left = children();
ac.abort();
if (busy < 1) stopWith('no child of the host program while the reply ran: the check cannot see claude');
if (ended.terminal_state !== 'interrupted') stopWith(`the turn ended as ${ended.type} ${ended.terminal_state ?? '(no terminal_state)'}, not interrupted`);
if (left > idle) stopWith(`${left - idle} child process(es) of the host program left running after the interrupt`);

mkdirSync(path(...LIVE), { recursive: true });
const commit = (() => { try { return execFileSync('git', ['rev-parse', '--short=10', 'HEAD'], { cwd: path(), encoding: 'utf8' }).trim(); } catch { return null; } })();
writeFileSync(path(...LIVE, 'cancel.json'), JSON.stringify({ ran: new Date().toISOString(), barkbot: commit, host: HOST, message_chars: MESSAGE.length, text_chars_before_interrupt: textBefore, interrupt_to_end_ms: endMs, end: ended, text_chars_after_interrupt: textAfterEnd, host_children: { idle, while_replying: busy, after: left } }, null, 1) + '\n');
console.log(`Live cancel: ok · ${textBefore} characters streamed, then the turn ended ${endMs} ms after the interrupt (${ended.type} ${ended.terminal_state}) · host children ${idle} idle, ${busy} replying, ${left} after`);
process.exit(0);
