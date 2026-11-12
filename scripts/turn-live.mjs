// The live turn: one real message through our own app, to the real Barkpark, to the bot's computer
// (npm run host), answered by real claude. The gates replay recorded turns against a stand-in; this
// is the one check that the whole chain works. Owner-run: it needs the owner's Barkpark login and
// the enrolled computer online, so it is not part of npm run land or CI.
//
//   npm run turn:live            start the app and a headless Chrome, send one turn, reload, stop both
//   npm run turn:live -- --url http://localhost:3000   use an app that is already running
//   npm run turn:live -- --resume   come back later (C2): give the bot a made-up code, wait while YOU stop and
//                                   start the bot's computer (then Enter), reload, ask for the code. Writes parity/live/resume.json.
//
// It adds one short turn ("Say hi in one short sentence.") to the bot's current conversation.
// It prints and records counts and times only, never a message's text (O2).
// Passing writes parity/live/turn.json. Exits 1 if any step fails; then nothing is written.
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from './oracle/cdp.mjs';
import { path } from './lib/data.mjs';

const args = process.argv.slice(2);
const opt = (k) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
const freePort = () => new Promise((ok, no) => { const s = createServer().once('error', no).listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); });
const APP_PORT = await freePort(), CHROME_PORT = await freePort();
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = path('.cache', `live-chrome-${CHROME_PORT}`);
const MESSAGE = 'Say hi in one short sentence.';
const RESUME = args.includes('--resume');
const REPLY_MS = Number(opt('reply-ms')) || 90000;
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function until(fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { if (await fn()) return; } catch {} await wait(200); }
  throw new Error(`timed out waiting for ${what}`);
}
const kids = [];
process.on('exit', () => { kids.forEach((k) => { try { k.kill('SIGTERM'); } catch {} }); try { rmSync(PROFILE, { recursive: true, force: true }); } catch {} });
process.on('SIGINT', () => process.exit(130));
const stopWith = (why) => { console.error(`Live turn: failed: ${why}`); process.exit(1); };

