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
**Friday 27 November.** 11 pull requests merged, one of them the News for Thursday. BarkBot's baseline moved to Grok Bot 1.3.0, with 48 states captured again, and seven PRs then made BarkBot follow it: labels in sentence case, a Search button on Library, no details panel below 800 wide, no screen face while Bot's computer is Unreachable, and the new sizes of the Voice picker, the Language list and Get mobile. Gate A went from 2,656 of 3,069 cases on the new baseline to 2,877 of 3,049. [The full day](docs/news/2026-11-27.md)
- **Baseline Grok Bot 1.3.0:** 48 states captured again, pinned boxes scored, every moved case named; 2,656 of 3,069 pass ([#340](https://github.com/FRIKKern/barkbot/pull/340), [#339](https://github.com/FRIKKern/barkbot/pull/339))
- **Following 1.3.0:** sentence-case labels, Library's Search button, no details panel below 800, no screen face while Unreachable ([#341](https://github.com/FRIKKern/barkbot/pull/341), [#342](https://github.com/FRIKKern/barkbot/pull/342), [#343](https://github.com/FRIKKern/barkbot/pull/343), [#344](https://github.com/FRIKKern/barkbot/pull/344))
- **New sizes:** the Voice picker, the Language list and Get mobile match 1.3.0; Gate A ends at 2,877 of 3,049 ([#345](https://github.com/FRIKKern/barkbot/pull/345), [#346](https://github.com/FRIKKern/barkbot/pull/346), [#347](https://github.com/FRIKKern/barkbot/pull/347))

**Thursday 26 November.** 5 pull requests merged, one of them the News for Wednesday. The Main Bot now moves in, or keeps as made here, only a conversation Barkpark shows this server's token made, so a workspace-mate's newest conversation is never taken over. An answered question card now comes back answered after a reload, and on a Mac the chat host can run as a LaunchAgent, so it outlives its Terminal and comes back after a restart and login. Gate A no longer counts paint too clear to move a pixel: 37 box cases that passed are gone, and 2,656 of its 2,754 cases pass. [The full day](docs/news/2026-11-26.md)
- **Own conversations only:** move-in and made here take only a conversation this server's token made; a failed read of who we are adopts nothing ([#334](https://github.com/FRIKKern/barkbot/pull/334))
- **Chat:** an answered question card comes back after a reload; the Mac's host can run as a LaunchAgent ([#335](https://github.com/FRIKKern/barkbot/pull/335), [#323](https://github.com/FRIKKern/barkbot/pull/323))
- **Gate A:** paint too clear to move a pixel is no paint: 37 box cases gone, 2,656 of 2,754 pass ([#337](https://github.com/FRIKKern/barkbot/pull/337))
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
npm run host         # keep running while the bot works, or instead:
npm run host:install-agent  # a LaunchAgent: starts at login, restarts on failure, no terminal (-- --replace stops one in a terminal)
npm run host:agent-status   # installed, loaded, pid, logs (~/Library/Logs/BarkBot); host:uninstall-agent removes it
npm run test:host-agent     # the LaunchAgent commands against a scratch HOME and a stand-in launchctl (macOS)
cd app && pnpm install && pnpm dev   # the app on http://localhost:3170
```
