# 0007 One file per item, one file per gated state

Date: 2026-11-09 · Status: accepted · Supersedes in part: [0003](0003-tracking.md) (item status in one `parity/items.json`)

```
parity/items/<id>.json      one item: status, gate, evidence, controls
parity/gate-a/<state>.json  one captured state: Gate A cases and the inventory
        └── npm run docs / npm run gate regenerate the pages; nobody hand-merges a shared table
```

## Context

A long run puts several lanes on the repo at once. Item status lived on one line per item of one file, and Gate A's results in one file. Two lanes that touch neighbouring items, or raise the pass count on different states, always conflict in git, even with nothing truly in dispute. A test of `npm run land` on 2026-11-09 hit exactly that: F9 on one side, F10 on the other, a stopped rebase.

## Decision

Each item is its own file, named for its id. Each captured state's Gate A record is its own file, rewritten only when its numbers change. The generated pages (`docs/PARITY.md`, the SVGs) are regenerated after a rebase by `npm run land`, never merged by hand. The rest of 0003 stands: the board holds slices, items hold evidence, `npm run check` refuses a done item without gate and evidence.

## Considered

- **A git merge driver that merges `items.json` by id.** One file stays, but every clone must install the driver, and a driver bug loses data silently.
- **Serialise all merges through one lead.** Works, and makes the lead the bottleneck for 24 hours.
