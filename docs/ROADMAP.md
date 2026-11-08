# Roadmap

[![BarkBot roadmap](images/roadmap.svg)](../README.md)

All eight slices are phase 1, **recreate** ([0005](decisions/0005-recreate-first.md)): nothing of our own until every journey reads 1:1. One slice is one journey built all the way down: pixels match the oracle, the click goes through Barkpark's chat API, real `claude` answers. Slice status lives on the Barkpark board (goal `task-e7970acf9582cad2`), item status in [`parity/items.json`](../parity/items.json). `scripts/generate-roadmap.mjs` reads this table.

| Id | Slice | Reward | Journeys |
|---|---|---|---|
| S0 | Harness | 1:1 becomes a number | — |
| S1 | Talk | A BarkBot you can talk to | J01 |
| S2 | Frame | It looks like the real thing | J02 J03 J04 |
| S3 | Control | Trusted with long work | J05 J06 |
| S4 | Things | It shows its work | J07 J08 J09 |
| S5 | Ask | It asks before it acts | J10 J11 J13 |
| S6 | Own computer | It works while you are away | J01 J05 J06 |
| S7 | Hello | Nothing left to tell apart | J12 |
