# Fixtures

Captured oracle states, numbers only ([0001](../docs/decisions/0001-black-box-oracle.md)). One file per state: `states/<id>.json`.

```json
{ "id": "S-transcript-1280", "captured": "2026-11-09", "engine": "chrome", "width": 1280,
  "recipe": "say-hi", "elements": [{ "name": "composer", "box": [128, 556, 716, 58],
  "style": { "radius": "29px", "background": "rgb(28,28,31)", "fontSize": "16px" } }] }
```

No Grok Bot code, art, fonts or copy text. Raw pages stay in `fixtures/raw/`, which git ignores. Recapture anything older than 30 days before trusting it.
