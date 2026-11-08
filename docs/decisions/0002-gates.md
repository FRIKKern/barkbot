# 0002 Gates turn "1:1" into numbers

Date: 2026-11-08 · Status: accepted

| Gate | Input | Output |
|---|---|---|
| A · Look | A captured oracle state | Same boxes within 1 px, same tokens, at 3 widths |
| B · Turn | A recorded oracle turn | Same elements in the same order and grouping |
| C · Feel | Budgets measured on the oracle | Ours within budget |
| Inventory | Oracle and ours in the same state | Every missing control is a tracked item |

## Context

"Looks the same" is an opinion. fluid-editor and barkpark-studio both found that a machine-decided number, iterated against, beats review by eye. A chat app adds time: what shows while the bot works and how its reply arrives matter as much as boxes.

## Decision

Gate A compares boxes and computed styles, not pixels, so font smoothing and image loading do not fail it. Gate B records the oracle's DOM over time and replays the same event script into ours. Gate C holds feel budgets measured on the oracle before we build. The inventory finds what nobody thought of.

Each gate writes a report to `parity/`. An empty corpus fails. A change that lowers a pass count does not land.

## Considered

- **Pixel diff screenshots.** Kept only for side-by-side review pictures; as a gate it fails on antialiasing.
- **Unit tests per component.** Too far from what a person sees.
