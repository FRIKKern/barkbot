/** Create's line when Barkpark did not say whether the bot was made: its list add got no answer,
 *  or the list could not be read after it. Shared by createBot (api.ts) and the New Bot dialog,
 *  which shows it as it is (never "The bot was not made: …") and turns Create off, so no second
 *  bot is made blind (task-4338079c878d4cc7). */
export const CREATE_UNSURE = 'Barkpark did not say whether the bot was made. Reload to see if it is there before you make it again.'
