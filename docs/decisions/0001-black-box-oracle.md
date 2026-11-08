# 0001 Grok Bot is the oracle, watched as a black box

Date: 2026-11-08 · Status: accepted

```
oracle: Grok Bot, owner's tab      ours: BarkBot
  boxes, tokens, labels   ──read──►  fixtures/states/
  one gesture, DOM over time ─rec─►  traces/
  same state, same gesture  ─diff─►  same result?
```

## Context

We want BarkBot to feel like Grok Bot: the dark three panes, how a reply arrives, how the bot shows its computer and its work. Guessing from screenshots drifts. fluid-editor matched Squarespace's editor 1:1 in six days by watching the real thing.

## Decision

Grok Bot, in the owner's logged-in browser tab, is the oracle. We read its DOM through headless Chrome, do one gesture, read again, and compare ours with gates ([0002](0002-gates.md)).

We copy behaviour, never code or art. No Grok Bot JavaScript, CSS files, icons, mascot, fonts, copy text or name enter this repo. Fixtures hold numbers only. BarkBot has its own mark and its own words.

Probes never act outside the page: no Connect, Approve, Share, Add to Slack or routines, no answered permission prompts. They run against a throwaway bot or conversation, with fixed recipe messages.

## Considered

- **Build from screenshots alone.** Rejected: timing, grouping and states are invisible in a still.
- **Read Grok Bot's code or network protocol.** Rejected: a licence and terms risk, and it ties us to one build. We watch the DOM, not the wire.
