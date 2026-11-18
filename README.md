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
**Tuesday 17 November.** 25 pull requests merged, most of them making the many-bots code safe when a send, a Create or a rename gets no answer. A message sent again after a lost answer now runs once, and a rename and a new chat each save their own field of a bot's record. Create finishes the same bot when Barkpark did not answer, and never writes over a record another tab made. The rail shows the Main Bot in its own slot, with its badge. [The full day](docs/news/2026-11-17.md)
- **Sending:** a resend after a lost answer carries the same key and runs once; words of a failed send come back first, beside what was typed since; a first message whose conversation does not open in 10 s comes back with a not-sent line ([#107](https://github.com/FRIKKern/barkbot/pull/107), [#80](https://github.com/FRIKKern/barkbot/pull/80), [#89](https://github.com/FRIKKern/barkbot/pull/89), [#208](https://github.com/FRIKKern/barkbot/pull/208), [#76](https://github.com/FRIKKern/barkbot/pull/76))
- **Bots:** rename and new chat set their own field; Create writes only an unset key and a second Create finishes a bot whose save got no answer; the 50-bot cap counts bots that show; the Main Bot sits in the main slot ([#90](https://github.com/FRIKKern/barkbot/pull/90), [#191](https://github.com/FRIKKern/barkbot/pull/191), [#200](https://github.com/FRIKKern/barkbot/pull/200), [#81](https://github.com/FRIKKern/barkbot/pull/81), [#82](https://github.com/FRIKKern/barkbot/pull/82), [#171](https://github.com/FRIKKern/barkbot/pull/171))
- **Pictures and files:** a sent picture never comes back into the box; past four, all stay and Enter sends nothing; a file that cannot be read is named once and the rest are added ([#138](https://github.com/FRIKKern/barkbot/pull/138), [#154](https://github.com/FRIKKern/barkbot/pull/154), [#150](https://github.com/FRIKKern/barkbot/pull/150), [#165](https://github.com/FRIKKern/barkbot/pull/165), [#206](https://github.com/FRIKKern/barkbot/pull/206))

**Monday 16 November.** 15 pull requests merged, most of them closing gaps in the new many-bots code. Each bot you make now works in its own folder on its computer (bot- plus the first 8 characters of its id), and the Main Bot keeps the shared one. Switching bots while a new bot's first message is still opening no longer loses that message: it goes once, to the bot it was written to, or stays in that bot's box with a line saying whether it may have gone. A failed send keeps its words, and a hung Barkpark read costs a page 8 s instead of the whole load. [The full day](docs/news/2026-11-16.md)
- **Bot folders:** a made bot asks for its own folder; the Main Bot never takes over a conversation that has one; Create picks another id when a bot's folder is taken ([#62](https://github.com/FRIKKern/barkbot/pull/62), [#64](https://github.com/FRIKKern/barkbot/pull/64), [#66](https://github.com/FRIKKern/barkbot/pull/66))
- **Switching bots:** a pick or a Create while a first message is opening sends it once or keeps its words; the last click wins, and the rail and the page agree ([#63](https://github.com/FRIKKern/barkbot/pull/63), [#67](https://github.com/FRIKKern/barkbot/pull/67), [#75](https://github.com/FRIKKern/barkbot/pull/75), [#79](https://github.com/FRIKKern/barkbot/pull/79))
- **When things fail:** a failed send keeps its words and says whether it may have gone; a hung read gives up after 8 s; a rename and a new chat at once both stay; the online dot shows the open bot's own computer ([#69](https://github.com/FRIKKern/barkbot/pull/69), [#70](https://github.com/FRIKKern/barkbot/pull/70), [#74](https://github.com/FRIKKern/barkbot/pull/74), [#72](https://github.com/FRIKKern/barkbot/pull/72), [#73](https://github.com/FRIKKern/barkbot/pull/73))
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
