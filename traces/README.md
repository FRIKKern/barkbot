# Traces

Recorded oracle turns, order and timing only ([0002](../docs/decisions/0002-gates.md)). One file per turn: `<id>.json`.

```json
{ "id": "T0001-say-hi", "captured": "2026-11-09", "recipe": "say-hi",
  "steps": [{ "t": 0, "kind": "user-bubble" }, { "t": 410, "kind": "working-line" },
            { "t": 2380, "kind": "bot-bubble" }, { "t": 2390, "kind": "working-line-gone" }] }
```

Gate B plays the same recipe through BarkBot and compares kinds, order and grouping; times are checked against the feel budgets in [QUALITY.md](../QUALITY.md).
