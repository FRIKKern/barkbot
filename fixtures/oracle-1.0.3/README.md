# Captures from Grok Bot 1.0.3 (2026-11-14)

Six looks the owner approved a send each for, read on the throwaway Oracle bot. They wait here, outside `fixtures/states/` and `traces/`, because every gated state must come from one oracle version (`npm run check`, rule 6b) and the gated ones are 0.79.3. They move in when the gated states are captured again on 1.0.3.

| Look | State | What it shows |
|---|---|---|
| Question card (Q2) | `oracle-ask-choice`, `oracle-choice-answered` | The question in bold, one row per choice with a lettered square; after a press only the chosen row stays, its square filled blue, the question dimmed. The composer says "Type your answer, or talk about something else" while it waits. |
| File card (A1) | `oracle-file-waiting`, `oracle-file-sent` | Sent: a card with a page mark, the name and the size ("25B"), above the message's own bubble. |
| Picture grid (A2) | `oracle-pictures-waiting`, `oracle-pictures-sent` | Waiting: square thumbnails in a row above the text, a remove button on hover. Sent: three square tiles above the bubble, the third dimmed with "+3" for five pictures. |
| Approval card (Q1) | `oracle-ask-leave`, `oracle-ask-leave-2` | Not seen. With its settings as they are, the oracle made and deleted a file in its home folder without asking. Its Permissions settings name "Always Ask", "Allow without Asking" and "Auto-Review"; a card would need a setting changed, which is the owner's to do. |
| Cancel (C1) | `oracle-replying`, `parity/oracle/cancel.json` | No Stop. Through a 53 s reply the pane showed no stop or cancel label; the reply landed whole. Escape closes the details panel. |
| Message actions (N2) | `parity/oracle/cancel.json` | 1.0.3 has them: the labels "Reply to your message", "More message actions", "Add reaction" and "Reply to Oracle message" showed with the pointer over a message. Their look is not captured yet. |

The last message of the cancel take carries extra copies of the made-up files: two earlier tries at attaching (the Attach files chooser and a drop, through the debug port) showed nothing in the composer but were held by the app and went with the next send.
