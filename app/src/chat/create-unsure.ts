/** Create's line when Barkpark did not say whether the bot was made: its list add got no answer,
 *  or the list could not be read after it. Shared by createBot (api.ts) and the New Bot dialog,
 *  which shows it as it is (never "The bot was not made: …") and turns Create off, so no second
 *  bot is made blind (task-4338079c878d4cc7). */
export const CREATE_UNSURE = 'Barkpark did not say whether the bot was made. Reload to see if it is there before you make it again.'

/** Create's line when the bot's record write got no answer, so the record may be saved but not yet
 *  listed. The dialog shows it as it is, keeps that bot's id (`CreateRetry`) and leaves Create on: its
 *  next Create finishes that same bot, so no record stays off the list (task-acd834992251353b). */
export const CREATE_RETRY = 'Barkpark did not answer, so the bot may already be saved. Press Create again to finish that same bot.'

/** Thrown to the dialog when createBot answers `{retry}`: the id its next Create sends back. */
export class CreateRetry extends Error {
  constructor(readonly retry: string) {
    super(CREATE_RETRY)
  }
}
