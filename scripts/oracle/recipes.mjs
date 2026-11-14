// Fixed gestures for the oracle (O3). Nothing else is ever typed or clicked.
// Every recipe that sends a message refuses unless the open bot is the
// throwaway oracle bot (O1): never Grookie, never another real bot.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

export const ORACLE_BOT = process.env.ORACLE_BOT || 'Oracle';

export const RECIPES = {
  // Creates the throwaway bot and records its first-run greeting (J12).
  'new-bot': { kind: 'click', label: 'New Bot', sends: false },
  // In the Create New Bot dialog: name the throwaway bot and create it (J12 starts here).
  'create-oracle': { kind: 'create', sends: false },
  'say-hi': { kind: 'send', text: 'Say hi in one short sentence.', sends: true },
  // The hero's turn: the bot checks its own computer before answering.
  storage: { kind: 'send', text: 'How much storage do you have, and where?', sends: true },
  // A reply long enough to scroll the transcript while it streams (owner-approved 2026-11-09).
  'long-answer': { kind: 'send', text: 'Explain in five short paragraphs how ocean tides work.', sends: true },
  // The six looks the owner approved a send each for on 2026-11-14 ("Yes, full send it").
  // Work that changes the bot's computer: the bot may ask leave first (Q1).
  'ask-leave': { kind: 'send', text: 'Create a file called oracle-note.txt in your home folder with the word hi in it.', sends: true },
  // A second try at Q1 if the first did not ask: removing asks leave more readily, and tidies the first.
  'ask-leave-2': { kind: 'send', text: 'Delete the file oracle-note.txt from your home folder.', sends: true },
  // The bot asks back with choices (Q2).
  'ask-choice': { kind: 'send', text: 'Before you answer, ask me one multiple-choice question: which tree do I prefer, maple, cedar or birch? Wait for my choice.', sends: true },
  // Opens the details panel again (Escape closes it).
  'open-details': { kind: 'click', label: 'View conversation details', sends: false },
  // Empties the Prompt box after a held recipe that is not sent.
  clear: { kind: 'clear', sends: false },
  // Sends what a held recipe (ORACLE_HOLD=1) left typed and attached in the composer.
  enter: { kind: 'enter', sends: true },
  // Answers the question card from ask-choice by pressing its second choice (part of that look).
  'choose-b': { kind: 'choose', letter: 'B', sends: true },
  // A file with the message (A1): a small text file made here, nothing from anywhere else.
  file: { kind: 'send', text: 'What does this file say?', sends: true, files: [{ name: 'oracle-note.txt', text: 'hi from the oracle check\n' }] },
  // Five pictures with the message (A2): squares of one colour each, made here. Five, to see a +N tile if there is one.
  pictures: { kind: 'send', text: 'Name the colour of each square in one line.', sends: true, files: ['red', 'green', 'blue', 'yellow', 'purple'].map((c) => ({ name: `${c}.png`, square: c })) },
};
const COLOURS = { red: [220, 30, 30], green: [30, 160, 60], blue: [40, 70, 220], yellow: [235, 200, 40], purple: [140, 60, 190] };
// A square png of one colour, made here.
function squarePng(n, [r, g, b]) {
  const table = Array.from({ length: 256 }, (_, i) => { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = table[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(n, 0); head.writeUInt32BE(n, 4); head[8] = 8; head[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(n * 3).map((_, i) => [r, g, b][i % 3])]);
  return Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), chunk('IHDR', head), chunk('IDAT', deflateSync(Buffer.concat(Array(n).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
// Puts a recipe's files into the composer's own file input, as a person picking them would.
async function attach(page, files) {
  const dir = mkdtempSync(join(tmpdir(), 'oracle-files-'));
  const paths = files.map((f) => { const at = join(dir, f.name); writeFileSync(at, f.square ? squarePng(256, COLOURS[f.square]) : f.text); return at; });
  // The files go onto the composer's own file input from inside the page, as picking them does.
  // (Through the debug port, answering the Attach files chooser or dropping on the composer
  // leaves it empty in this app, 1.0.3.)
  const made = files.map((f, k) => ({ name: f.name, type: f.square ? 'image/png' : 'text/plain', b64: readFileSync(paths[k]).toString('base64') }));
  const got = await page.evaluate((made) => {
    const input = document.querySelector('main input[type=file]');
    if (!input) return 'the composer has no file input';
    const dt = new DataTransfer();
    for (const m of made) dt.items.add(new File([Uint8Array.from(atob(m.b64), (c) => c.charCodeAt(0))], m.name, { type: m.type }));
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  }, made);
  if (got !== 'ok') throw new Error(got);
  await new Promise((ok) => setTimeout(ok, 2500));
}

export async function activeBot(page) {
  return page.evaluate(() => {
    const h = document.querySelector('main header [role=heading]');
    return h ? h.innerText.trim() : null;
  });
}

export async function run(page, name) {
  const r = RECIPES[name];
  if (!r) throw new Error(`unknown recipe ${name}; known: ${Object.keys(RECIPES).join(', ')}`);
  if (r.sends) {
    const bot = await activeBot(page);
    if (bot !== ORACLE_BOT) throw new Error(`refusing to send: the open bot is "${bot}", not the throwaway "${ORACLE_BOT}" (O1)`);
  }
  if (r.kind === 'create') {
    const ok = await page.evaluate(() => {
      const d = document.querySelector('[role=dialog]');
      const h = d?.querySelector('h2');
      if (!h || h.innerText.trim() !== 'Create New Bot') return 'no Create New Bot dialog';
      const input = d.querySelector('input[aria-label="Bot name"]');
      input.focus();
      return document.activeElement === input ? 'ok' : 'could not focus the name field';
    });
    if (ok !== 'ok') throw new Error(ok);
    await page.send('Input.insertText', { text: ORACLE_BOT });
    await new Promise((res) => setTimeout(res, 300));
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.innerText.trim() === 'Create');
      if (!b || b.disabled) return false;
      b.click();
      return true;
    });
    if (!clicked) throw new Error('Create stayed disabled after naming');
    return;
  }
  const enter = async () => {
    for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) });
  };
  if (r.kind === 'clear') {
    await page.evaluate(() => { const box = document.querySelector('main [role=textbox][aria-label="Prompt"]'); box.focus(); const sel = getSelection(); sel.selectAllChildren(box); });
    for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
    return;
  }
  if (r.kind === 'enter') {
    const ok = await page.evaluate(() => { const box = document.querySelector('main [role=textbox][aria-label="Prompt"]'); box?.focus(); return !!box && box.innerText.trim().length > 0; });
    if (!ok) throw new Error('nothing is typed in the Prompt box');
    return enter();
  }
  if (r.kind === 'choose') {
    const ok = await page.evaluate((letter) => {
      const b = [...document.querySelectorAll('main button')].find((x) => x.innerText.trim().split('\n')[0] === letter);
      if (!b) return false;
      b.click();
      return true;
    }, r.letter);
    if (!ok) throw new Error(`no choice lettered ${r.letter} on screen`);
    return;
  }
  if (r.kind === 'click') {
    const ok = await page.evaluate((label) => {
      const b = document.querySelector(`button[aria-label="${label}"]`);
      if (!b) return false;
      b.click();
      return true;
    }, r.label);
    if (!ok) throw new Error(`no button labelled "${r.label}"`);
    return;
  }
  const focused = await page.evaluate(() => {
    const box = document.querySelector('main [role=textbox][aria-label="Prompt"]');
    if (!box) return false;
    box.focus();
    return document.activeElement === box || box.contains(document.activeElement);
  });
  if (!focused) throw new Error('could not focus the Prompt box');
  if (r.files) await attach(page, r.files);
  if (!(await page.evaluate((t) => document.querySelector('main [role=textbox][aria-label="Prompt"]').innerText.trim() === t, r.text))) await page.send('Input.insertText', { text: r.text });
  if (process.env.ORACLE_HOLD) return; // typed and attached, not sent: for a look at the waiting composer
  await new Promise((ok) => setTimeout(ok, 250));
  for (const type of ['keyDown', 'keyUp']) {
    await page.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) });
  }
}
