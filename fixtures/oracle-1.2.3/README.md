# Turns recorded on Grok Bot 1.2.3 (2026-11-19)

The six card states made by sends, captured again on 1.2.3 after the owner allowed sends in the throwaway Oracle bot ("Yes, Oracle bot only", 2026-11-19). The states are in `fixtures/states/` with every other 1.2.3 state ([0010](../../docs/decisions/0010-baseline-grok-1.2.3.md)). These are the turns recorded while making them, with `scripts/oracle/record.mjs` and the existing recipes only. They wait here, outside `traces/`, as the [1.0.3 ones](../oracle-1.0.3/README.md) do: Gate B has no scenes for these turns yet, and the two `-waiting` takes hold their recipe without sending it (`ORACLE_HOLD=1`).

| Trace | Recipe | State captured after it |
|---|---|---|
| `2026-11-19-file-waiting` | `file`, held | `oracle-file-waiting` |
| `2026-11-19-file` | `enter` (sends the held file) | `oracle-file-sent` |
| `2026-11-19-pictures-waiting` | `pictures`, held | `oracle-pictures-waiting` (pointer on the second picture: `capture.mjs --hover`) |
| `2026-11-19-pictures` | `enter` (sends the held pictures) | `oracle-pictures-sent` |
| `2026-11-19-ask-choice` | `ask-choice` | `oracle-ask-choice` |
| `2026-11-19-choose-b` | `choose-b` | `oracle-choice-answered` |

Four sends in all: the file, the pictures, the question, the answer B.

## Second take, with the pointer parked (2026-11-19)

Five of the states were captured again: oracle-file-waiting, oracle-file-sent, oracle-pictures-sent, oracle-ask-choice and oracle-choice-answered. `capture.mjs` now parks the pointer 8 pt in from the bottom-right corner and records `parked`, as the sweep does. Suggested's Hide shows only while the pointer is over the window, and Gate A now rests our pointer there too. The same four sends were made again, with the same recipes in the same order; the `-2` traces are that take. oracle-pictures-waiting keeps its first take, because its `pointer` already rests the pointer.

## The Voice picker's behaviour

`2026-11-19-voice-picker` comes from `node scripts/oracle/voice-picker.mjs`, look-only except for two reversible steps in the Oracle bot: one slider step (up, then back) and two picks (Helios, the voice before Helix, then Helix again). Each was put back to Helix 1.0x and checked. It records where focus lands on open, every row's name and description, whether a pick closes the picker, and the speed slider (range, step, how a value prints). The state `oracle-voice-picker-start` (the list at its first voice) is in `fixtures/states/`.
