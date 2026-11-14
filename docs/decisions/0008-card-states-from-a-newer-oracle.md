# 0008 Card states from a newer oracle, as a named exception

Date: 2026-11-14 · Status: accepted (owner) · Amends: rule 6b of `npm run check` (one oracle version)

```
fixtures/states/*.json            GrokBot 0.79.3   the baseline: every look, every gate
   + oracle-ask-choice, ...       GrokBot 1.0.3    listed by id in scripts/lib/versions.mjs, with the reason
         Gate A judges their conversation, cards and composer; not the details panel 1.0.3 rebuilt
```

## Context

Grok Bot updated itself from 0.79.3 to 1.0.3 on restart. The question card, the file card and the picture grid could only be captured then: 0.79.3 was gone before anyone sent it a question or a file. Rule 6b refuses a mix of versions, so those captures waited outside `fixtures/states/` (`fixtures/oracle-1.0.3/`), ungated.

## Decision

BarkBot stays on the 0.79.3 baseline. The card states come into `fixtures/states/` as exceptions to rule 6b: each is named by id in `scripts/lib/versions.mjs` with its version and the reason. A state not on the list with another version still fails, and so does a listed state whose capture names a different version, or an entry with no state.

In an excepted state Gate A, the inventory and the check leave out the details panel: 1.0.3 rebuilt it (Voice and Speed in one picker, no Add to Slack card), and the baseline's own states judge ours there. The rail, the header, the conversation with its cards, and the composer are judged as captured.

## Considered

- **Move BarkBot to 1.0.3.** Every gated state would need a re-capture and every look a re-check. The owner chose to stay.
- **Loosen rule 6b to allow any two versions.** A stale capture would then pass unseen, which is what the rule is for.
- **Keep the cards ungated.** Then nothing proves our cards look as the oracle's.
