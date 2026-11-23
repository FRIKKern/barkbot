/** What a door says when a conversation could not be checked as one of BarkBot's own
 *  (server/own-session.ts requireOwnSessionFn and requireOwnSessionRoute). It lives here, not there, so the page can read it:
 *  the browser's copy of a server module is a stand-in. */
export const NOT_OWN = 'This conversation could not be checked as one of your bots\', so nothing was done with it. Reload to try again.'