let base = opt('url');
if (!base) {
  base = `http://localhost:${APP_PORT}`;
  kids.push(spawn('pnpm', ['-s', 'dev', '--port', String(APP_PORT), '--strictPort'], { cwd: path('app'), stdio: 'ignore' }));
  await until(async () => (await fetch(base)).status > 0, 90000, `the app on ${base}`);
}
mkdirSync(PROFILE, { recursive: true });
kids.push(spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${CHROME_PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1040,760', 'about:blank'], { stdio: 'ignore' }));
await until(async () => (await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`)).ok, 30000, 'Chrome');
const page = await connect(undefined, CHROME_PORT);

// What the page shows, as counts: bubbles by speaker, the newest bot bubble's length, an error line.
const seen = () => page.evaluate(() => {
  const b = [...document.querySelectorAll('.bubble')];
  const bot = b.filter((x) => x.dataset.role === 'assistant');
  const prompt = document.querySelector('.prompt');
  return {
    user: b.filter((x) => x.dataset.role === 'user').length,
    bot: bot.length,
    lastBot: bot.at(-1)?.querySelector('.bubble-text')?.textContent.length ?? 0,
    working: !!document.querySelector('.working'),
    error: !!document.querySelector('.chat-error'),
    noComputer: /has no computer yet/.test(document.body.textContent),
    prompt: !!prompt,
  };
});
const open = async () => {
  await page.send('Page.navigate', { url: `${base}/` });
  await until(async () => (await seen()).prompt, 30000, 'the conversation page');
};
// History lands a little after the page: wait until the count holds still for a second.
const settled = async () => {
  let last = await seen(), same = 0;
  for (let i = 0; i < 50 && same < 5; i++) { await wait(200); const s = await seen(); same = s.user === last.user && s.bot === last.bot ? same + 1 : 0; last = s; }
  return last;
};

// One turn: type, Enter, wait for our bubble and then the reply. Counts and times only.
const turn = async (text) => {
  const before = await settled();
  if (before.noComputer) stopWith('the bot has no computer enrolled (npm run host:enroll, then npm run host)');
  const t0 = Date.now();
  await page.evaluate(() => document.querySelector('.prompt').focus());
  await page.send('Input.insertText', { text });
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await until(async () => (await seen()).user === before.user + 1, 10000, 'our own message to show as a bubble');
  let after;
  await until(async () => { after = await seen(); return after.bot > before.bot && after.lastBot > 0 && !after.working; }, REPLY_MS, `a reply within ${REPLY_MS / 1000} s (is npm run host running?)`);
  return { before, after, ms: Date.now() - t0 };
};
const commit = () => { try { return execFileSync('git', ['rev-parse', '--short=10', 'HEAD'], { cwd: path(), encoding: 'utf8' }).trim(); } catch { return null; } };
const record = (file, r) => { mkdirSync(path('parity', 'live'), { recursive: true }); writeFileSync(path('parity', 'live', file), JSON.stringify({ ran: new Date().toISOString(), barkbot: commit(), ...r }, null, 1) + '\n'); };
const computer = () => page.evaluate(() => document.querySelector('.computer-state')?.textContent ?? null);

try {
  await open();
  if (RESUME) {
    // The code is made up for this run, so a reply that holds it can only come from the earlier
    // turn: Claude's own session, resumed on the restarted computer (--resume in the host).
    const code = `${['kiwi', 'plum', 'fig', 'lime'][Math.floor(Math.random() * 4)]}-${1000 + Math.floor(Math.random() * 9000)}`;
    const first = await turn(`Remember this code for later: ${code}. Reply with just OK.`);
    // A quick restart never shows as Unreachable (Barkpark calls a computer gone only after it
    // misses heartbeats), so the page cannot tell us: the person says when it is done.
    console.log('Live resume: the bot has the code. Now stop the bot\'s computer and start it again (npm run host), then press Enter here.');
    const down = Date.now();
    await new Promise((ok) => process.stdin.once('data', ok));
    process.stdin.pause();
    const downMs = Date.now() - down;
    await until(async () => (await computer()) !== 'Unreachable', 120000, 'the computer to be reachable again');
    await open(); // the person comes back later: a fresh page
    await until(async () => { const s = await seen(); return s.user === first.after.user && s.bot >= first.after.bot; }, 20000, 'the reloaded page to show the conversation again');
    const second = await turn('What was the code I asked you to remember? Reply with the code only.');
    const knows = await page.evaluate((c) => [...document.querySelectorAll('.bubble[data-role="assistant"] .bubble-text')].at(-1)?.textContent.includes(c) ?? false, code);
    if (!knows) stopWith('after the restart the bot did not give the code back: its Claude session did not resume');
    record('resume.json', { restart_window_ms: downMs, reply_ms: [first.ms, second.ms], bubbles_before_restart: [first.after.user, first.after.bot], bubbles_at_end: [second.after.user, second.after.bot], code_returned: true });
    console.log(`Live resume: ok · restarted within ${(downMs / 1000).toFixed(0)} s · the conversation came back and the bot still knew the code`);
    process.exit(0);
  }
  const { before, after, ms: replyMs } = await turn(MESSAGE);

  // A reload must show the same conversation: Barkpark's stored rows, asked for from 0.
  await open();
  let again;
  await until(async () => { again = await seen(); return again.user === after.user && again.bot === after.bot; }, 20000, `the reloaded page to show ${after.user} + ${after.bot} bubbles again`);

  record('turn.json', { message_chars: MESSAGE.length, reply_chars: after.lastBot, reply_ms: replyMs, bubbles_before: [before.user, before.bot], bubbles_after: [after.user, after.bot], after_reload: [again.user, again.bot] });
  console.log(`Live turn: ok · reply of ${after.lastBot} characters in ${(replyMs / 1000).toFixed(1)} s · ${after.user} + ${after.bot} bubbles, the same after a reload`);
  process.exit(0);
} catch (e) {
  stopWith(e.message);
}
