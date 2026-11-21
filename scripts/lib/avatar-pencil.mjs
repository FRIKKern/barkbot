// The avatar's pencil stays lit while the avatar editor is open (oracle-edit-avatar: the pencil
// draws with the pointer away from the face). On the live page the editor opens by a click on
// Edit Bot avatar, so the lit pencil must follow the open editor, not only a scene's overlay
// (Shell passes Details the overlay a click opened: `opened ?? scene.overlay`).
// Control: with the pointer away and no editor, the pencil is not drawn.
// The page is the oracle scene (/gate/oracle-turn-1040): the real Shell, the panel open.
export async function avatarPencil({ check, precondition, ev, open, base, click, wait, until, windowFocus, page }) {
  const look = () => ev(() => {
    const icon = document.querySelector('.who-face .who-pencil .icon');
    return {
      pencil: icon ? getComputedStyle(icon).opacity : null,
      editor: !!document.querySelector(".overlay[data-overlay='edit-avatar']"),
      hovered: !!document.querySelector('.who-face:hover'),
    };
  });
  const away = async () => { await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }); await wait(300); };

  await open(`${base}/gate/oracle-turn-1040`); await windowFocus(true);
  const face = () => ev(() => { const e = document.querySelector('button[aria-label="Edit Bot avatar"]'); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await until(async () => !!(await face()), 15000, 'the oracle scene').catch(() => {});
  await away();
  const before = await look();
  precondition('the oracle scene is up with the panel open: the avatar is there, no editor, the pointer away', before.pencil !== null && !before.editor && !before.hovered, before);
  check('control: with the pointer away and no editor open, the avatar pencil is not drawn', before.pencil === '0', before);

  await click(...(await face()));
  await wait(300);
  await away();
  const after = await look();
  check('a click on Edit Bot avatar opens the editor, and the pencil stays lit with the pointer away (oracle-edit-avatar)', after.editor && !after.hovered && after.pencil === '1', after);
}
