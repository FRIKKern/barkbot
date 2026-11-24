// The picture viewer (A2, task-a58919378f43975d): a press on a message's picture tile opens our
// viewer at that picture, never a new tab; the +3 tile opens the third (oracle-picture-viewer-rest:
// "3 / 5"); the strip reaches the fourth and fifth; Download saves the picture by our route under
// its name; Escape and Back to chat close it and give focus back to the tile.
// Run on the live page against the stand-in Barkpark (behaviour.mjs, after openFiles): a stored row
// with five pictures, each named as it was sent.
import { createHash } from 'node:crypto';

const NAMES = ['one.png', 'two.png', 'three.png', 'four.png', 'five.png'];

export async function pictureViewer({ check, precondition, ev, open, base, until, key, stub, click, session, page }) {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  // Five ids for one picture's bytes: the stand-in serves by id, and the viewer tells them apart by id.
  const ids = NAMES.map((n) => createHash('sha256').update(`viewer ${n}`).digest('hex'));
  ids.forEach((id) => stub.pictures.set(`${session}/${id}`, { data: PNG.toString('base64'), media_type: 'image/png' }));
  const route = (id) => `/api/chat/${session}/attachments/${id}`;
  stub.rows = [{ seq: 1, role: 'user', source_markdown: 'five pictures', attachments: ids.map((id, i) => ({ id, media_type: 'image/png', byte_size: PNG.length, url: `/v1/chat/sessions/${session}/attachments/${id}`, name: NAMES[i] })) }];
  await open(`${base}/`);
  const tiles = () => ev(() => [...document.querySelectorAll('.turn-attached .picture-tiles .tile-open')].map((t) => { const r = t.getBoundingClientRect(); return { label: t.getAttribute('aria-label'), at: [r.x + r.width / 2, r.y + r.height / 2] }; }));
  await until(async () => (await tiles()).length === 3, 30000, 'the three tiles').catch(() => {});
  const t = await tiles();
  precondition('the stored row shows three tiles, the third standing for three more', t.length === 3 && t[2].label === 'Open the remaining 3 images full screen', { t });

  // What is open: the dialog's pill, line, picture and strip, where focus is, and the main composer.
  const seen = () => ev(() => {
    const d = document.querySelector('[role=dialog].viewer');
    const tile = [...document.querySelectorAll('.turn-attached .picture-tiles .tile-open')].indexOf(document.activeElement);
    const main = document.querySelector('.convo > .composer-wrap');
    if (!d) return { open: false, tile, main: main && getComputedStyle(main).visibility };
    return {
      open: true,
      pill: d.querySelector('.viewer-pill')?.textContent,
      line: d.querySelector('.viewer-caption')?.textContent,
      group: d.querySelector('[role=group].viewer-media')?.getAttribute('aria-label'),
      img: d.querySelector('.viewer-stage img')?.getAttribute('src'),
      strip: [...d.querySelectorAll('.viewer-thumb')].map((b) => [b.getAttribute('aria-label'), b.getAttribute('aria-current')]),
      about: d.querySelector('.viewer-compose')?.getAttribute('aria-label'),
      focus: d.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null,
      main: main && getComputedStyle(main).visibility,
      tile,
    };
  });
  const press = async (label) => { const at = await ev((l) => { const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.getAttribute('aria-label') === l)?.getBoundingClientRect(); return b ? [b.x + b.width / 2, b.y + b.height / 2] : null; }, label); if (at) await click(...at); return !!at; };
  await ev(() => { window.__opened = []; window.open = (...a) => { window.__opened.push(a); return null; }; window.__saved = []; const c = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { window.__saved.push([this.getAttribute('href'), this.download]); if (!this.download) c.call(this); }; });

  await click(...t[1].at);
  await until(async () => (await seen()).open, 3000, 'the viewer').catch(() => {});
  let v = await seen();
  const opened = await ev(() => window.__opened);
  check('a press on the second tile opens our viewer at the second picture, never a new tab: its name in the pill, "two.png · 2 / 5", our route\'s picture, five in the strip with the second current, the composer about it focused, the main composer hidden (a new tab before)',
    v.open && opened.length === 0 && v.pill === 'two.png' && v.line === 'two.png · 2 / 5' && v.group === 'Media 2 of 5' && v.img === route(ids[1]) && v.strip.length === 5 && v.strip.every(([l, c], i) => l === `View media ${i + 1} of 5` && c === (i === 1 ? 'true' : null)) && v.about === 'Message about “two.png”' && v.focus === 'Prompt' && v.main === 'hidden', { v, opened });
  const wasOpen = v.open;
  await press('Download media');
  const saved = await ev(() => window.__saved);
  check('Download saves the picture shown by our route, under its name', saved.length === 1 && saved[0][0] === route(ids[1]) && saved[0][1] === 'two.png', { saved });
  // Modal (task-6d4a57e47671881c): Tab and Shift+Tab never leave it, and the page behind is inert.
  const tab = async (shift) => {
    const m = shift ? 8 : 0;
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: m });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: m });
    await new Promise((ok) => setTimeout(ok, 20));
  };
  const where = () => ev(() => { const a = document.activeElement; return { inside: !!document.querySelector('[role=dialog].viewer')?.contains(a), at: a?.getAttribute('aria-label') ?? a?.className ?? a?.tagName }; });
  const behind = () => ev(() => ['.rail', '.convo', '.details'].map((q) => !!document.querySelector(q)?.closest('[inert]')));
  const walk = [];
  for (const shift of [false, true]) for (let i = 0; i < 20; i++) { await tab(shift); walk.push({ shift, ...(await where()) }); }
  const inertOpen = await behind();
  const reached = new Set(walk.map((w) => w.at));
  check('Tab and Shift+Tab never leave the open viewer: 20 presses each way stay on its own controls and go round them (Back to chat and the strip reached), and the rail, the conversation and the panel behind are inert', walk.every((w) => w.inside) && reached.has('Back to chat') && reached.has('View media 1 of 5') && reached.has('View media 5 of 5') && inertOpen.every(Boolean), { walk, inertOpen });
  // The viewer's composer menu: Escape closes the menu alone.
  const menu = () => ev(() => !!document.querySelector('[role=menu][aria-label="Composer actions"]'));
  await press('Composer actions');
  await until(menu, 3000, 'the composer menu').catch(() => {});
  const menuUp = await menu();
  await key('Escape');
  const afterMenu = { menu: await menu(), ...(await seen()) };
  check('Escape with the viewer\'s composer menu open closes only the menu: the viewer stays open with focus in it (control: the menu was up)', menuUp && !afterMenu.menu && afterMenu.open && afterMenu.focus !== null, { menuUp, afterMenu });
  await key('Escape');
  v = await seen();
  check('Escape closes the viewer: focus is back on the tile pressed and the main composer shows again', wasOpen && !v.open && v.tile === 1 && v.main === 'visible', { v });
  const inertShut = await behind();
  check('once the viewer is closed the rail and the conversation are not inert (the closed panel stays inert on its own)', !inertShut[0] && !inertShut[1], { inertShut });

  await click(...t[2].at);
  await until(async () => (await seen()).open, 3000, 'the viewer').catch(() => {});
  v = await seen();
  check('the +3 tile opens the viewer at the third picture, the first it stands for ("three.png · 3 / 5")', v.open && v.pill === 'three.png' && v.line === 'three.png · 3 / 5' && v.img === route(ids[2]) && v.strip[2]?.[1] === 'true', { v });
  const strip = [];
  for (const n of [4, 5]) { await press(`View media ${n} of 5`); strip.push(await seen()); }
  check('the strip reaches the fourth and the fifth picture: each press shows that picture, its name and place, and makes it the current one', strip.every((s, j) => s.open && s.pill === NAMES[3 + j] && s.line === `${NAMES[3 + j]} · ${4 + j} / 5` && s.img === route(ids[3 + j]) && s.strip.filter(([, c]) => c === 'true').length === 1 && s.strip[3 + j][1] === 'true'), { strip });
  const pressed = await press('Back to chat');
  v = await seen();
  check('Back to chat closes the viewer, and focus is back on the +3 tile', pressed && !v.open && v.tile === 2 && v.main === 'visible', { v });

  stub.rows = [];
  ids.forEach((id) => stub.pictures.delete(`${session}/${id}`));
}
