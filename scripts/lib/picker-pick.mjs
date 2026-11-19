// A pick in the Voice chat card's pickers changes its row (task-d2fde20bf4539af1, item N4).
// Before this, a pick only closed the picker: the overlay host passed onPick={close}, so the value
// was dropped and the row kept what it had. Nothing caught it: Gate A holds each picker open on the
// captured pick, and the keys rule (overlay-keys.mjs) closes the pickers with Escape.
// Grok 1.2.3 (decision 0010): two rows. Voice is a button reading "<voice> <speed>" ("Helix 1.0x")
// that opens a dialog, the Speed slider over a grid of voices; Language is a list, as before.
// Not captured, so ours: a voice pick leaves the dialog open (a radio group), and the slider's step
// (0.1, one ArrowRight).
// The page is the oracle scene (/gate/oracle-turn-1040): the real Shell, the pickers opened from
// their rows by a real click, an option picked by a real click, the slider moved by a real key.
const VOICE = 'button[data-picker="voice-picker"]';
const LANGUAGE = '[role=combobox][aria-label="Language"]';

export async function pickerPick({ check, precondition, ev, open, base, click, wait, until, windowFocus, page }) {
  const press = async (k, code) => {
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: code });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code });
    await wait(150);
  };
  const values = () => ev(([v, l]) => ({ Voice: document.querySelector(v)?.textContent.trim() ?? null, Language: document.querySelector(l)?.textContent.trim() ?? null }), [VOICE, LANGUAGE]);
  const shown = () => ev(() => document.querySelector('.overlay')?.getAttribute('data-overlay') ?? null);
  // The open list's options, or the open dialog's voices, and which are checked; the dialog's speed;
  // whether the checked voice lies inside the grid's view.
  const listed = () => ev(() => {
    const opts = [...document.querySelectorAll('.overlay [role=option]')];
    const text = (o) => (o.querySelector('.option-text div') ?? o).textContent.trim();
    const radios = [...document.querySelectorAll('.overlay [role=radio]')];
    const name = (r) => r.querySelector('.voice-name')?.textContent.trim();
    const grid = document.querySelector('.overlay [role=radiogroup]')?.getBoundingClientRect();
    const on = radios.find((r) => r.getAttribute('aria-checked') === 'true')?.getBoundingClientRect();
    return {
      options: opts.length ? opts.map(text) : radios.map(name),
      checked: opts.length ? opts.filter((o) => o.getAttribute('aria-selected') === 'true').map(text) : radios.filter((r) => r.getAttribute('aria-checked') === 'true').map(name),
      speed: document.querySelector('.overlay .speed-value')?.textContent.trim() ?? null,
      inView: !!(grid && on && on.top >= grid.top && on.bottom <= grid.bottom),
    };
  });
  const clickOn = async (sel) => {
    const at = await ev((s) => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
    if (at) await click(...at);
    await wait(250);
    return !!at;
  };
  // Mark the option or voice named `c` so a real click can find it.
  const mark = (c) => ev((c) => [...document.querySelectorAll('.overlay [role=option], .overlay [role=radio]')].find((o) => (o.querySelector('.option-text div') ?? o.querySelector('.voice-name') ?? o).textContent.trim() === c)?.setAttribute('data-test-choice', ''), c);
  const after = (list, at) => list[(at + 2) % list.length]; // two below the checked one: never the one already picked

  await open(`${base}/gate/oracle-turn-1040`); await windowFocus(true);
  await until(async () => (await ev((s) => !!document.querySelector(s), VOICE)), 15000, 'the oracle scene').catch(() => {});
  const start = await values();
  precondition('the oracle scene shows the Voice chat card, Voice reading Helix 1.0x and Language Auto-detect, and no overlay open', start.Voice === 'Helix 1.0x' && start.Language === 'Auto-detect' && (await shown()) === null, { start, overlay: await shown() });

  // Voice: pick a voice, then step the speed, in one opening.
  await clickOn(VOICE);
  const before = await listed();
  const voice = after(before.options, before.options.indexOf(before.checked[0]));
  await mark(voice);
  await clickOn('.overlay [data-test-choice]');
  const picked = { shown: await shown(), row: (await values()).Voice, checked: (await listed()).checked };
  await ev(() => document.querySelector('.overlay input[aria-label="Speed"]')?.focus());
  await press('ArrowRight', 39);
  const stepped = { row: (await values()).Voice, speed: (await listed()).speed };
  await press('Escape', 27);
  const closed = (await shown()) === null;
  await clickOn(VOICE);
  const again = await listed();
  await press('Escape', 27);
  const v = { opened: before.checked, inView: before.inView, speedAtOpen: before.speed, voice, picked, stepped, closed, reopened: { checked: again.checked, speed: again.speed }, now: await values() };
  check(`Voice: the dialog opens with Helix checked and in view at 1.0x; picking ${voice} makes the row read "${voice} 1.0x" (the dialog stays open, ours); ArrowRight on Speed makes it "${voice} 1.1x" and the dialog 1.1x; reopened, it checks ${voice} at 1.1x; Language keeps Auto-detect (control: the row read Helix 1.0x before)`,
    JSON.stringify(before.checked) === '["Helix"]' && before.inView && before.speed === '1.0x' && voice !== 'Helix' &&
    picked.shown === 'voice-picker' && picked.row === `${voice} 1.0x` && JSON.stringify(picked.checked) === JSON.stringify([voice]) &&
    stepped.row === `${voice} 1.1x` && stepped.speed === '1.1x' && closed &&
    JSON.stringify(again.checked) === JSON.stringify([voice]) && again.speed === '1.1x' && v.now.Voice === `${voice} 1.1x` && v.now.Language === 'Auto-detect', v);

  // Language: a list, as before; a pick closes it.
  await clickOn(LANGUAGE);
  const lb = await listed();
  const lang = after(lb.options, lb.options.indexOf(lb.checked[0]));
  await mark(lang);
  await clickOn('.overlay [data-test-choice]');
  const lClosed = (await shown()) === null;
  const lNow = await values();
  await clickOn(LANGUAGE);
  const lAgain = await listed();
  await press('Escape', 27);
  const l = { opened: lb.checked, choice: lang, closed: lClosed, now: lNow, reopened: lAgain.checked };
  check(`Language: picking ${lang} closes the picker and the row says ${lang}; reopened, it checks ${lang}; Voice keeps "${voice} 1.1x" (control: it opened with Auto-detect checked, the row's value)`,
    JSON.stringify(lb.checked) === '["Auto-detect"]' && lang !== 'Auto-detect' && lClosed && lNow.Language === lang && lNow.Voice === `${voice} 1.1x` && JSON.stringify(lAgain.checked) === JSON.stringify([lang]), l);
}
