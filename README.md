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
**Monday 16 November.** 15 pull requests merged, most of them closing gaps in the new many-bots code. Each bot you make now works in its own folder on its computer (bot- plus the first 8 characters of its id), and the Main Bot keeps the shared one. Switching bots while a new bot's first message is still opening no longer loses that message: it goes once, to the bot it was written to, or stays in that bot's box with a line saying whether it may have gone. A failed send keeps its words, and a hung Barkpark read costs a page 8 s instead of the whole load. [The full day](docs/news/2026-11-16.md)
- **Bot folders:** a made bot asks for its own folder; the Main Bot never takes over a conversation that has one; Create picks another id when a bot's folder is taken ([#62](https://github.com/FRIKKern/barkbot/pull/62), [#64](https://github.com/FRIKKern/barkbot/pull/64), [#66](https://github.com/FRIKKern/barkbot/pull/66))
- **Switching bots:** a pick or a Create while a first message is opening sends it once or keeps its words; the last click wins, and the rail and the page agree ([#63](https://github.com/FRIKKern/barkbot/pull/63), [#67](https://github.com/FRIKKern/barkbot/pull/67), [#75](https://github.com/FRIKKern/barkbot/pull/75), [#79](https://github.com/FRIKKern/barkbot/pull/79))
- **When things fail:** a failed send keeps its words and says whether it may have gone; a hung read gives up after 8 s; a rename and a new chat at once both stay; the online dot shows the open bot's own computer ([#69](https://github.com/FRIKKern/barkbot/pull/69), [#70](https://github.com/FRIKKern/barkbot/pull/70), [#74](https://github.com/FRIKKern/barkbot/pull/74), [#72](https://github.com/FRIKKern/barkbot/pull/72), [#73](https://github.com/FRIKKern/barkbot/pull/73))

**Sunday 15 November.** BarkBot went from one bot to many. Press Create, type a name, and a new bot appears in the rail (the list of bots down the left) with its own empty conversation; it is still there after a reload. Each bot is its own record in Barkpark, keyed by an id, so two bots called the same stay two bots. A fresh review passed the last step with 81 of 81 behaviour rules and found two snags, now filed: picking another bot while a new bot's first message is opening loses that message, and making a bot took up to 1.13 s against a 1.15 s limit. [The full day](docs/news/2026-11-15.md)
- **Many bots:** Create makes a named bot with its own conversation; bots are known by id and stored per account; picking a bot shows its own conversation, and the Working and Unread marks land on the right bot ([#58](https://github.com/FRIKKern/barkbot/pull/58), [#59](https://github.com/FRIKKern/barkbot/pull/59), [#60](https://github.com/FRIKKern/barkbot/pull/60), [#61](https://github.com/FRIKKern/barkbot/pull/61))
- **Files:** the composer takes text files and PDFs, and the sent message keeps its file card after a reload; in a live run the bot read a text file and a PDF; a file card shows "25B" for 25 bytes, as Grok Bot does ([#55](https://github.com/FRIKKern/barkbot/pull/55), [#56](https://github.com/FRIKKern/barkbot/pull/56))
- **What is left:** the parity list (every part of Grok Bot, the app BarkBot recreates, and whether ours matches) now says only what is truly missing; four more items are done ([#57](https://github.com/FRIKKern/barkbot/pull/57))
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
