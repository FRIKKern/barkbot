// Which conversation a live turn is about to go to, read before the send (V1, PR #288 review).
// turn-live.mjs hooks EventSource so window.__streams lists every /api/chat/<id>/events stream the
// page opened; the app opens one on load for an existing conversation (useConversation.ts).
// The check before the send fails CLOSED:
//   - the hook never ran (window.__streams is not an array): refuse;
//   - no conversation stream, but the page already shows bubbles: refuse (an existing
//     conversation has opened its stream by then, so the hook missed it);
//   - no conversation stream and no bubbles: a new conversation, whose first message makes the
//     stream. Only this case waits for the check after the turn.
// Nothing here sends input; check.mjs drives guardBeforeSend with a stub page.
const STREAM = /\/api\/chat\/([0-9a-f-]{36})\/events/i;

// The newest conversation stream the page opened, or null.
export const sidOf = (streams) => (Array.isArray(streams) ? streams : []).map((u) => String(u).match(STREAM)?.[1]).filter(Boolean).at(-1) ?? null;

// streams: what window.__streams holds. bubbles: the page's user + bot bubbles.
// Returns { sid } (check it), { defer: true } (a new conversation) or { refuse: why }.
export function beforeSend({ streams, bubbles }) {
  if (!Array.isArray(streams)) return { refuse: 'the stream hook never ran on this page (window.__streams is missing), so the open conversation cannot be checked' };
  const sid = sidOf(streams);
  if (sid) return { sid };
  if (!(bubbles === 0)) return { refuse: `the page shows ${bubbles} bubbles but opened no conversation stream, so the open conversation cannot be checked` };
  return { defer: true };
}

// The read and the decision on a CDP page ({ evaluate }), as turn-live runs it before a send.
export const guardBeforeSend = async (page, bubbles) => beforeSend({ streams: await page.evaluate(() => window.__streams), bubbles });
