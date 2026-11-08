# AGENTS.md

Lead with a picture, then the fewest words that carry the point.

## Where things live

```
slice status  ─► Barkpark goal task-e7970acf9582cad2 and its S0–S7 children
item status   ─► parity/items/<id>.json (one file per item, evidence on done)
what "works"  ─► JOURNEYS.md (J01–J13)
how good      ─► QUALITY.md (gates, oracle rules O1–O4, pace)
why           ─► docs/decisions/NNNN-*.md (supersede, never edit)
the oracle    ─► Grok Bot.app on the owner's Mac, over a local DevTools port (0006)
the app       ─► app/ (TanStack Start); /gate/<state> is Gate A's stage
```

## Loop

1. Claim the current slice task: `bp task claim <id> <worker>`.
2. An unread item is captured on the oracle first (O1), then built.
3. Work in a worktree. The main checkout stays on `main`.
4. Name the item in the commit: `T3: working line with the bot's mark`.
5. `npm run check` before every commit; `npm run gate` after any change in `app/`; `npm run land` to land a branch. Long runs: [BarkBot 24h Run](https://guerrilla.barkpark.cloud/papers/barkbot-24h-run).
6. Set the item in `parity/items/<id>.json` with gate and evidence, then `npm run docs`.
7. Evidence (clips, screenshots) goes on the task, never in git.

## Rules

- **Unrun means unrun.** Never report a check you did not run.
- **Nobody signs off their own journey.** Owner sign-off needs the owner's own words.
- **No skip-pass.** A check with nothing to check fails.
- **Recreate first** (0005). Match the oracle 1:1; no ideas of our own until the gates say 1:1.
- **Black box only** (O2). Watch Grok Bot; never copy its code, art or font files.
- **Never press Connect, Approve or Share on the oracle** (O1).
- **A Barkpark gap is a Barkpark task**, never a workaround here.
- **No secrets** in prompts, files or output. Ask before pushing.
