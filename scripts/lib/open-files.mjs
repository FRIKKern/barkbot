// A sent file opens from its card (A1, task-71ee600273461306). The card opens the file in a new tab
// at our route (app/src/routes/api/chat.$id.attachments.$aid.ts), and the route's headers decide what
// the tab does with it, never the page: a text file downloads, a PDF draws in the browser's viewer,
// both with nosniff and a CSP sandbox, so nothing a person sent runs as a page on BarkBot's origin.
// Barkpark stores HTML, SVG and script as text/plain; a type outside pictures, text and PDF is a 415.
// Run inside the stand-in's open conversation (behaviour.mjs, after the file card's reload rule).
import { createHash } from 'node:crypto';

const sha = (b) => createHash('sha256').update(b).digest('hex');

export async function openFiles({ check, precondition, ev, open, base, until, stub, page, click, session, note, noteId }) {
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
  const HTML = Buffer.from('<!doctype html><title>x</title><script>parent.postMessage("ran", "*")</script>\n');
  const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const [pdfId, htmlId, svgId] = [PDF, HTML, SVG].map(sha);
  const put = (id, bytes, media_type) => stub.pictures.set(`${session}/${id}`, { data: bytes.toString('base64'), media_type });
  put(noteId, note, 'text/plain'); put(pdfId, PDF, 'application/pdf'); put(htmlId, HTML, 'text/plain'); put(svgId, SVG, 'image/svg+xml');
  const ref = (id, media_type, bytes, name) => ({ id, media_type, byte_size: bytes.length, url: `/v1/chat/sessions/${session}/attachments/${id}`, name });
  stub.rows = [{ seq: 1, role: 'user', source_markdown: 'two files', attachments: [ref(noteId, 'text/plain', note, 'note.txt'), ref(pdfId, 'application/pdf', PDF, 'report.pdf')] }];
  await open(`${base}/`);
  const cards = () => ev(() => [...document.querySelectorAll('.turn-attached .file-card')].map((x) => [x.getAttribute('aria-label'), x.getAttribute('aria-disabled'), x.tabIndex]));
  await until(async () => (await cards()).length === 2, 30000, 'the two file cards').catch(() => {});
  const shown = await cards();
  precondition('the stored row shows its two file cards', shown.length === 2 && shown[0][0] === 'Open note.txt' && shown[1][0] === 'Open report.pdf', { shown });

  // A press on the first card, Enter on the second: each opens its file at our route, with its name.
  await ev(() => { window.__opened = []; window.open = (...a) => { window.__opened.push(a); return null; }; });
  const at = await ev(() => { const r = document.querySelector('.turn-attached .file-card')?.getBoundingClientRect(); return r ? [r.x + r.width / 2, r.y + r.height / 2] : null; });
  if (at) await click(...at);
  await ev(() => document.querySelectorAll('.turn-attached .file-card')[1]?.focus());
  for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  const opened = await ev(() => window.__opened);
  const url = (id, name) => `/api/chat/${session}/attachments/${id}?name=${encodeURIComponent(name)}`;
  check('a press on a sent file\'s card opens it in a new tab at our route, by its name and with no opener, and so does Enter on the next card (both were disabled before)', opened.length === 2 && opened[0][0] === url(noteId, 'note.txt') && opened[1][0] === url(pdfId, 'report.pdf') && opened.every((o) => o[1] === '_blank' && o[2] === 'noopener,noreferrer') && shown.every((c) => c[1] === null && c[2] === 0), { opened, shown });

  // What each tab gets, read from the route itself.
  const get = (u) => ev(async (x) => { const r = await fetch(x); const b = new Uint8Array(await r.arrayBuffer()); const h = (k) => r.headers.get(k); return { status: r.status, type: h('content-type'), sniff: h('x-content-type-options'), disposition: h('content-disposition'), csp: h('content-security-policy'), size: b.length, text: new TextDecoder().decode(b) }; }, u);
  const txt = await get(url(noteId, 'note.txt'));
  check('a text file opens as a download, never drawn here: text/plain; charset=utf-8, nosniff, attachment by its name, a CSP sandbox, and its own bytes', txt.status === 200 && txt.type === 'text/plain; charset=utf-8' && txt.sniff === 'nosniff' && txt.disposition === 'attachment; filename="note.txt"' && txt.csp === 'sandbox' && txt.text === note.toString(), { txt });
  const pdf = await get(url(pdfId, 'report.pdf'));
  check('a PDF opens in the browser\'s viewer: application/pdf, nosniff, inline by its name, a CSP sandbox, and its own bytes', pdf.status === 200 && pdf.type === 'application/pdf' && pdf.sniff === 'nosniff' && pdf.disposition === 'inline; filename="report.pdf"' && pdf.csp === 'sandbox' && pdf.size === PDF.length, { pdf: { ...pdf, text: undefined } });
  // Barkpark stored an HTML file as text/plain: it stays text, a sandboxed download. A name that is not
  // plainly safe (a quote, a line break) is left out of the header instead of being written into it.
  const html = await get(url(htmlId, 'page.html'));
  const odd = await get(`/api/chat/${session}/attachments/${htmlId}?name=${encodeURIComponent('a"\r\nx: y.txt')}`);
  check('what Barkpark stored as text stays text when it reads as HTML: a sandboxed download, never text/html; a name that is not plainly safe is left out of the header', html.status === 200 && html.type === 'text/plain; charset=utf-8' && html.disposition === 'attachment; filename="page.html"' && html.csp === 'sandbox' && html.sniff === 'nosniff' && odd.status === 200 && odd.disposition === 'attachment', { html: { ...html, text: undefined }, odd: { ...odd, text: undefined } });
  // A type outside pictures, text and PDF, were Barkpark ever to answer one: refused, none of its bytes.
  const svg = await get(`/api/chat/${session}/attachments/${svgId}`);
  check('a type outside pictures, text and PDF (image/svg+xml) is refused with a 415, and none of its bytes come back', svg.status === 415 && !/svg/.test(svg.type ?? '') && !svg.text.includes('<svg'), { svg });
  stub.rows = [];
  for (const id of [pdfId, htmlId, svgId]) stub.pictures.delete(`${session}/${id}`);
}
