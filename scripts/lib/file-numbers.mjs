// Files of one message that share a name are numbered on the live page, as Grok 1.2.3 numbers them
// (task-88d2abf69984c533; oracle-main-1600: two oracle-note.txt read "oracle-note.txt (1)" and
// "oracle-note.txt (2)", on the card and in its "Open ..." name; one file alone has no number,
// oracle-file-sent). Before this only the gate scenes carried the numbers, baked into their names.
// The number is the page's: Barkpark is sent and keeps the names as they are.
// Run inside the stand-in's open conversation (behaviour.mjs, after the file cards).
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

export async function fileNumbers({ check, precondition, ev, open, base, until, key, stub, page, path, port, session }) {
  const dirs = ['a', 'b'].map((d) => path('.cache', `same-name-${port}-${d}`));
  dirs.forEach((d, i) => { mkdirSync(d, { recursive: true }); writeFileSync(`${d}/note.txt`, `note ${i + 1}\n`); });
  const pick = async (file) => {
    const { root } = await page.send('DOM.getDocument');
    const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.composer-wrap input[type=file]' });
    await page.send('DOM.setFileInputFiles', { nodeId, files: [file] });
  };
  const chips = () => ev(() => [...document.querySelectorAll('.composer-attachments [role=listitem]')].map((x) => x.getAttribute('aria-label')));
  // Each message's file cards, top to bottom: [its Open name, the name the card shows].
  const cards = () => ev(() => [...document.querySelectorAll('.turn-attached')].map((t) => [...t.querySelectorAll('.file-card')]
    .map((c) => [c.getAttribute('aria-label'), c.querySelector('.file-name')?.textContent.replace(/ /g, ' ').trim() ?? null])).filter((g) => g.length));

  // Picked and sent: two files named note.txt, from two folders, in one message.
  stub.rows = [];
  await open(`${base}/`);
  await until(async () => !!(await ev(() => document.querySelector('.composer-wrap input[type=file]'))), 15000, 'the composer').catch(() => {});
  const sent0 = stub.sent.length;
  await pick(`${dirs[0]}/note.txt`);
  await until(async () => (await chips()).length === 1, 5000, 'the first chip').catch(() => {});
  await pick(`${dirs[1]}/note.txt`);
  await until(async () => (await chips()).length === 2, 5000, 'the second chip').catch(() => {});
  const waiting = await chips();
  precondition('two files named note.txt wait in the box', waiting.length === 2, waiting);
  await ev(() => document.querySelector('.prompt').focus());
  await page.send('Input.insertText', { text: 'two notes' });
  await key('Enter');
  await until(() => stub.sent.length > sent0, 8000, 'the message to reach the stand-in').catch(() => {});
  await until(async () => (await cards()).at(-1)?.length === 2, 8000, 'the two file cards').catch(() => {});
  const live = (await cards()).at(-1) ?? [];
  const named = (stub.sent[sent0]?.attachments ?? []).map((a) => a.name);
  check('two files named note.txt sent in one message: the cards read "note.txt (1)" and "note.txt (2)", on the card and in its Open name, as Grok 1.2.3 numbers them; Barkpark is sent the names as they are (note.txt twice)',
    JSON.stringify(live) === JSON.stringify([['Open note.txt (1)', 'note.txt (1)'], ['Open note.txt (2)', 'note.txt (2)']]) && JSON.stringify(named) === '["note.txt","note.txt"]', { live, named });

  // Stored: after a reload, from Barkpark's attachments. Control: two names that differ, no number.
  const att = (id, name) => ({ id, media_type: 'text/plain', byte_size: 7, url: `/v1/chat/sessions/${session}/attachments/${id}`, name });
  stub.rows = [
    { seq: 1, role: 'user', source_markdown: 'two notes', attachments: [att('a'.repeat(64), 'note.txt'), att('b'.repeat(64), 'note.txt')] },
    { seq: 2, role: 'user', source_markdown: 'two names', attachments: [att('c'.repeat(64), 'one.txt'), att('d'.repeat(64), 'two.txt')] },
  ];
  await open(`${base}/`);
  await until(async () => (await cards()).length === 2, 15000, 'the stored cards').catch(() => {});
  const stored = await cards();
  check('a reload: a stored message with two files named note.txt reads "note.txt (1)" and "note.txt (2)" (control: one with one.txt and two.txt reads them unnumbered)',
    JSON.stringify(stored) === JSON.stringify([[['Open note.txt (1)', 'note.txt (1)'], ['Open note.txt (2)', 'note.txt (2)']], [['Open one.txt', 'one.txt'], ['Open two.txt', 'two.txt']]]), { stored });
  stub.rows = [];
  dirs.forEach((d) => rmSync(d, { recursive: true, force: true }));
}
