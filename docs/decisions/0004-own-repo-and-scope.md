# 0004 Its own repo on Barkpark's chat API; some oracle parts wait

Date: 2026-11-08 · Status: accepted

```
barkbot (this repo) ── server functions ── /v1/chat, /v1/bots ──► Barkpark
                                                       └─ registered chat host ─► claude -p
```

## Context

Barkpark already serves the whole chat API: sessions, messages, live events, attachments, approval, answer and interrupt, and registered chat hosts that run `claude -p` on a machine of the workspace's choosing. A separate app can match the oracle without Studio's chrome in the way, as barkpark-studio does for Sanity.

## Decision

BarkBot is its own repo, TanStack Start and React. Only server functions hold the Barkpark token; browser code never calls Barkpark. What Barkpark lacks becomes a Barkpark task (build spec phases 1 to 3), never a workaround here.

Out of scope until a decision brings each in: voice chat, Share, Add to Slack, routines, and app connectors such as Gmail. They need outside services or act on real accounts. The inventory lists them as named gaps, not silent ones.

## Considered

- **A Studio page inside Barkpark.** Rejected: plugin rules forbid plugin UI, and Studio's chrome fights a 1:1 match.
- **Our own agent harness.** Rejected: stock `claude -p` on the owner's login is the engine (build spec D3 to D5).
