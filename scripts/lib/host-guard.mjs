// Which conversation a live turn is about to go to, read before the send (V1, PR #288 reviews).
// turn-live.mjs hooks EventSource so window.__streams lists every /api/chat/<id>/events stream the
// page opened; the app opens one on load for an existing conversation (useConversation.ts).
// The check before the send fails CLOSED:
//   - the hook never ran (window.__streams is not an array): refuse;
//   - no conversation stream, but the page already shows bubbles: refuse (an existing
//     conversation has opened its stream by then, so the hook missed it);
//   - no conversation stream and no bubbles: a new conversation, whose first message makes it on
//     the page's own computer (app/src/routes/index.tsx: startChat with chat.host.id), not on
//     HOST. So it goes only when the page's bot (the transcript's data-bot-id) is the --bot asked
//     for, and the page's computer (data-host-id) is HOST's id as Barkpark lists it. The check
//     after the turn then checks the conversation itself.
// Nothing here sends input; check.mjs drives guardBeforeSend with a stub page.
const STREAM = /\/api\/chat\/([0-9a-f-]{36})\/events/i;

// The newest conversation stream the page opened, or null.
export const sidOf = (streams) => (Array.isArray(streams) ? streams : []).map((u) => String(u).match(STREAM)?.[1]).filter(Boolean).at(-1) ?? null;

// seen: { streams, bot, host } read from the page. bubbles: its user + bot bubbles. want: { bot }
// (--bot, or null) and hostId(), an async read of HOST's id (null: not one of your computers),
// called only for a new conversation.
// Returns { sid } (check that conversation), { fresh: true } (a new one, on HOST) or { refuse: why }.
export async function beforeSend({ streams, bot, host }, bubbles, want) {
  if (!Array.isArray(streams)) return { refuse: 'the stream hook never ran on this page (window.__streams is missing), so the open conversation cannot be checked' };
  const sid = sidOf(streams);
  if (sid) return { sid };
  if (!(bubbles === 0)) return { refuse: `the page shows ${bubbles} bubbles but opened no conversation stream, so the open conversation cannot be checked` };
  // A new conversation: it is made on the page's computer by the first message.
  if (!want?.bot) return { refuse: 'the page has no conversation yet and no --bot was given, so the computer its first message goes to cannot be checked (pass --bot <id>)' };
  if (bot !== want.bot) return { refuse: `the page opened bot ${bot ?? '(none shown)'}, not --bot ${want.bot}` };
  const hostId = await want.hostId();
  if (!hostId) return { refuse: 'the computer named is not one of your enrolled computers' };
  if (host !== hostId) return { refuse: `the page's bot makes its conversations on computer ${host ?? '(none shown)'}, not on the computer named (${hostId})` };
  return { fresh: true };
}

// What the page shows, read in one go: the streams it opened, and the transcript's bot and computer.
export const readPage = (page) => page.evaluate(() => {
  const t = document.querySelector('.transcript');
  return { streams: window.__streams, bot: t?.dataset.botId ?? null, host: t?.dataset.hostId ?? null };
});

// The read and the decision on a CDP page ({ evaluate }), as turn-live runs it before a send.
export const guardBeforeSend = async (page, bubbles, want) => beforeSend(await readPage(page), bubbles, want);
