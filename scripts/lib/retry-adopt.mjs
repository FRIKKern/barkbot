// A Create retry adopts, on a 412, only a record that is a whole bot on this computer
// (task-25fe29f920347276; rev81 on #200, mutant RB). The dialog sends as `retry` only an id Create
// gave it, but the server function takes any: a crafted retry whose id holds an unlisted record
// from another computer, or a malformed one, is refused TAKEN, with that record kept and nothing
// listed. Control: the same retry on an unlisted record of this computer is adopted, so the 412
// path is reached.
export async function retryAdopt({ check, stub, ev, ids, freshStore, rec, HOST_ID }) {
  const A = 'abcdef12-1111-4111-8111-111111111111';
  const OTHER_HOST = '00ddba11-0000-4000-8000-00000000c0de'; // no computer of this user's
  const cases = {
    mine: ['5eed0001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', rec('Mine', HOST_ID, null)],
    elsewhere: ['5eed0002-bbbb-4bbb-8bbb-bbbbbbbbbbbb', rec('Elsewhere', OTHER_HOST, null)],
    malformed: ['5eed0003-cccc-4ccc-8ccc-cccccccccccc', { name: 42, host_id: HOST_ID }],
  };
  const out = {};
  for (const [which, [id, record]] of Object.entries(cases)) {
    freshStore(); stub.prefs.set('barkbot.bots', { ids: [A] }); stub.prefs.set(`barkbot.bot.${A}`, rec('Ada', HOST_ID, null)); stub.prefs.set(`barkbot.bot.${id}`, record);
    const w = stub.writes.length;
    const got = await ev(async (retry) => { const m = await import('/src/chat/api.ts'); try { return { made: await m.createBot({ data: { name: 'Crafted', retry } }) }; } catch (e) { return { refused: String(e?.message ?? e) }; } }, id);
    out[which] = { ...got, ids: ids(), kept: JSON.stringify(stub.prefs.get(`barkbot.bot.${id}`)) === JSON.stringify(record), puts: stub.writes.slice(w).filter((x) => x.method === 'PUT').map((x) => x.key) };
  }
  const refusedTaken = (o) => /another bot was saved under its new id first/.test(o.refused ?? '') && !o.made && o.ids.join() === A && o.kept;
  check('control: a Create retry whose id holds an unlisted record of a bot on this computer adopts it: that id is listed, the record not written over', out.mine.made?.id === cases.mine[0] && out.mine.ids.join() === [A, cases.mine[0]].join() && out.mine.kept, out.mine);
  check('a Create retry whose id holds an unlisted record from another computer, or a malformed one, is refused (another bot was saved under its id), the record kept and nothing listed', refusedTaken(out.elsewhere) && refusedTaken(out.malformed), { elsewhere: out.elsewhere, malformed: out.malformed });
  freshStore();
}
