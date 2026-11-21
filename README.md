# BarkBot

![The oracle's screen, recreated: the rail, the conversation, and the bot's Activity panel with Coding, Suggested, Computer and Voice chat](docs/images/hero.svg)

An AI agent with its own computer. You talk to it here; it works on a machine of its own, keeps going while you are away, and shows its work. Built on [Barkpark](https://github.com/FRIKKern/barkpark): Barkpark keeps the bots, the conversations and the evidence, and a stock `claude -p` on the bot's machine does the work, on the owner's own login.

[![Roadmap: eight slices, each with the reward it ships](docs/images/roadmap.svg)](docs/ROADMAP.md)

## How we build it

```
Grok Bot (the oracle)            BarkBot                          Barkpark
read · one gesture · read ─────► fixtures/ and traces/
                                 build one slice ── /v1/chat ───► chat host ─► claude -p
                                 gates: ours vs oracle, as numbers
                                 someone else signs the journey
```

**Recreate first** ([0005](docs/decisions/0005-recreate-first.md)): every screen, label, size and timing matches Grok Bot before we change anything. We learn it by watching ([0001](docs/decisions/0001-black-box-oracle.md)), never by copying its code, art or font files; those get plain stand-ins of the same size. "1:1" is a number three gates print ([0002](docs/decisions/0002-gates.md)). Each slice is one journey built all the way down, real Barkpark and real `claude` included; the first computer is the owner's Mac. The method in full: [BarkBot Oracle Method](https://guerrilla.barkpark.cloud/papers/barkbot-oracle-method). What gets built: [BarkBot Build Spec](https://guerrilla.barkpark.cloud/papers/barkbot-build-spec).

[![Journeys: one tile per journey, one dot per parity item](docs/images/journeys.svg)](JOURNEYS.md)

## News

<!-- news:start -->
**Friday 20 November.** 10 pull requests merged, one of them Thursday's News. The first message to a new conversation is now sent, Thursday's open snag, and a fresh conversation on the bot's virtual machine got its reply in 7.4 s. The Voice chat card follows Grok Bot 1.2.3: one Voice row opens a dialog with a speed slider over 28 voices. Gate A, which measures our screens against the oracle's, passed 1,522 of 2,103 cases at the day's last merge, up from 1,032 of 2,004. [The full day](docs/news/2026-11-20.md)
- **In the app:** the first message to a new conversation is sent once, with no error line; the Voice row opens a dialog of 28 voices under a speed slider ([#287](https://github.com/FRIKKern/barkbot/pull/287), [#284](https://github.com/FRIKKern/barkbot/pull/284))
- **Oracle:** the Voice picker read on 1.2.3; five screens made by sends captured again with the pointer parked, so Suggested's Hide shows ([#285](https://github.com/FRIKKern/barkbot/pull/285), [#292](https://github.com/FRIKKern/barkbot/pull/292))
- **Host:** a fresh VM conversation answered in 7.4 s; host enrollment keeps a pasted code with no newline and says what to do when the host program is too old ([#288](https://github.com/FRIKKern/barkbot/pull/288), [#291](https://github.com/FRIKKern/barkbot/pull/291), [#289](https://github.com/FRIKKern/barkbot/pull/289))

**Thursday 19 November.** 9 pull requests merged, one of them Wednesday's News. Grok Bot, the app BarkBot copies, updated itself to 1.2.3, and the baseline moved with it: 51 screens were captured, 4 of them new, and BarkBot now passes 1,032 of 2,004 measured cases, as it still copies the older version. The bot's host also runs on a virtual machine of its own, where a reply, a cancel and a restart were seen live. When two page loads save the Main Bot at once, the second now shows the bot the first saved, with no warning line, if it is this computer's own. [The full day](docs/news/2026-11-19.md)
- **Oracle:** 51 screens captured on Grok Bot 1.2.3, 4 of them new; Gate A drops to 1,032 of 2,004 cases on purpose, the work list from here ([#279](https://github.com/FRIKKern/barkbot/pull/279))
- **App and host:** a Main Bot of this computer that another load just saved is shown with no warning line; the transcript's day and time line matched the oracle 1.0.3 measures; the host runs on its own VM ([#253](https://github.com/FRIKKern/barkbot/pull/253), [#260](https://github.com/FRIKKern/barkbot/pull/260), [#283](https://github.com/FRIKKern/barkbot/pull/283))
- **Rules:** the details panel's close and open curve and Shift+Enter (exactly the trace's line breaks, nothing sent) are held to their traces; the two-loads rule waits until the race happens ([#252](https://github.com/FRIKKern/barkbot/pull/252), [#257](https://github.com/FRIKKern/barkbot/pull/257), [#274](https://github.com/FRIKKern/barkbot/pull/274), [#268](https://github.com/FRIKKern/barkbot/pull/268))
<!-- news:end -->

## Where things live (one fact, one home)

| What | Where |
|---|---|
| Slices and who does what | Barkpark goal `task-e7970acf9582cad2` and its children; snapshot in `parity/board.json` |
| Every item and its status, with evidence | [`parity/items/`](parity/items/), one file per item, listed in [`docs/PARITY.md`](docs/PARITY.md) |
| The spec of "works" | [`JOURNEYS.md`](JOURNEYS.md) |
| The gates, the oracle rules, the pace rules | [`QUALITY.md`](QUALITY.md) |
| Why | [`docs/decisions/`](docs/decisions/), one page each, superseded never edited |
| Captured oracle states (numbers only) | `fixtures/states/` |
| Recorded oracle turns (order and timing only) | `traces/` |
| The app | `app/` (TanStack Start + React); Gate A and the inventory, one file per captured state, in `parity/gate-a/` |
| How we work | [`AGENTS.md`](AGENTS.md), [`CONTRIBUTING.md`](CONTRIBUTING.md) |

## Run it

```sh
npm run check    # doc caps, links, items, fresh pictures, no secrets
npm run board    # snapshot the Barkpark board (needs bp)
npm run docs     # redraw the pictures and PARITY.md
npm run gate     # Gate A and the inventory: the app against every captured oracle state
npm run host:enroll  # once: make this Mac the bot's computer (token from Studio > Chat hosts)
npm run host         # keep running while the bot works
cd app && pnpm install && pnpm dev   # the app on http://localhost:3170
```
