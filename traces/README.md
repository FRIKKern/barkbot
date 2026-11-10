# Traces

Recorded oracle turns ([0002](../docs/decisions/0002-gates.md)), written by `node scripts/oracle/record.mjs <recipe>`. One file per turn.

| Field | What |
|---|---|
| `recipe`, `oracle_version` | The gesture, and the Grok Bot version it was recorded on. Gate B judges a recipe's turns on its newest version only ([`turn-traces.mjs`](../scripts/lib/turn-traces.mjs)); the older traces stay for the hero and the feel budgets |
| `events` | DOM changes in ms after the gesture: what was added or removed, its kind (`bubble:user`, `main`, `panel`, `rail`), box, short status labels as text, bubble text as a length only |
| `animations` | Every transition and animation the engine started: duration, delay, easing, keyframes, and what it moved |
| `samples`, `scroll` | Opacity and position of new parts per frame (only while the window draws), and the transcript's scroll |

Recipes and the send guard live in [`scripts/oracle/recipes.mjs`](../scripts/oracle/recipes.mjs). Starting the oracle: [`scripts/oracle/README.md`](../scripts/oracle/README.md).
