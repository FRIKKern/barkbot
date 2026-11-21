// Settings shows the live page's own facts, not the capture's (task-e222689d60f2564b): Computer
// says when Barkpark last heard from the bot's computer (its last_seen_at), Updates says the app's
// own build, and a flipped switch stays flipped across a tab change. Before this, the page read
// "Last opened 13 minutes ago" and "Version 1.2.3" whatever the computer and build were.
// The live page (/) against the stand-in Barkpark; Settings is opened from the account menu.
import { execFileSync } from 'node:child_process';

export async function settingsLive({ check, precondition, ev, open, base, click, wait, until, stub, host }) {
  const clickOn = async (sel) => {
    const at = await ev((s) => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
    if (at) await click(...at);
    await wait(250);
    return !!at;
  };
  const tab = async (name) => {
    await ev((n) => [...document.querySelectorAll('.overlay .set-tab')].find((b) => b.textContent.trim() === n)?.setAttribute('data-test-tab', n), name);
    await clickOn(`.overlay [data-test-tab="${name}"]`);
  };
  const settings = async () => {
    await clickOn('button[aria-label^="Open account menu"]');
    await ev(() => [...document.querySelectorAll('.overlay [role=menuitem]')].find((r) => r.textContent.trim().startsWith('Settings'))?.setAttribute('data-test-settings', ''));
    await clickOn('.overlay [data-test-settings]');
  };
  const read = () => ev(() => {
    const d = document.querySelector('.overlay [role=dialog]');
    return {
      head: d?.querySelector('.set-head h2')?.textContent ?? null,
      device: d?.querySelector('.set-device-state')?.textContent.trim() ?? null,
      version: d?.querySelector('.set-label bdi')?.textContent ?? null,
      status: d?.querySelector('.set-uptodate')?.textContent ?? null,
      readTexts: d?.querySelector('[role=switch][aria-label="Read Texts"]')?.getAttribute('aria-checked') ?? null,
    };
  });
  const page = async (seen) => {
    stub.hosts = host(true).map((h) => ({ ...h, last_seen_at: seen }));
    await open(`${base}/`);
    await until(async () => (await ev(() => !!document.querySelector('button[aria-label^="Open account menu"]') && document.querySelector('.computer-state')?.textContent === 'Asleep')), 30000, 'the live page with its computer').catch(() => {});
    await wait(300);
    await settings(); await tab('Computer');
    return read();
  };

  // Last heard from 2 hours ago.
  const two = await page(new Date(Date.now() - 2 * 3600_000).toISOString());
  precondition('Settings opened on the live page and its Computer tab is up', two.head === 'Computer', two);
  check("Settings > Computer on the live page says when Barkpark last heard from the computer: last_seen_at 2 hours ago reads 'Computer · Last opened 2 hours ago', never the capture's 13 minutes", two.device === 'Computer · Last opened 2 hours ago', two);

  // A flipped switch stays flipped when its page is left and opened again.
  const before = two.readTexts;
  await clickOn('.overlay [role=switch][aria-label="Read Texts"]');
  const flipped = (await read()).readTexts;
  await tab('Updates');
  const updates = await read();
  await tab('Computer');
  const back = (await read()).readTexts;
  check('a switch flipped on one Settings page is still flipped after another tab and back (control: Read Texts was off and the click turned it on)', before === 'false' && flipped === 'true' && back === 'true', { before, flipped, back });

  // Updates shows this build, and claims nothing it cannot know.
  let build = null;
  try { build = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
  check("Settings > Updates on the live page shows the app's own build as its version (the short commit it runs from), not Grok's 1.2.3, and does not say \"You're up to date\" (nothing checks)", updates.head === 'Updates' && build !== null && updates.version === build && !/up to date/i.test(updates.status ?? ''), { ...updates, build });

  // A computer Barkpark never heard from: no time is made up.
  const never = await page(null);
  check("Settings > Computer with no last_seen_at shows a placeholder after 'Computer ·', no time (control: the same page said 2 hours above)", never.head === 'Computer' && never.device === 'Computer ·' && two.device !== never.device, never);

  stub.hosts = host(true);
}
