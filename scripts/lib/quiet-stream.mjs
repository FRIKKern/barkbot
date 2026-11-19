// The first message on a conversation Barkpark holds no rows for yet (task-7ec7bb04a1125c4d).
// Barkpark answers its event stream with the headers at once and sends the first body bytes only
// with a keepalive 30 s later; the stand-in's `quiet` does the same. The app's stream must open
// when Barkpark's headers arrive, not at its first body byte, or the first message gives up at
// OPEN_MS (10 s) and is never sent (seen live on the VM, V1, 2026-11-19).
export async function quietStream({ check, stub, ev, page, live, until, wait, key, openDialog, typeName, press }) {
  await openDialog(); await typeName('Quill'); await press('Create');
  await until(async () => (await live()).header === 'Quill', 10000, 'Quill to open').catch(() => {}); await wait(500);
  stub.quiet = true;
  const sent0 = stub.sent.length, to0 = stub.to.length, made0 = stub.made.length, quiet0 = stub.quietOpened.length, t0 = Date.now();
  await ev(() => document.querySelector('.prompt').focus()); await page.send('Input.insertText', { text: 'hello quill' }); await key('Enter');
  await until(() => stub.sent.length > sent0, 14000, "Quill's first message").catch(() => {});
  const out = {
    ms: Date.now() - t0, made: stub.made.slice(made0), quietOpened: stub.quietOpened.slice(quiet0), sent: stub.sent.slice(sent0).map((m) => m.content), to: stub.to.slice(to0),
    notOpened: await ev(() => /did not open in time/.test(document.body.textContent)),
  };
  // Body bytes the stand-in wrote to Quill's stream by the time its first message arrived: none, as Barkpark.
  out.bodyBytes = out.made.length === 1 ? stub.quietBytes.get(out.made[0]) ?? null : null;
  stub.quiet = false;
  check("control: Quill's new conversation was made and its stream opened the way Barkpark's does on an empty conversation: headers, and 0 body bytes until its first message arrived", out.made.length === 1 && out.quietOpened.includes(out.made[0]) && out.bodyBytes === 0, out);
  check("a new bot's first message goes while Barkpark's stream for its new conversation has sent headers and no body (task-7ec7bb04a1125c4d): sent once, to that conversation, with no line", JSON.stringify(out.sent) === JSON.stringify(['hello quill']) && out.to.length === 1 && out.to[0] === out.made[0] && !out.notOpened, out);
}
