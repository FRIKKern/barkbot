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
