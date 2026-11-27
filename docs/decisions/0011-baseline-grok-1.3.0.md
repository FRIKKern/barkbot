# 0011 The baseline moves to Grok 1.3.0

Date: 2026-11-27 · Status: accepted (owner) · Amends: [0010](0010-baseline-grok-1.2.3.md) (the baseline was 1.2.3)

```
fixtures/states/*.json            GrokBot 1.3.0    the baseline: 48 states, by looking (scripts/oracle/sweep.mjs --pin)
                                  GrokBot 1.2.3    6 named exceptions, made by sends (scripts/lib/versions.mjs)
```

## Context

Grok Bot updated itself from 1.2.3 to 1.3.0 on 2026-11-25, during a recapture, and the owner said BarkBot follows it (task-d367a841021f6fb3). Every state that can be reached by looking was captured again on 1.3.0 on 2026-11-27, with `--pin` (after each width step the transcript is wheeled up and back to its end, so no row keeps its 1.2.3 place) and `--settle 900`. turn-1040, main-1280 and main-1600 were taken again because Activity showed "Couldn't load".

## Decision

BarkBot copies Grok 1.3.0. Rule 6b's one version is now `GrokBot 1.3.0`. The six card states made by sends (oracle-ask-choice, -choice-answered, -file-sent, -file-waiting, -pictures-sent, -pictures-waiting) stay on 1.2.3 as named exceptions until they are captured again by sends in the Oracle bot. As in 0008, their details panel is not judged; the 1.3.0 states judge it.

The 1.3.0 captures carry the page's background (`page`) and each sticky, fixed or absolute box's `position`, so what is behind a box is known where it was not (task-f7fdf44d2aa63bf3). What 1.3.0 changed for BarkBot to follow is filed one task each under task-d367a841021f6fb3. Gate A fails on those until they are built: a finding, not a reason to keep the old baseline (O4).

## Considered

- **Stay on 1.2.3.** That app is gone, so no state can be captured on it again, and the 1.2.3 width captures held resize artifacts that only a recapture could clear.
