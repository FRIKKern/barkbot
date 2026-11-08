// Fixed gestures for the oracle (O3). Nothing else is ever typed or clicked.
// Every recipe that sends a message refuses unless the open bot is the
// throwaway oracle bot (O1): never Grookie, never another real bot.
export const ORACLE_BOT = process.env.ORACLE_BOT || 'Oracle';

export const RECIPES = {
  // Creates the throwaway bot and records its first-run greeting (J12).
  'new-bot': { kind: 'click', label: 'New Bot', sends: false },
  // In the Create New Bot dialog: name the throwaway bot and create it (J12 starts here).
  'create-oracle': { kind: 'create', sends: false },
  'say-hi': { kind: 'send', text: 'Say hi in one short sentence.', sends: true },
  // The hero's turn: the bot checks its own computer before answering.
  storage: { kind: 'send', text: 'How much storage do you have, and where?', sends: true },
};

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
  await page.send('Input.insertText', { text: r.text });
  await new Promise((ok) => setTimeout(ok, 250));
  for (const type of ['keyDown', 'keyUp']) {
    await page.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) });
  }
}
