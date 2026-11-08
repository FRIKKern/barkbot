// Measure the oracle's feel (gate C) in one throwaway-bot session and write
// traces/<date>-feel.json. Gestures stay inside the page (O1); the one send is
// the say-hi recipe, guarded (O3). Bring the oracle to the front first: a hidden
// window does not paint, so frame timings would read zero.
// Usage: ORACLE_BOT=Oracle node scripts/oracle/feel.mjs [--only shift|send|panel]
import { writeFileSync } from 'node:fs';
import { connect } from './cdp.mjs';
import { run, activeBot, ORACLE_BOT, RECIPES } from './recipes.mjs';
import { path } from '../lib/data.mjs';

const page = await connect();
const bot = await activeBot(page);
if (bot !== ORACLE_BOT) throw new Error(`refusing: the open bot is "${bot}", not "${ORACLE_BOT}"`);
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const want = (k) => !only || only === k;
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const out = { id: `${new Date().toISOString().slice(0, 10)}-feel`, bot, captured: new Date().toISOString(), engine: 'electron', viewport: await page.evaluate(() => [innerWidth, innerHeight]) };
const prompt = () => page.evaluate(() => { const b = document.querySelector('main [role=textbox][aria-label="Prompt"]'); b.focus(); return document.activeElement === b || b.contains(document.activeElement); });
// The transcript only keeps what is on screen, so a bubble count is no instrument. The draft is:
// if the text is still in the box after the key, nothing was sent.
const draft = () => page.evaluate(() => { const b = document.querySelector('main [role=textbox][aria-label="Prompt"]'); return { chars: b.innerText.replace(/\n/g, '').trim().length, breaks: (b.innerText.match(/\n/g) || []).length, blocks: b.querySelectorAll('p,div').length, height: Math.round(b.getBoundingClientRect().height) }; });
const key = async (k, mods = 0) => { for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: k, code: k, modifiers: mods, windowsVirtualKeyCode: k === 'Enter' ? 13 : k === 'Backspace' ? 8 : 0, ...(type === 'keyDown' && k === 'Enter' ? { text: '\r' } : {}) }); };

// 1. Shift+Enter: a real Shift press around Enter. Typed text is the recipe's.
if (want('shift')) {
  if (!(await prompt())) throw new Error('could not focus the Prompt box');
  await page.send('Input.insertText', { text: RECIPES['say-hi'].text });
  await wait(200);
  const typed = await draft();
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', modifiers: 8, windowsVirtualKeyCode: 16 });
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', modifiers: 8, windowsVirtualKeyCode: 13 });
  await page.send('Input.dispatchKeyEvent', { type: 'char', key: 'Enter', code: 'Enter', modifiers: 8, text: '\r', windowsVirtualKeyCode: 13 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', modifiers: 8, windowsVirtualKeyCode: 13 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', modifiers: 0, windowsVirtualKeyCode: 16 });
  await wait(500);
  const after = await draft();
  out.shiftEnter = { before: typed, after, sent: after.chars === 0, newLine: after.chars > 0 && (after.breaks > typed.breaks || after.blocks > typed.blocks || after.height > typed.height) };
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', modifiers: 4, windowsVirtualKeyCode: 65, commands: ['selectAll'] });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 4, windowsVirtualKeyCode: 65 });
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await wait(300);
  out.shiftEnter.clearedAfter = (await draft()).chars === 0;
  if (!out.shiftEnter.clearedAfter) throw new Error('draft did not clear; stopping before any send');
}

// 2. One send: first visible change, focus after send, scroll pinned while the reply lands.
if (want('send')) {
await page.evaluate(() => {
  const t0 = performance.now(); const rec = window.__feel = { changes: [], scroll: [] };
  const sc = () => [...document.querySelectorAll('main div')].find((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight);
  new MutationObserver(() => rec.changes.push(Math.round(performance.now() - t0))).observe(document.querySelector('main'), { childList: true, subtree: true, characterData: true });
  const f = () => { const s = sc(); if (s) rec.scroll.push([Math.round(performance.now() - t0), Math.round(s.scrollHeight - s.scrollTop - s.clientHeight)]); if (performance.now() - t0 < 15000) requestAnimationFrame(f); };
  requestAnimationFrame(f);
  window.__feelT0 = t0;
});
await run(page, 'say-hi');
await wait(300);
out.focusAfterSend = await page.evaluate(() => { const a = document.activeElement; return a?.getAttribute('aria-label') || a?.tagName.toLowerCase(); });
await wait(14000);
const feel = await page.evaluate(() => window.__feel);
out.send = { firstChangeMs: feel.changes[0] ?? null, frames: feel.scroll.length, maxGapFromBottom: Math.max(0, ...feel.scroll.map((s) => s[1])), endGapFromBottom: feel.scroll.at(-1)?.[1] ?? null };
}

// 3. Panel close and open through its toggle; width sampled while it moves.
if (want('panel')) {
  const anims = [];
  page.on('Animation.animationStarted', ({ animation: a }) => anims.push({ name: a.name || a.type, duration: a.source?.duration, easing: a.source?.easing }));
  await page.send('Animation.enable');
  const width = () => page.evaluate(() => Math.round(document.querySelector('aside[aria-label="Conversation details"]')?.getBoundingClientRect().width ?? -1));
  const toggle = async () => {
    const t0 = Date.now(); const n0 = anims.length;
    const ok = await page.evaluate(() => { const b = document.querySelector('button[aria-label="View conversation details"]'); if (!b) return false; b.click(); return true; });
    if (!ok) throw new Error('no View conversation details button');
    const w = []; for (let i = 0; i < 14; i++) { w.push([Date.now() - t0, await width()]); await wait(30); }
    return { widths: w, transitions: anims.slice(n0).filter((a) => a.name === 'width') };
  };
  const startWidth = await width();
  out.panel = { startWidth, first: await toggle() };
  await wait(300);
  out.panel.second = await toggle();
  out.panel.endWidth = await width();
  if (out.panel.endWidth !== startWidth) throw new Error(`panel left at ${out.panel.endWidth}, was ${startWidth}`);
}

writeFileSync(path('traces', `${out.id}${only ? `-${only}` : ''}.json`), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out, null, 1));
page.close();
