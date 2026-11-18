// A Create whose record write gets no answer (task-acd834992251353b; rev81 on #191). The write may
// have landed, so the dialog keeps that bot's id and its next Create finishes that same bot. Before,
// that Create minted a second id, and the first record stayed in Barkpark, never listed. The
// stand-in drops the write's answer (`dropPut`) once after the write lands, and once before.
export async function createLost({ check, stub, ids, live, until, wait, key, openDialog, typeName, press, failLine, dialog }) {
  const named = (n) => [...stub.prefs].filter(([k, v]) => k.startsWith('barkbot.bot.') && v?.name === n).map(([k]) => k.slice('barkbot.bot.'.length));
  const putIds = (w) => stub.writes.slice(w).filter((x) => x.method === 'PUT' && x.key.startsWith('barkbot.bot.')).map((x) => x.key.slice('barkbot.bot.'.length));
  for (const [when, name] of [['after', 'Lost'], ['before', 'Unsent']]) {
    const w = stub.writes.length;
    stub.dropPut = when;
    await openDialog(); await typeName(name); await press('Create');
    await until(async () => (await failLine()) !== null || !(await dialog()), 10000, `${name}'s first Create to answer`).catch(() => {}); await wait(300);
    const first = { line: await failLine(), open: await dialog(), records: named(name), listed: ids().filter((id) => named(name).includes(id)) };
    stub.dropPut = null;
    await press('Create');
    await until(async () => !(await dialog()), 10000, `${name}'s second Create`).catch(() => {});
    await until(async () => (await live()).header === name, 10000, `${name} to open`).catch(() => {}); await wait(300);
    const out = { first, puts: putIds(w), records: named(name), listed: ids().filter((id) => named(name).includes(id)), header: (await live()).header, open: await dialog() };
    if (out.open) { await key('Escape'); await wait(200); }
    const one = out.records.length === 1 ? out.records[0] : null;
    check(`a Create whose record write gets no answer (${when === 'after' ? 'the write landed' : 'it never landed'}): the dialog says the bot may already be saved and stays open; Create again finishes that same bot, one record, listed once and opened, none left off the list`,
      first.open && /may already be saved/.test(first.line ?? '') && !/not made/.test(first.line ?? '') && first.listed.length === 0 && one !== null && out.puts.length === 2 && out.puts.every((id) => id === one) && out.listed.join() === one && out.header === name && !out.open, out);
  }
}
