// Only BarkBot's own conversations open (task-26a1a137b955ef3b). The owner's token can open any
// session id, so every door that takes one asks app/src/server/own-session.ts first: a registered-host
// session on one of the caller's own computers, that a bot record names or this server made. Anything
// else is a stranger's: the routes answer 404 with none of its bytes, and the server functions send,
// store and answer nothing. A read that fails is a no too.
// Run inside the stand-in's open conversation (behaviour.mjs, after openFiles): `session` is in the
// Main Bot's record, and `noteId` is stored for it.

export async function ownSessionDoors({ check, precondition, ev, base, stub, session, hostId, otherHost, note, noteId, rec }) {
  const MATE = '00000000-0000-4000-8000-000000000771'; // a workspace-mate's, on our computer, in no record
  const ELSEWHERE = '00000000-0000-4000-8000-000000000772'; // on a computer that is not ours
  const MANAGED = '00000000-0000-4000-8000-000000000773';
  const KEPT = '00000000-0000-4000-8000-000000000774'; // in a bot record, never opened by this server
  const KEPT_BOT = '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d';
  const on = (id, h) => ({ id, execution_target: 'registered_host', execution_host_id: h, inserted_at: '2026-11-13T10:00:00Z', status: 'active' });
  const SECRET = 'words only its owner may read';
  const plant = (id) => { stub.pictures.set(`${id}/${noteId}`, { data: note.toString('base64'), media_type: 'text/plain' }); stub.rowsBy.set(id, [{ seq: 1, role: 'user', source_markdown: SECRET }]); };
  stub.sessions.push(on(MATE, hostId), on(ELSEWHERE, otherHost), { ...on(MANAGED, null), execution_target: 'managed' }, on(KEPT, hostId));
  [session, MATE, ELSEWHERE, MANAGED, KEPT].forEach(plant);

  // A route as a tab or EventSource reads it: the status and what came back (a stream's first chunk).
  const hit = async (u) => {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 5000);
    try {
      const r = await fetch(`${base}${u}`, { signal: ac.signal, headers: { accept: '*/*' } });
      let text = '';
      if ((r.headers.get('content-type') ?? '').includes('event-stream')) {
        const rd = r.body.getReader();
        for (let i = 0; i < 4 && !text.includes(SECRET); i++) { const { value, done } = await rd.read(); if (done) break; text += Buffer.from(value).toString(); }
        ac.abort();
      } else text = await r.text();
      return { status: r.status, text: text.slice(0, 200) };
    } catch (e) { return { status: 0, text: String(e).slice(0, 200) }; } finally { clearTimeout(t); }
  };
  const file = (id) => hit(`/api/chat/${id}/attachments/${noteId}?name=note.txt`);
  const stream = (id) => hit(`/api/chat/${id}/events`);
  const leaks = (x) => x.text.includes(note.toString()) || x.text.includes(SECRET);
  const refused = (x) => x.status === 404 && !leaks(x);
  // The four server functions, called as the page calls them, with this id.
  const doors = (id) => ev(async (sid) => {
    const m = await import('/src/chat/api.ts'); const out = {};
    const calls = { send: () => m.sendMessage({ data: { id: sid, content: 'to a stranger' } }), upload: () => m.uploadAttachment({ data: { id: sid, data: 'aGk=' } }), approve: () => m.answerApproval({ data: { id: sid, requestId: 'r1', decision: 'allow' } }), choose: () => m.answerQuestion({ data: { id: sid, requestId: 'r1', answers: { q: 'a' } } }) };
    for (const [k, f] of Object.entries(calls)) { try { out[k] = await f(); } catch (e) { out[k] = { threw: String(e?.message ?? e) } } }
    return out;
  }, id);
  const reached = () => ({ to: stub.to.length, sent: stub.sent.length, uploads: stub.uploads.length, answers: stub.answers.length, choices: stub.choices.length });
  const noneOf = (out) => /could not be checked/.test(out.send?.failed ?? '') && /could not be checked/.test(out.upload?.refused ?? '') && /could not be checked/.test(out.approve?.threw ?? '') && /could not be checked/.test(out.choose?.threw ?? '');

  const own = { file: await file(session), stream: await stream(session) };
  precondition('the open conversation, one of our own: its file and its stream come back (the routes work here)', own.file.status === 200 && own.file.text === note.toString() && own.stream.status === 200 && own.stream.text.includes(SECRET), own);

  // The first failing test: Barkpark lists every computer of the workspace, and a workspace-mate can
  // make a conversation on ours. It is on our computer, but no bot record names it and this server
  // did not make it.
  const r0 = reached(), o0 = stub.opened.length;
  const mate = { file: await file(MATE), stream: await stream(MATE), doors: await doors(MATE) };
  mate.reached = reached(); mate.opened = stub.opened.slice(o0);
  check("a workspace-mate's conversation on our computer, named by no bot record and not made here: its file and its stream answer 404 with none of its bytes, and the four server functions send, store and answer nothing", refused(mate.file) && refused(mate.stream) && !mate.opened.includes(MATE) && noneOf(mate.doors) && JSON.stringify(mate.reached) === JSON.stringify(r0), { mate, r0 });

  const away = { file: await file(ELSEWHERE), stream: await stream(ELSEWHERE) };
  check('a conversation on a computer that is not ours: its file and its stream answer 404 with none of its bytes', refused(away.file) && refused(away.stream) && !stub.opened.includes(ELSEWHERE), away);
  const managed = { file: await file(MANAGED), stream: await stream(MANAGED) };
  check('a managed conversation (not on a computer): its file and its stream answer 404 with none of its bytes', refused(managed.file) && refused(managed.stream) && !stub.opened.includes(MANAGED), managed);

  // Fail closed: when Barkpark cannot list our computers, even our own conversation is not opened.
  stub.failHosts = true;
  const r1 = reached();
  const blind = { file: await file(session), stream: await stream(session), doors: await doors(session) };
  blind.reached = reached();
  stub.failHosts = false;
  const back = await file(session);
  check('when the computers cannot be read, our own conversation answers 404 with none of its bytes and the four server functions do nothing; once they can, its file comes back (control)', refused(blind.file) && refused(blind.stream) && noneOf(blind.doors) && JSON.stringify(blind.reached) === JSON.stringify(r1) && back.status === 200 && back.text === note.toString(), { blind, r1, back });

  // A conversation a bot record names, which this server never opened: when its own read fails it is
  // not opened; when it works, it is (the record is what makes it ours).
  const ids = stub.prefs.get('barkbot.bots')?.ids ?? [];
  stub.prefs.set(`barkbot.bot.${KEPT_BOT}`, rec('Kept', hostId, KEPT)); stub.prefs.set('barkbot.bots', { ids: [...ids, KEPT_BOT] });
  stub.failShow.set(KEPT, 500);
  const unread = await file(KEPT);
  stub.failShow.delete(KEPT);
  const read = { file: await file(KEPT), stream: await stream(KEPT) };
  stub.prefs.delete(`barkbot.bot.${KEPT_BOT}`); stub.prefs.set('barkbot.bots', { ids });
  check("a conversation a bot record names: when Barkpark's read of it fails it answers 404 with none of its bytes; when the read works, its file and its stream come back", refused(unread) && read.file.status === 200 && read.file.text === note.toString() && read.stream.status === 200 && read.stream.text.includes(SECRET), { unread, read });

  // The control: a conversation this server made whose bot record was not saved (startChat's
  // kept: false, here a bot with no record) still opens: the page keeps it and streams it.
  const made = await ev(async ([h, b]) => { const m = await import('/src/chat/api.ts'); try { return await m.startChat({ data: { hostId: h, botId: b } }); } catch (e) { return { threw: String(e?.message ?? e) }; } }, [hostId, '7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e']);
  if (made?.sessionId) plant(made.sessionId);
  const fresh = made?.sessionId ? { file: await file(made.sessionId), stream: await stream(made.sessionId) } : null;
  check('control: a conversation this server made whose bot record was not saved (kept: false) still opens: its file and its stream come back', made?.kept === false && fresh?.file.status === 200 && fresh.file.text === note.toString() && fresh.stream.status === 200 && fresh.stream.text.includes(SECRET), { made, fresh });

  for (const id of [MATE, ELSEWHERE, MANAGED, KEPT, made?.sessionId]) if (id) { stub.pictures.delete(`${id}/${noteId}`); stub.rowsBy.delete(id); }
  stub.rowsBy.delete(session);
  stub.sessions = stub.sessions.filter((x) => ![MATE, ELSEWHERE, MANAGED, KEPT, made?.sessionId].includes(x.id));
}
