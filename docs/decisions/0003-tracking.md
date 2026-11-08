# 0003 Slices on the Barkpark board, items in one JSON, pictures generated

Date: 2026-11-08 · Status: accepted

```
Barkpark goal ── S0–S7 tasks ──► npm run board ─► parity/board.json ─┐
parity/items.json ───────────────────────────────────────────────────┼─► roadmap.svg, journeys.svg, PARITY.md
git log ─────────────────────────────────────────────────────────────┴─► README timeline
```

## Context

Anyone should see progress from the README in five seconds, and nothing should slip. barkdown kept status in prose and in a cycle file; both went stale. It also kept evidence in git and grew past 1.8 GB.

## Decision

Slice status lives on the Barkpark board: goal `task-e7970acf9582cad2`, one child per slice, criteria naming journeys. `npm run board` snapshots it to `parity/board.json`, so pictures and CI need no token.

Item status lives in `parity/items.json`. `npm run check` refuses a done item without gate and evidence, and an out-of-scope part without a decision.

The pictures, `docs/PARITY.md` and the README timeline are generated and never edited by hand. Evidence (clips, screenshots) goes on the task and in Barkpark media, never in git.

## Considered

- **GitHub issues per slice.** Rejected: Barkpark is our board; GitHub only mirrors.
- **One task per item.** Rejected for now: 30 tasks bury the slices.
