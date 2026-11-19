// Shift+Enter in Prompt, held to traces/2026-11-08-feel-shift.json (task-d0b878e32a2cd243, item T4).
// On the oracle, Shift+Enter after the say-hi recipe's words sent nothing, put in a new line, and the
// box grew from one line to two (20 to 40 tall). Composer.tsx does the same, but until this rule no
// gate pressed Shift+Enter, so a Composer that sent on it passed every gate.
// The page is the live page (/) against the stand-in Barkpark: only there does the Composer send, so
// only there can "sends nothing" be measured (stub.sent). The control: plain Enter on the same words
// does send, once, and clears the box.
// The key sequence and the measure are the oracle recipe's (scripts/oracle/feel.mjs): a real Shift
// held around Enter, and the box read as chars, line breaks, blocks and height. The break count is
// the trace's exactly (2: innerText reads a new line in a contenteditable as two), not just more.
import { readFileSync } from 'node:fs';
import { path } from './data.mjs';
import { RECIPES } from '../oracle/recipes.mjs';

const TRACE = JSON.parse(readFileSync(path('traces', '2026-11-08-feel-shift.json'), 'utf8')).shiftEnter;

const SID = '00000000-0000-4000-8000-0000000005e1';

export async function shiftEnter({ check, precondition, ev, open, base, page, wait, until, stub, key, clearPrompt, host, session, freshStore }) {
  const draft = () => ev(() => {
    const b = document.querySelector('main [role=textbox][aria-label="Prompt"]');
    if (!b) return null;
    return { chars: b.innerText.replace(/\n/g, '').trim().length, breaks: (b.innerText.match(/\n/g) || []).length, blocks: b.querySelectorAll('p,div').length, height: Math.round(b.getBoundingClientRect().height) };
  });
  const words = async () => {
    await ev(() => document.querySelector('main [role=textbox][aria-label="Prompt"]').focus());
    await page.send('Input.insertText', { text: RECIPES['say-hi'].text });
    await wait(200);
  };

  stub.hosts = host(true); stub.fleet = null; stub.rows = []; freshStore(); stub.sessions = [session(SID)]; stub.failShow.clear(); stub.opened = [];
  await open(`${base}/`); await until(() => stub.opened.includes(SID), 15000, 'the conversation to open').catch(() => {}); await wait(800); await clearPrompt();
  const empty = await draft();
  precondition('the live page has an empty Prompt box in main, and the trace was read', !!empty && empty.chars === 0 && !!TRACE?.before && !!TRACE?.after, { empty, trace: TRACE });

  await words();
  const before = await draft();
  const s0 = stub.sent.length;
  const send = (type, k, code, mods, vk, more = {}) => page.send('Input.dispatchKeyEvent', { type, key: k, code, modifiers: mods, windowsVirtualKeyCode: vk, ...more });
  await send('rawKeyDown', 'Shift', 'ShiftLeft', 8, 16);
  await send('rawKeyDown', 'Enter', 'Enter', 8, 13);
  await send('char', 'Enter', 'Enter', 8, 13, { text: '\r' });
  await send('keyUp', 'Enter', 'Enter', 8, 13);
  await send('keyUp', 'Shift', 'ShiftLeft', 0, 16);
  // A send reaches the stand-in within a few hundred ms (the Enter control below); wait well past it.
  await until(() => stub.sent.length > s0, 1500, 'a send').catch(() => {});
  await wait(500);
  const after = await draft();
  const shift = { trace: TRACE, before, after, sent: stub.sent.slice(s0).map((m) => m.content) };
  check(`Shift+Enter in Prompt (feel-shift trace): sends nothing, keeps the ${TRACE.before.chars} typed characters, reads ${TRACE.after.breaks} line breaks after the press as the oracle's box did, and the box grows from ${TRACE.before.height} to ${TRACE.after.height} tall`,
    shift.sent.length === 0 && before.chars === TRACE.before.chars && after.chars === TRACE.after.chars &&
    before.breaks === TRACE.before.breaks && after.breaks === TRACE.after.breaks &&
    before.height === TRACE.before.height && after.height === TRACE.after.height, shift);

  // Control: the same words and plain Enter do send, once, and the box clears.
  await clearPrompt(); await words();
  const e0 = stub.sent.length;
  await key('Enter');
  await until(() => stub.sent.length > e0, 8000, 'the Enter send').catch(() => {}); await wait(300);
  const enter = { sent: stub.sent.slice(e0).map((m) => m.content), after: await draft() };
  check('control: plain Enter on the same words sends them once and clears the box', JSON.stringify(enter.sent) === JSON.stringify([RECIPES['say-hi'].text]) && enter.after?.chars === 0, enter);
  await clearPrompt();
  stub.sessions = []; freshStore();
}
