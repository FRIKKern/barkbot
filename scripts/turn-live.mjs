// The live turn: one real message through our own app, to the real Barkpark, to the bot's computer
// (npm run host), answered by real claude. The gates replay recorded turns against a stand-in; this
// is the one check that the whole chain works. Owner-run: it needs the owner's Barkpark login and
// the enrolled computer online, so it is not part of npm run land or CI.
//
//   npm run turn:live            start the app and a headless Chrome, send one turn, reload, stop both
//   npm run turn:live -- --url http://localhost:3000   use an app that is already running
//   npm run turn:live -- --approve  the bot asks leave (Q1): ask for a file with a made-up name, press Allow on each
//                                   card, find the file in the bot's folder. Writes parity/live/approve.json.
//   npm run turn:live -- --question the bot asks a question (Q2): press its second choice, and the bot must reply with
//                                   that choice. Writes parity/live/question.json.
//   npm run turn:live -- --picture  a picture with the message (A1/A2): a square of a colour picked for the run; the
//                                   bot must name the colour. Writes parity/live/picture.json.
//   npm run turn:live -- --file     a text file with the message (A1): a made-up code in a file made for the run;
//                                   the bot must reply with the code, and the message shows the file card, also
//                                   after a reload. Writes parity/live/file.json.
//   npm run turn:live -- --tool     a turn with a tool (T5): a file with a made-up code is put in the bot's folder, the
//                                   bot reads it and replies with the code; the working line must name the tool.
//                                   Writes parity/live/tool.json.
//   npm run turn:live -- --midreload reload while the bot is still replying (T5): the reply must finish on the
//                                   fresh page, once, and stay once after another reload. Writes parity/live/midreload.json.
//   npm run turn:live -- --resume   come back later (C2): give the bot a made-up code, wait while YOU stop and
//                                   start the bot's computer (then Enter), reload, ask for the code. Writes parity/live/resume.json.
//
// It adds one short turn ("Say hi in one short sentence.") to the bot's current conversation.
// It prints and records counts and times only, never a message's text (O2).
// Passing writes parity/live/turn.json. Exits 1 if any step fails; then nothing is written.
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
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
const APPROVE = args.includes('--approve');
const PICTURE = args.includes('--picture');
const FILE = args.includes('--file');
const QUESTION = args.includes('--question');
const TOOL = args.includes('--tool');
const MIDRELOAD = args.includes('--midreload');
const REPLY_MS = Number(opt('reply-ms')) || 90000;
// A square png of one colour, made here: no file from anywhere else is ever sent.
function squarePng(n, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, i) => { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(n, 0); head.writeUInt32BE(n, 4); head[8] = 8; head[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(n * 3).map((_, i) => [r, g, b][i % 3])]);
  return Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), chunk('IHDR', head), chunk('IDAT', deflateSync(Buffer.concat(Array(n).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
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
    asking: !!document.querySelector('.ask'),
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
const turn = async (text, { allow = false } = {}) => {
  let allowed = 0;
  const before = await settled();
  if (before.noComputer) stopWith('the bot has no computer enrolled (npm run host:enroll, then npm run host)');
  const t0 = Date.now();
  await page.evaluate(() => document.querySelector('.prompt').focus());
  await page.send('Input.insertText', { text });
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await until(async () => (await seen()).user === before.user + 1, 10000, 'our own message to show as a bubble');
  let after;
  await until(async () => {
    // --approve: press Allow on each card the bot shows, as a person would.
    if (allow && await page.evaluate(() => { const b = document.querySelector('.ask-allow:not(:disabled)'); if (b) b.click(); return !!b; })) { allowed++; await wait(500); }
    after = await seen();
    return after.bot > before.bot && after.lastBot > 0 && !after.working && !after.asking;
  }, allow ? REPLY_MS * 2 : REPLY_MS, `a reply within ${REPLY_MS / 1000} s (is npm run host running?)`);
  return { before, after, ms: Date.now() - t0, allowed };
};
const commit = () => { try { return execFileSync('git', ['rev-parse', '--short=10', 'HEAD'], { cwd: path(), encoding: 'utf8' }).trim(); } catch { return null; } };
const record = (file, r) => { mkdirSync(path('parity', 'live'), { recursive: true }); writeFileSync(path('parity', 'live', file), JSON.stringify({ ran: new Date().toISOString(), barkbot: commit(), ...r }, null, 1) + '\n'); };
const computer = () => page.evaluate(() => document.querySelector('.computer-state')?.textContent ?? null);

try {
  await open();
  if (APPROVE) {
    // The bot's computer runs claude in plan mode: work that changes something asks leave first
    // (its plan, then each step). The file's name is made up for this run, so finding it in the
    // bot's folder afterwards can only come from this turn.
    const name = `barkbot-check-${1000 + Math.floor(Math.random() * 9000)}.txt`;
    const file = join(process.env.BARKBOT_HOME || join(homedir(), 'BarkBot', 'home'), name);
    if (existsSync(file)) stopWith(`${name} is already in the bot's folder`);
    const r = await turn(`Create a file called ${name} in your folder with the word hi in it. Then reply with just: done`, { allow: true });
    if (!r.allowed) stopWith('the bot never asked leave: no approval card was shown');
    if (!existsSync(file)) stopWith(`Allow was pressed ${r.allowed} times and the bot replied, but ${name} is not in its folder`);
    rmSync(file);
    record('approve.json', { cards_allowed: r.allowed, reply_ms: r.ms, file_written: true, bubbles_at_end: [r.after.user, r.after.bot] });
    console.log(`Live approve: ok · ${r.allowed} cards allowed · the file was written (and removed again) · reply in ${(r.ms / 1000).toFixed(1)} s`);
    process.exit(0);
  }
  if (QUESTION) {
    // The bot asks, the page answers by pressing the second choice. The three words are made up
    // for this run and the bot is told to reply with the chosen one only, so a reply holding the
    // second word (and neither other) can only come from the press.
    const pool = ['maple', 'cedar', 'birch', 'aspen', 'rowan', 'hazel', 'alder', 'elder'].sort(() => Math.random() - 0.5).slice(0, 3);
    const before = await settled();
    if (before.noComputer) stopWith('the bot has no computer enrolled (npm run host:enroll, then npm run host)');
    const t0 = Date.now();
    await page.evaluate(() => document.querySelector('.prompt').focus());
    await page.send('Input.insertText', { text: `Use your AskUserQuestion tool to ask me which tree I prefer: ${pool.join(', ')}. After I answer, reply with only the tree I chose.` });
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    let offered = [];
    await until(async () => { offered = await page.evaluate(() => [...document.querySelectorAll('.ask-choice .ask-label')].map((x) => x.textContent)); return offered.length >= 2; }, REPLY_MS, 'the question card');
    const want = offered[1];
    await page.evaluate(() => document.querySelectorAll('.ask-choice')[1].click());
    let after, said = '';
    await until(async () => { after = await seen(); said = await page.evaluate(() => [...document.querySelectorAll('.bubble[data-role="assistant"] .bubble-text')].at(-1)?.textContent ?? ''); return after.bot > before.bot && !after.working && !after.asking && said.length > 0; }, REPLY_MS, 'the bot to reply after the choice');
    const low = said.toLowerCase();
    if (!low.includes(want.toLowerCase()) || offered.some((o) => o !== want && low.includes(o.toLowerCase()))) stopWith('the bot\'s reply does not name the pressed choice alone: the answer did not reach it');
    record('question.json', { choices_offered: offered.length, pressed: 2, reply_names_the_choice: true, reply_ms: Date.now() - t0 });
    console.log(`Live question: ok · ${offered.length} choices offered · pressed B · the bot replied with that choice · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    process.exit(0);
  }
  if (PICTURE) {
    // A picture goes with the message (A1/A2): a square of one colour, picked for this run, made
    // here. The bot is asked for the colour in one word, so a reply naming it (and neither other)
    // can only come from the bot having seen the picture.
    const colours = { red: [220, 30, 30], green: [30, 160, 60], blue: [40, 70, 220] };
    const name = Object.keys(colours)[Math.floor(Math.random() * 3)];
    const file = path('.cache', `live-picture-${CHROME_PORT}.png`);
    writeFileSync(file, squarePng(64, colours[name]));
    const before = await settled();
    if (before.noComputer) stopWith('the bot has no computer enrolled (npm run host:enroll, then npm run host)');
    await page.send('DOM.enable');
    const { root } = await page.send('DOM.getDocument');
    const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.composer-wrap input[type=file]' });
    if (!nodeId) stopWith('the composer has no file chooser');
    await page.send('DOM.setFileInputFiles', { nodeId, files: [file] });
    await until(() => page.evaluate(() => document.querySelectorAll('.composer-attachments [role=listitem]').length === 1), 5000, 'the picture to wait in the box');
    const r = await turn('What colour is this square? Reply with one word: red, green or blue.');
    rmSync(file, { force: true });
    const said = (await page.evaluate(() => [...document.querySelectorAll('.bubble[data-role="assistant"] .bubble-text')].at(-1)?.textContent ?? '')).toLowerCase();
    const shown = await page.evaluate(() => [...document.querySelectorAll('.turn-attached .picture-tiles img')].at(-1)?.naturalWidth ?? 0);
    if (!said.includes(name) || Object.keys(colours).some((c) => c !== name && said.includes(c))) stopWith('the bot\'s reply does not name the picture\'s colour alone: it did not see the picture');
    if (shown !== 64) stopWith('our own bubble does not show the picture that was sent');
    await open();
    await until(() => page.evaluate(() => ([...document.querySelectorAll('.turn-attached .picture-tiles img')].at(-1)?.naturalWidth ?? 0) === 64), 20000, 'the picture to show again after a reload');
    record('picture.json', { picture_px: 64, reply_names_the_colour: true, shown_in_bubble: true, shown_after_reload: true, reply_ms: r.ms });
    console.log(`Live picture: ok · the bot named the square's colour · the picture shows in the bubble and after a reload · ${(r.ms / 1000).toFixed(1)} s`);
    process.exit(0);
  }
  if (FILE) {
    // A text file goes with the message (A1): it holds a code made up for this run, and the file
    // exists only in .cache for the run, never in the bot's folder. So a reply holding the code can
    // only come from the bot having read the attachment Barkpark passed to its computer.
    const code = `${['kiwi', 'plum', 'fig', 'lime'][Math.floor(Math.random() * 4)]}-${1000 + Math.floor(Math.random() * 9000)}`;
    const name = `barkbot-note-${1000 + Math.floor(Math.random() * 9000)}.txt`;
    const file = path('.cache', name);
    writeFileSync(file, `The code is ${code}.\n`);
    const before = await settled();
    if (before.noComputer) stopWith('the bot has no computer enrolled (npm run host:enroll, then npm run host)');
    await page.send('DOM.enable');
    const { root } = await page.send('DOM.getDocument');
    const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.composer-wrap input[type=file]' });
    if (!nodeId) stopWith('the composer has no file chooser');
    await page.send('DOM.setFileInputFiles', { nodeId, files: [file] });
    await until(() => page.evaluate((n) => [...document.querySelectorAll('.composer-attachments [role=listitem]')].map((x) => x.getAttribute('aria-label')).join() === n, name), 5000, 'the file to wait in the box');
    let r;
    try { r = await turn('Reply with only the code written in the attached file.'); } catch (e) {
      // A computer that cannot take files yet (Barkpark's 422) leaves a plain line and the draft.
      const line = await page.evaluate(() => document.querySelector('.composer-refused')?.textContent ?? null);
      stopWith(line ? `the message was not sent: ${line}` : e.message);
    } finally { rmSync(file, { force: true }); }
    const knows = await page.evaluate((c) => [...document.querySelectorAll('.bubble[data-role="assistant"] .bubble-text')].at(-1)?.textContent.includes(c) ?? false, code);
    const card = () => page.evaluate((n) => [...document.querySelectorAll('.turn-attached .file-card')].filter((x) => x.getAttribute('aria-label') === `Open ${n}`).length, name);
    if (!knows) stopWith('the bot did not reply with the code in the file: it did not read the attachment');
    if ((await card()) !== 1) stopWith('our own message does not show the file card for the file that was sent');
    await open();
    await until(async () => (await card()) === 1, 20000, 'the file card to show again after a reload (from the stored row)');
    record('file.json', { file_bytes: `The code is ${code}.\n`.length, reply_has_the_code: true, card_in_message: true, card_after_reload: true, reply_ms: r.ms });
    console.log(`Live file: ok · the bot replied with the code in the file · the file card shows in the message and after a reload · ${(r.ms / 1000).toFixed(1)} s`);
    process.exit(0);
  }
  if (TOOL) {
    // The code is made up for this run and lives only in a file in the bot's folder, so a reply
    // holding it can only come from the bot's tool reading that file. Reading asks no leave.
    const code = `${['kiwi', 'plum', 'fig', 'lime'][Math.floor(Math.random() * 4)]}-${1000 + Math.floor(Math.random() * 9000)}`;
    const name = `barkbot-read-${1000 + Math.floor(Math.random() * 9000)}.txt`;
    const home = process.env.BARKBOT_HOME || join(homedir(), 'BarkBot', 'home');
    if (!existsSync(home)) stopWith(`the bot's folder ${home} is not on this computer`);
    const file = join(home, name);
    writeFileSync(file, code + '\n');
    // The working line's labels while the turn runs: which were seen, not what any reply said.
    const labels = new Set();
    const watch = setInterval(async () => { try { const l = await page.evaluate(() => document.querySelector('.working .work-label')?.textContent.trim() ?? ''); if (l) labels.add(l); } catch {} }, 100);
    let r;
    try { r = await turn(`Read the file ${name} in your folder and reply with only what it says.`, { allow: true }); } finally { clearInterval(watch); rmSync(file, { force: true }); }
    const knows = await page.evaluate((c) => [...document.querySelectorAll('.bubble[data-role="assistant"] .bubble-text')].at(-1)?.textContent.includes(c) ?? false, code);
    if (!knows) stopWith('the bot did not reply with what the file says: its tool did not read it');
    const tools = [...labels].filter((l) => l !== 'Typing…');
    if (!tools.length) stopWith('the working line never said what the bot was doing: no tool label was shown');
    await open();
    let again;
    await until(async () => { again = await seen(); return again.user === r.after.user && again.bot === r.after.bot; }, 20000, `the reloaded page to show ${r.after.user} + ${r.after.bot} bubbles again`);
    record('tool.json', { file_read: true, tool_labels_seen: tools.length, cards_allowed: r.allowed, reply_ms: r.ms, bubbles_after: [r.after.user, r.after.bot], after_reload: [again.user, again.bot] });
    console.log(`Live tool: ok · the bot read the file and gave its code · ${tools.length} tool label(s) on the working line · ${(r.ms / 1000).toFixed(1)} s · the same after a reload`);
    process.exit(0);
  }
  if (MIDRELOAD) {
    // A long reply, and a reload while it is still coming. The last word is made up for this run,
    // so the fresh page showing it means the reply finished there. Then: one user bubble more, not
    // two, and the same counts after one more reload (nothing doubled, nothing lost).
    const end = `END-${1000 + Math.floor(Math.random() * 9000)}`;
    const before = await settled();
    if (before.noComputer) stopWith('the bot has no computer enrolled (npm run host:enroll, then npm run host)');
    const t0 = Date.now();
    await page.evaluate(() => document.querySelector('.prompt').focus());
    await page.send('Input.insertText', { text: `Write about 400 words on how tides work, in plain paragraphs, no tools. Finish with a last line that says only ${end}` });
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await until(async () => { const s = await seen(); return s.user === before.user + 1 && s.working; }, REPLY_MS, 'the bot to start working');
    const done = () => page.evaluate((e) => [...document.querySelectorAll('.bubble[data-role="assistant"] .bubble-text')].some((x) => x.textContent.includes(e)), end);
    if (await done()) stopWith('the reply was already whole before the reload: nothing was tested');
    const reloadAt = Date.now() - t0;
    await open();
    if (await done()) stopWith('the reply was already whole when the fresh page came up: nothing was tested');
    try { await until(async () => (await done()) && !(await seen()).working, REPLY_MS, 'the reply to finish on the reloaded page'); }
    catch (e) { const s = await seen(); stopWith(`${e.message} (whole reply shown: ${await done()}, still working: ${s.working}, bubbles ${s.user - before.user} + ${s.bot - before.bot} new, newest reply ${s.lastBot} characters, error line: ${s.error})`); }
    const after = await settled();
    if (after.user !== before.user + 1) stopWith(`our message shows ${after.user - before.user} times after the reload, not once`);
    if (after.bot <= before.bot) stopWith('no reply bubble on the reloaded page');
    const ends = () => page.evaluate((e) => [...document.querySelectorAll('.bubble[data-role="assistant"] .bubble-text')].filter((x) => x.textContent.includes(e)).length, end);
    if (await ends() !== 1) stopWith('the reply shows more than once on the reloaded page');
    await open();
    let again;
    await until(async () => { again = await settled(); return again.user === after.user && again.bot === after.bot; }, 20000, `one more reload to show ${after.user} + ${after.bot} bubbles again`);
    if (await ends() !== 1) stopWith('the reply shows more than once after one more reload');
    record('midreload.json', { reloaded_at_ms: reloadAt, finished_on_fresh_page: true, reply_ms: Date.now() - t0, bubbles_before: [before.user, before.bot], bubbles_after: [after.user, after.bot], after_second_reload: [again.user, again.bot] });
    console.log(`Live mid-reload: ok · reloaded ${(reloadAt / 1000).toFixed(1)} s in · the reply finished on the fresh page, once · the same after one more reload`);
    process.exit(0);
  }
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
