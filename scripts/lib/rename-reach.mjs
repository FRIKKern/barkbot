// Home's own save path for a rename (app/src/routes/index.tsx, `rename`), reached past the panel.
// Shell hands Home a rename only when no pick is loading (Shell.tsx `if (between) return`), so the
// panel can never ask Home to name another bot, and Home's own check (`id !== chat.botId`) was
// unreachable: removing it turned no rule red (task-42a9dd8ec9408de2, rev63's mutant #105 on #90).
// Here the page calls the handler Shell was given, as Shell would if its own check went, and the
// stand-in Barkpark counts what is written. The control call, for the open bot, shows the reach is live.
export async function renameReach({ check, ev, open, live, until, wait, stub, base, nameIn, freshStore, host, rec, HOST_ID }) {
  const UMA = '8c9d0e1f-2a3b-4c4d-8e5f-6a7b8c9d0e1f', VAL = '9d0e1f2a-3b4c-4d5e-9f6a-7b8c9d0e1f2a';
  stub.hosts = host(true); stub.sessions = []; freshStore(); stub.prefs.set('barkbot.bots', { ids: [UMA, VAL] });
  stub.prefs.set(`barkbot.bot.${UMA}`, rec('Uma', HOST_ID, null)); stub.prefs.set(`barkbot.bot.${VAL}`, rec('Val', HOST_ID, null));
  await open(`${base}/?bot=${UMA}`); await until(async () => (await live()).header === 'Uma', 15000, "Uma's page").catch(() => {}); await wait(500);
  // The rename handler Shell holds: the props of the component that draws `.app`, found up its fiber.
  const call = (id, n) => ev(([id, n]) => {
    const a = document.querySelector('.app');
    let f = a?.[Object.keys(a).find((k) => k.startsWith('__reactFiber$'))];
    while (f && typeof f.memoizedProps?.onRenameBot !== 'function') f = f.return;
    if (!f) return 'no handler';
    return Promise.resolve(f.memoizedProps.onRenameBot(id, n)).then(() => 'called', (e) => `threw ${e?.message ?? e}`);
  }, [id, n]);
  const nameOf = (id) => stub.prefs.get(`barkbot.bot.${id}`)?.name;
  const written = (w0, n) => stub.writes.slice(w0).filter((w) => nameIn(w) === n).map((w) => w.key.slice('barkbot.bot.'.length));
  // Asked to name Val while Uma's page is open: nothing is written, to either record.
  let w0 = stub.writes.length;
  const wrong = { call: await call(VAL, 'Wex') };
  await wait(1500);
  Object.assign(wrong, { wrote: written(w0, 'Wex'), uma: nameOf(UMA), val: nameOf(VAL), header: (await live()).header });
  // Control: the same call for the open bot renames it, once.
  w0 = stub.writes.length;
  const own = { call: await call(UMA, 'Ume') };
  await until(() => written(w0, 'Ume').length > 0, 5000, 'the rename').catch(() => {}); await wait(300);
  Object.assign(own, { wrote: written(w0, 'Ume'), uma: nameOf(UMA), val: nameOf(VAL) });
  check("Home's save path names only the open bot: asked, past the panel, to name another bot while one is open, it writes nothing to either record (control: the same call for the open bot writes once, to it)",
    wrong.call === 'called' && wrong.wrote.length === 0 && wrong.uma === 'Uma' && wrong.val === 'Val' && wrong.header === 'Uma' &&
    own.call === 'called' && JSON.stringify(own.wrote) === JSON.stringify([UMA]) && own.uma === 'Ume' && own.val === 'Val', { wrong, own });
}
