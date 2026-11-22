// Settings shows the live page's own facts, not the capture's (task-e222689d60f2564b): Computer
// says when Barkpark last heard from the bot's computer (its last_seen_at), Updates says the app's
// own build, and a flipped switch stays flipped across a tab change. Before this, the page read
// "Last opened 13 minutes ago" and "Version 1.2.3" whatever the computer and build were.
// The live page (/) against the stand-in Barkpark; Settings is opened from the account menu.
import { PINNED_VERSION } from './pinned-version.mjs';

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
  // The app runs with BARKBOT_VERSION pinned (behaviour.mjs), so the page must show that value.
  const build = PINNED_VERSION;
  check("Settings > Updates on the live page shows the app's own build as its version (BARKBOT_VERSION, pinned here to 0000000), not Grok's 1.2.3, and does not say \"You're up to date\" (nothing checks)", updates.head === 'Updates' && updates.version === build && !/up to date/i.test(updates.status ?? ''), { ...updates, build });

  // A computer Barkpark never heard from: no time is made up.
  const never = await page(null);
  check("Settings > Computer with no last_seen_at shows a placeholder after 'Computer ·', no time (control: the same page said 2 hours above)", never.head === 'Computer' && never.device === 'Computer ·' && two.device !== never.device, never);

  // The computer comes back while Settings is open: "Last opened" follows Barkpark's last_seen_at
  // with no reload (the page asks every 5 s), not the time the page loaded with.
  stub.hosts = host(false).map((h) => ({ ...h, last_seen_at: new Date(Date.now() - 3 * 3600_000).toISOString() }));
  await open(`${base}/`);
  await until(async () => (await ev(() => !!document.querySelector('button[aria-label^="Open account menu"]') && document.querySelector('.computer-state')?.textContent === 'Unreachable')), 30000, 'the live page with its computer off').catch(() => {});
  await wait(300);
  await settings(); await tab('Computer');
  const stale = await read();
  precondition('Settings > Computer opened with the computer off, last heard from 3 hours ago', stale.head === 'Computer' && stale.device === 'Computer · Last opened 3 hours ago', stale);
  stub.hosts = host(true).map((h) => ({ ...h, last_seen_at: new Date().toISOString() }));
  await until(async () => (await read()).device === 'Computer · Last opened 1 minute ago', 15000, 'Settings to follow the computer').catch(() => {});
  const fresh = { ...(await read()), state: await ev(() => document.querySelector('.computer-state')?.textContent ?? null) };
  check("the computer comes back while Settings is open (last_seen_at 3 hours ago, then now): within 15 s and with no reload, Settings > Computer reads 'Computer · Last opened 1 minute ago' (control: it read 3 hours before, and the header now says Asleep)", fresh.head === 'Computer' && fresh.device === 'Computer · Last opened 1 minute ago' && fresh.state === 'Asleep', { stale, fresh });

  stub.hosts = host(true);
}
