// The live rail marks the Main Bot as the gate scenes do (app/src/gate/scenes/oracle.ts: a bot with
// main: true) and as Grok's rail is drawn: alone in the main slot at the top, with the Main Bot
// badge and ", Main Bot" in its name, and not among Pinned Bots (task-b04631fa0d533e9a). Before,
// loadChat gave the page only {id, name}, so no bot was ever main: the Main Bot sat last among
// Pinned Bots, unbadged. Read on the live page as it stands: `mainName` is the Main Bot's name,
// `pinned` the made bots in list order, `open` the one whose page it is.
export async function railMain({ check, ev, mainName, pinned, open }) {
  const rail = await ev(() => {
    const label = (t) => t.getAttribute('aria-label');
    const slot = [...document.querySelectorAll('.rail-main .rail-tile')];
    return {
      slot: slot.map(label),
      badge: slot.map((t) => !!t.querySelector('.badge[role="img"][aria-label="Main Bot"]') && !!t.querySelector('.face-main')),
      pinned: [...document.querySelectorAll('.rail-list[aria-label="Pinned Bots"] .rail-tile')].map(label),
      order: [...document.querySelectorAll('.rail .rail-tile:not(.rail-me)')].map(label),
      current: document.querySelector('.rail [aria-current="page"]') ? label(document.querySelector('.rail [aria-current="page"]')) : null,
    };
  });
  const want = `${mainName}, Main Bot`;
  check(`the live rail shows the Main Bot alone in the main slot, first, with the Main Bot badge and label, and only the made bots among Pinned Bots (control: ${open}'s tile is the open one)`,
    JSON.stringify(rail.slot) === JSON.stringify([want]) && rail.badge[0] === true &&
    JSON.stringify(rail.pinned) === JSON.stringify(pinned) &&
    JSON.stringify(rail.order) === JSON.stringify([want, ...pinned]) &&
    rail.current === open, rail);
}
