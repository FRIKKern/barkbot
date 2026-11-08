# Fixtures

Captured oracle states, numbers only ([0001](../docs/decisions/0001-black-box-oracle.md)). Written by `node scripts/oracle/capture.mjs <id>`; one file per state: `states/<id>.json`.

```json
{ "id": "oracle-turn-1040", "captured": "2026-11-08", "engine": "electron", "bot": "Oracle", "viewport": [1040, 760, 2],
  "elements": [{ "i": 129, "parent": 128, "tag": "div", "box": [104, 700, 600, 44],
  "style": { "background-color": "rgb(31, 31, 31)", "border-radius": "22px" } }] }
```

UI labels are kept as text; conversation text only as `textLength`. `text-metrics.json` holds the widths and line breaks of the hero's own words in the oracle's font (`scripts/oracle/measure-text.mjs`, which refuses if its font clone measures a live bubble differently).

No Grok Bot code, art or fonts. Screenshots stay out of git. Recapture anything older than 30 days before trusting it.
