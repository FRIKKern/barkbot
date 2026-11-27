// The overlays' keys and focus, as traces/2026-11-09-keys.json measured them on the oracle (task-
// 4d9930cf48ab41fb): five overlays, each opened by a real click on its trigger, then real keys and
// an outside click. On Grok 1.2.3 the Speed list is gone: its keys are checked on the Language list,
// the same listbox. The Voice dialog's focus on open is traced (2026-11-19-voice-picker.json); its
// Escape is ours, as the other overlays'. app/src/components/overlays/index.tsx implements them from that trace; until
// these rules nothing drove a key on an overlay, so a regression passed every gate.
// The page is the oracle scene (/gate/oracle-turn-1040): the real Shell, overlays opened from
// their triggers, nothing held open by the scene.
const KEYS = { Tab: 9, Escape: 27, ArrowDown: 40, ArrowUp: 38 };

export async function overlayKeys({ check, precondition, ev, open, base, click, wait, until, windowFocus, page }) {
  const press = async (k) => {
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: KEYS[k] });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: KEYS[k] });
    await wait(120);
  };
  // What has focus, as the trace names it: "<role> <label>", "[highlighted]" when the row carries
  // data-highlighted, "(overlay)" when it is inside the open overlay (the panel has a Bot name field
  // too), or "body".
  const focused = () => ev(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return 'body';
    const role = a.getAttribute('role') || (a.tagName === 'INPUT' ? 'input' : a.tagName.toLowerCase());
    const by = a.getAttribute('aria-labelledby');
    const own = (a.querySelector('.menu-label span') ?? a.querySelector('.option-text div') ?? a.querySelector('.voice-name') ?? a).textContent;
    const label = a.getAttribute('aria-label') || (by && document.getElementById(by)?.textContent.trim()) || own.trim();
    return `${role} ${label}${a.hasAttribute('data-highlighted') ? ' [highlighted]' : ''}${a.closest('.overlay') ? ' (overlay)' : ''}`;
  });
  const highlighted = () => ev(() => [...document.querySelectorAll('.overlay [data-highlighted]')].length);
  const shown = () => ev(() => document.querySelector('.overlay')?.getAttribute('data-overlay') ?? null);
  // A real click at the middle of the first element the selector finds (scrolled into view first).
  const clickOn = async (sel) => {
    const at = await ev((s) => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
    if (at) await click(...at);
    await wait(250);
    return !!at;
  };
  // An outside click: the trace's point (960, 40) is in the oracle's window, and at this page's size
  // it can fall inside a dialog (Connect apps is wide), so the click goes to the nearest corner of the
  // page that is outside the open dialog or menu.
  const outside = async () => {
    const at = await ev(() => {
      const box = document.querySelector('.overlay [role=dialog], .overlay [role=menu], .overlay [role=listbox]')?.getBoundingClientRect();
      const w = innerWidth, h = innerHeight;
      const corners = [[8, 8], [w - 8, 8], [8, h - 8], [w - 8, h - 8]];
      return corners.find(([x, y]) => !box || x < box.left || x > box.right || y < box.top || y > box.bottom) ?? null;
    });
    if (at) await click(...at);
    await wait(250);
    return at;
  };
  const fresh = async () => {
    await open(`${base}/gate/oracle-turn-1040`); await windowFocus(true);
    await until(async () => (await ev(() => !!document.querySelector('button[aria-label="New Bot"]'))), 15000, 'the oracle scene').catch(() => {});
    await ev(() => document.activeElement?.blur?.()); await wait(200);
  };

  // New Bot: its name field on open; Tab to the first shape; Escape back to New Bot; outside to the page.
  await fresh();
  precondition('the oracle scene is up, no overlay is open and nothing has focus', (await shown()) === null && (await focused()) === 'body', { overlay: await shown(), focus: await focused() });
  await clickOn('button[aria-label="New Bot"]');
  const nb = { open: await focused() };
  await press('Tab'); nb.tab = await focused();
  await press('Escape'); nb.escape = await focused(); nb.after = await shown();
  await clickOn('button[aria-label="New Bot"]'); nb.again = await shown();
  nb.at = await outside(); nb.outside = await focused(); nb.afterOutside = await shown();
  check('New Bot (keys trace): open puts focus in its Bot name field; Tab goes to the first character shape; Escape closes it and gives focus back to New Bot; an outside click closes it and leaves focus on the page (control: it was open again before the click)',
    nb.open === 'input Bot name (overlay)' && nb.tab === 'button blob character shape (overlay)' && nb.escape === 'button New Bot' && nb.after === null && nb.again === 'new-bot-dialog' && nb.outside === 'body' && nb.afterOutside === null, nb);

  // Connect apps: the dialog itself on open; Tab to Close dialog; Escape back to Connect apps; outside to the page.
  await fresh();
  await clickOn('button[aria-label="Connect apps"]');
  const ca = { open: await focused() };
  await press('Tab'); ca.tab = await focused();
  await press('Escape'); ca.escape = await focused(); ca.after = await shown();
  // Settings (account menu > Settings) next, from here: in the probe Connect apps had focus before
  // the account menu opened, and Escape on Settings gave focus back to it.
  const before = await focused();
  await clickOn('button[aria-label^="Open account menu"]');
  const menu = await shown();
  await ev(() => [...document.querySelectorAll('.overlay [role=menuitem]')].find((r) => r.textContent.trim().startsWith('Settings'))?.setAttribute('data-test-settings', ''));
  await clickOn('.overlay [data-test-settings]');
  const st = { before, menu, open: await focused(), shown: await shown() };
  await press('Tab'); st.tab = await focused();
  await press('Escape'); st.escape = await focused(); st.after = await shown();
  // The trace (0.79.3) named the close button Close; 1.2.3 names it Close dialog (oracle-connect-apps).
  check('Connect apps (keys trace): open puts focus on the dialog itself; Tab goes to Close dialog; Escape closes it and gives focus back to Connect apps',
    ca.open === 'dialog Connect apps (overlay)' && ca.tab === 'button Close dialog (overlay)' && ca.escape === 'button Connect apps' && ca.after === null, ca);
  check('Settings from the account menu (keys trace): open puts focus on the dialog itself; Tab goes to General; Escape closes it and gives focus back to what had it before the account menu opened, Connect apps (control: the account menu opened)',
    st.before === 'button Connect apps' && st.menu === 'account-menu' && st.shown === 'settings' && st.open === 'dialog Grok Bot settings (overlay)' && st.tab === 'button General (overlay)' && st.escape === 'button Connect apps' && st.after === null, st);
  // Outside clicks on the modals (the trace records one for each).
  await clickOn('button[aria-label^="Open account menu"]');
  await ev(() => [...document.querySelectorAll('.overlay [role=menuitem]')].find((r) => r.textContent.trim().startsWith('Settings'))?.setAttribute('data-test-settings', ''));
  await clickOn('.overlay [data-test-settings]'); const stAgain = await shown();
  const stAt = await outside(); const stOut = { again: stAgain, at: stAt, focus: await focused(), after: await shown() };
  check('Settings (keys trace): an outside click closes it and leaves focus on the page (control: it was open before the click)', stOut.again === 'settings' && stOut.focus === 'body' && stOut.after === null, stOut);
  await clickOn('button[aria-label="Connect apps"]'); const caAgain = await shown();
  const caAt = await outside(); const caOut = { again: caAgain, at: caAt, focus: await focused(), after: await shown() };
  check('Connect apps (keys trace): an outside click closes it and leaves focus on the page (control: it was open before the click)', caOut.again === 'connect-apps' && caOut.focus === 'body' && caOut.after === null, caOut);

  // Settings' pages on the live page: account menu > Settings, then a real click on each tab. The
  // scenes oracle-settings-computer, -permissions and -updates open Settings on those tabs
  // (overlays/index.tsx); this is the live path to the same states, so a scene feeds only what the
  // live page draws. Each page is named by its heading, its tab's aria-current and one row only it has.
  await fresh();
  const marks = ['Unlock the ultimate AI subscription', 'Read texts', 'Approvals', 'Automatic updates'];
  const pageOf = () => ev((m) => {
    const d = document.querySelector('.overlay [role=dialog]');
    const body = d?.querySelector('.set-body')?.textContent ?? '';
    return { head: d?.querySelector('.set-head h2')?.textContent ?? null, tab: d?.querySelector('.set-tab[aria-current=page]')?.textContent.trim() ?? null, rows: m.filter((r) => body.includes(r)) };
  }, marks);
  await clickOn('button[aria-label^="Open account menu"]');
  await ev(() => [...document.querySelectorAll('.overlay [role=menuitem]')].find((r) => r.textContent.trim().startsWith('Settings'))?.setAttribute('data-test-settings', ''));
  await clickOn('.overlay [data-test-settings]');
  const tabs = { shown: await shown(), General: await pageOf() };
  for (const t of ['Computer', 'Permissions', 'Updates']) {
    await ev((name) => [...document.querySelectorAll('.overlay .set-tab')].find((b) => b.textContent.trim() === name)?.setAttribute('data-test-tab', name), t);
    await clickOn(`.overlay [data-test-tab="${t}"]`);
    tabs[t] = await pageOf();
  }
  const isPage = (p, name, row) => p.head === name && p.tab === name && p.rows.length === 1 && p.rows[0] === row;
  check('Settings pages on the live page: account menu > Settings opens General; a click on Computer, Permissions and Updates shows that page (its heading, its tab current, its own row and no other page\'s), the states the oracle-settings-* scenes open on (control: General first)',
    tabs.shown === 'settings' && isPage(tabs.General, 'General', marks[0]) && isPage(tabs.Computer, 'Computer', marks[1]) && isPage(tabs.Permissions, 'Permissions', marks[2]) && isPage(tabs.Updates, 'Updates', marks[3]), tabs);

  // Composer menu: the menu itself on open, no row highlighted; arrows walk the rows; Escape back to its button.
  await fresh();
  await clickOn('button[aria-label="Composer actions"]');
  const cm = { open: await focused(), lit: await highlighted() };
  await press('ArrowDown'); cm.down = await focused();
  await press('ArrowDown'); cm.down2 = await focused();
  await press('ArrowUp'); cm.up = await focused(); cm.litAfter = await highlighted();
  await press('Escape'); cm.escape = await focused(); cm.after = await shown();
  check('composer menu (keys trace): open puts focus on the menu with no row highlighted; ArrowDown focuses and highlights Attach files, then Teach a task; ArrowUp goes back to Attach files, the one row highlighted; Escape closes it and gives focus back to Composer actions',
    cm.open === 'menu Composer actions (overlay)' && cm.lit === 0 && cm.down === 'menuitem Attach files [highlighted] (overlay)' && cm.down2 === 'menuitem Teach a task [highlighted] (overlay)' && cm.up === 'menuitem Attach files [highlighted] (overlay)' && cm.litAfter === 1 && cm.escape === 'button Composer actions' && cm.after === null, cm);

  // Language picker (Grok 1.2.3 has no Speed list; the keys trace measured these keys on 0.79.3's Speed
  // list, and Language is the same listbox): its picked option on open, highlighted; arrows walk;
  // Escape picks nothing and goes back to the box.
  await fresh();
  const value = (row) => ev((r) => (r === 'Voice' ? document.querySelector('button[data-picker="voice-picker"]') : document.querySelector(`[role=combobox][aria-label="${r}"]`))?.textContent.trim() ?? null, row);
  const was = await value('Language');
  await clickOn('[role=combobox][aria-label="Language"]');
  const lp = { was, open: await focused() };
  await press('ArrowDown'); lp.down = await focused();
  await press('ArrowDown'); lp.down2 = await focused();
  await press('ArrowUp'); lp.up = await focused();
  await press('Escape'); lp.escape = await focused(); lp.after = await shown(); lp.value = await value('Language');
  check('language picker (keys trace, on the same listbox): open focuses and highlights the picked option, Auto-detect; ArrowDown goes to English, then Arabic (Egypt); ArrowUp back to English; Escape closes it without choosing and gives focus back to the Language box, still Auto-detect (control: it read Auto-detect before)',
    lp.was === 'Auto-detect' && lp.open === 'option Auto-detect [highlighted] (overlay)' && lp.down === 'option English [highlighted] (overlay)' && lp.down2 === 'option Arabic (Egypt) [highlighted] (overlay)' && lp.up === 'option English [highlighted] (overlay)' && lp.escape === 'combobox Language' && lp.after === null && lp.value === 'Auto-detect', lp);

  // The Voice dialog (1.2.3): open focuses the checked voice (the voice-picker trace); Escape closes it
  // without choosing and gives focus back to the Voice button, still Helix 1.0x (ours, as the other overlays).
  await fresh();
  const vWas = await value('Voice');
  await clickOn('button[data-picker="voice-picker"]');
  const vd = { was: vWas, shown: await shown(), open: await focused() };
  await press('Escape'); vd.escape = await focused(); vd.after = await shown(); vd.value = await value('Voice');
  check('Voice dialog (voice-picker trace): open focuses the checked voice, Helix; Escape (ours, untraced) closes it without choosing and gives focus back to the Voice button, still Helix 1.0x (control: it read Helix 1.0x and the dialog was up)',
    vd.was === 'Helix 1.0x' && vd.shown === 'voice-picker' && vd.open === 'radio Helix (overlay)' && vd.escape === 'button Helix 1.0x' && vd.after === null && vd.value === 'Helix 1.0x', vd);

  // Get mobile (account menu > Get Grok Bot for mobile, as Settings): the row opens the dialog (rev295:
  // it only closed the menu, so the dialog was reachable in a gate scene alone); Escape closes it and
  // gives focus back to the account menu's button, which had it when the menu opened.
  await fresh();
  await clickOn('button[aria-label^="Open account menu"]');
  const gmMenu = await shown();
  await ev(() => [...document.querySelectorAll('.overlay [role=menuitem]')].find((r) => r.textContent.trim().startsWith('Get Grok Bot for mobile'))?.setAttribute('data-test-mobile', ''));
  const gmRow = await clickOn('.overlay [data-test-mobile]');
  const gm = { menu: gmMenu, row: gmRow, shown: await shown(), open: await focused() };
  await press('Escape'); gm.escape = await focused(); gm.after = await shown();
  check('Get mobile from the account menu: its row opens the Get mobile dialog, focus inside it; Escape closes it and gives focus back to the account menu\'s button (control: the account menu opened and the row was there)',
    gm.menu === 'account-menu' && gm.row && gm.shown === 'get-mobile' && gm.open.endsWith('(overlay)') && gm.escape.startsWith('button Open account menu') && gm.after === null, gm);
}
