# 0010 The baseline moves to Grok 1.2.3

Date: 2026-11-19 · Status: accepted (owner) · Amends: [0008](0008-card-states-from-a-newer-oracle.md) (the baseline was 0.79.3)

```
fixtures/states/*.json            GrokBot 1.2.3    the baseline: every look, every gate (45 states)
   + oracle-ask-choice, ...       GrokBot 1.0.3    made by sends; listed by id in scripts/lib/versions.mjs
```

## Context

Grok Bot updated itself past 0.79.3. On 2026-11-19 the owner offered "copy Grok 1.1.0 from now on"; Grok then updated to 1.2.3 and the owner replied "Now its updated". Every state that can be reached by looking was captured again on 1.2.3 with `scripts/oracle/sweep.mjs`.

## Decision

BarkBot copies Grok 1.2.3. Rule 6b's one version is now `GrokBot 1.2.3`. The six card states made by sends (oracle-ask-choice, -choice-answered, -file-sent, -file-waiting, -pictures-sent, -pictures-waiting) stay on 1.0.3 as named exceptions, with the reason "made by sends; awaiting the owner's send budget". Their details panel stays not judged, as 0008 set out.

What 1.2.3 changed in the sweep:

- Voice and Speed are one picker. The Voice row is a button that reads "Helix 1.0x" and opens a dialog: a speed slider over a grid of voices. A picker that is an unlabelled button opening a popup is now named by its row, as a combobox is (`scripts/lib/controls.mjs`).
- Gone, so dropped: oracle-speed-picker, oracle-hover-speed, oracle-hover-add-to-slack.
- New: oracle-voice-picker-end and oracle-language-picker-end (a wheel scrolls both lists in 1.2.3), oracle-focus-bot-name (it now has a focus look), oracle-get-mobile (a dialog).
- No sidebar toggle shows on a hover of the top bar, so there is no state for it.

Our app still matches 0.79.3, so Gate A fails on the re-captured states until it is rebuilt. That is a finding, not a reason to keep the old baseline (O4).

## Considered

- **Stay on 0.79.3.** That app is gone, so no state can be captured on it again. The owner chose to move.
- **Copy 1.1.0, as first offered.** Grok was on 1.2.3 before anything was captured, and the owner's reply moved to it.
