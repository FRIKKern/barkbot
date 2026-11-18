// A bot's record is made only where none is (Barkpark's If-None-Match: *, docs/contracts/user-prefs.md;
// task-c1f9452e1b8216ee). Create and the Main Bot's move-in each read the key as unset and then PUT
// it whole, so a record another tab or device made in between was written over. Here the stand-in
// makes that record just before the PUT lands (`madeBeforePut`); it is kept, never written over.
import { rmSync, writeFileSync } from 'node:fs';

export async function createOnce({ check, ev, stub, freshStore, showing, alertLine, rec, session, ids, botPuts, HOST_ID, S1, KEY, MINT }) {
  check('every bot record BarkBot has written so far was a create: its PUT carried If-None-Match: *', botPuts().length > 0 && botPuts().every((w) => w.inm === '*'), botPuts().map((w) => ({ key: w.key, inm: w.inm })));

  const A = 'abcdef12-1111-4111-8111-111111111111', C = '0badc0de-3333-4333-8333-333333333333', CKEY = `barkbot.bot.${C}`;
  const first = rec('First', HOST_ID, null);
  const make = async (seed = () => {}) => {
    writeFileSync(MINT, C);
    freshStore(); stub.prefs.set('barkbot.bots', { ids: [A] }); stub.prefs.set(`barkbot.bot.${A}`, rec('Ada', HOST_ID, null)); seed(); const w = stub.writes.length;
    const out = await ev(async () => { const m = await import('/src/chat/api.ts'); try { return { id: (await m.createBot({ data: { name: 'Twin' } })).id }; } catch (e) { return { refused: String(e?.message ?? e) }; } });
    return { ...out, ids: ids(), record: stub.prefs.get(CKEY) ?? null, writes: stub.writes.slice(w).map((x) => `${x.method} ${x.key}${x.inm ? ` (If-None-Match: ${x.inm})` : ''}`) };
  };
  let t = await make();
  check('control: Create makes its bot with one PUT that carries If-None-Match: *, then the add', t.id === C && t.record?.name === 'Twin' && t.ids.join() === [A, C].join() && t.writes.join() === [`PUT ${CKEY} (If-None-Match: *)`, 'PATCH barkbot.bots'].join(), t);
  t = await make(() => (stub.madeBeforePut = { key: CKEY, value: first }));
  stub.madeBeforePut = null;
  check("Create whose new id's record another writer made just before its write: Barkpark refuses it (412), the other record is kept as it was, no id is added, nothing is removed, and the refusal says so in one plain line", t.id === undefined && /saved under its new id first/.test(t.refused ?? '') && /nothing was written over it/.test(t.refused ?? '') && JSON.stringify(t.record) === JSON.stringify(first) && t.ids.join() === A && t.writes.join() === `PUT ${CKEY} (If-None-Match: *)`, t);
  rmSync(MINT, { force: true });

  // The move-in: the Main Bot's record made by another tab between this load's read and its write.
  // Barkpark refuses the write (412); the load reads the key again, and a whole Main Bot there is
  // this user's own, from another load doing the same: kept as it is, its id added, shown, with no
  // line (task-cd587179698fa0d8). Nothing is written over it.
  const other = rec('Other Tab', HOST_ID, null);
  freshStore({ name: 'Legacy Name' }); stub.sessions = [session(S1)];
  stub.madeBeforePut = { key: KEY, value: other };
  let w = stub.writes.length;
  let s = await showing('Other Tab');
  const raced = { header: s.header, alert: await alertLine(), record: stub.prefs.get(KEY) ?? null, ids: [...ids()], writes: stub.writes.slice(w).map((x) => `${x.method} ${x.key}`) };
  stub.madeBeforePut = null;
  check("the Main Bot's move-in whose record another tab made just before its write: that record is kept as it was, its id is added, and the page shows it with no line", JSON.stringify(raced.record) === JSON.stringify(other) && raced.ids.join() === KEY.slice('barkbot.bot.'.length) && raced.writes.join() === [`PUT ${KEY}`, 'PATCH barkbot.bots'].join() && raced.header === 'Other Tab' && raced.alert === null, raced);
  w = stub.writes.length;
  s = await showing('Other Tab');
  const next = { header: s.header, alert: await alertLine(), ids: [...ids()], writes: stub.writes.slice(w).map((x) => `${x.method} ${x.key}`) };
  check('… and the next load shows that record as it is, with no write', next.header === 'Other Tab' && next.ids.join() === KEY.slice('barkbot.bot.'.length) && next.writes.length === 0 && next.alert === null, next);
  // What another writer made there is not a whole Main Bot of this computer: kept, not listed, and
  // the page says it was saved elsewhere (not that it could not be saved).
  const odd = rec('Odd', '00000000-0000-4000-8000-00000000dead', null);
  freshStore({ name: 'Legacy Name' }); stub.sessions = [session(S1)];
  stub.madeBeforePut = { key: KEY, value: odd };
  w = stub.writes.length;
  s = await showing('Legacy Name');
  const foreign = { header: s.header, alert: await alertLine(), record: stub.prefs.get(KEY) ?? null, ids: [...ids()], writes: stub.writes.slice(w).map((x) => `${x.method} ${x.key}`) };
  stub.madeBeforePut = null;
  check("the Main Bot's move-in whose key another writer filled with a record that is not a whole Main Bot of this computer: that record is kept, no id is added, and the page says it was saved from another tab or device", JSON.stringify(foreign.record) === JSON.stringify(odd) && foreign.ids.length === 0 && foreign.writes.join() === `PUT ${KEY}` && /another tab or device/.test(foreign.alert ?? '') && !/could not be saved/.test(foreign.alert ?? ''), foreign);
  freshStore();
}
