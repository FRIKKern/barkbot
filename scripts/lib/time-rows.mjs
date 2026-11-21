// Time rows between messages on the live page (task-5ca85303610bf166). Grok 1.2.3 parts a
// conversation with a time row where a message comes a while after the one before it, and the row
// reads that message's time (app/src/components/Transcript.tsx laterRow: the captures bound the gap
// to more than a minute and at most 3 h 8 min). The page times a message by Barkpark's inserted_at
// for a stored row, and by its own clock for one it shows before the row comes.
// Run inside the stand-in's open conversation (behaviour.mjs, the stored-rows section).
export async function timeRows({ check, precondition, ev, open, base, until, wait, stub, page }) {
  const rows = () => ev(() => [...document.querySelectorAll('.transcript .column > *')].map((e) =>
    e.classList.contains('time-later') ? `time ${e.querySelector('time')?.getAttribute('datetime')} ${e.textContent.trim()}` : e.querySelector('.bubble') ? `${e.querySelector('.bubble').dataset.role} ${e.querySelector('.bubble-text')?.innerText.trim()}` : null).filter(Boolean));
  const at = (seq, role, text, iso) => ({ seq, role, source_markdown: text, inserted_at: iso });
  stub.rows = [
    at(1, 'user', 'first', '2026-11-15T10:00:00Z'), at(2, 'assistant', 'first reply', '2026-11-15T10:00:05Z'),
    // 40 s on: no row (control).
    at(3, 'user', 'soon after', '2026-11-15T10:00:40Z'), at(4, 'assistant', 'soon reply', '2026-11-15T10:00:45Z'),
    // 3 h 10 min on: a row over this message, at its time.
    at(5, 'user', 'much later', '2026-11-15T13:10:00Z'), at(6, 'assistant', 'later reply', '2026-11-15T13:10:05Z'),
  ];
  await open(`${base}/`);
  await until(async () => (await rows()).filter((r) => !r.startsWith('time')).length >= 6, 30000, 'the stored rows').catch(() => {});
  let r = await rows();
  precondition('the live page shows the six stored rows', r.filter((x) => !x.startsWith('time')).length === 6, { r });
  const times = r.filter((x) => x.startsWith('time'));
  check('stored rows 3 h 10 min apart: one time row, right above the later message, reading its time (control: 40 s apart, none)',
    times.length === 1 && times[0].startsWith('time 2026-11-15T13:10:00Z ') && r[r.indexOf(times[0]) + 1] === 'user much later', { r });
  // A turn sent now, days after the last stored row: the page's own clock times it.
  await ev(() => document.querySelector('.prompt').focus());
  await page.send('Input.insertText', { text: 'hello again' });
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await until(async () => (await rows()).includes('user hello again'), 8000, 'our message').catch(() => {});
  await wait(200);
  r = await rows();
  const mine = r.indexOf('user hello again');
  check('a message sent now, after a gap: a time row right above it, "Today" at its time',
    mine > 0 && /^time \S+ Today \d+:\d\d [AP]M$/.test(r[mine - 1]) && r.filter((x) => x.startsWith('time')).length === 2, { r });
  stub.rows = [];
}
