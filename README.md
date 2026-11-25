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
**Sunday 22 November.** 10 pull requests merged, one of them Saturday's News. Settings now shows the real computer's last-seen time, kept live, and the app's own build version, where it showed the capture's. Two files of one message that share a name are numbered (1) and (2) on the live page, and a control that says it opens a menu now opens one. Gate A, which measures our screens against the oracle's, gained 48 cases on the Voice dialog scrolled to the top and 14 on a file waiting to send, after Settings gave up 4. [The full day](docs/news/2026-11-22.md)
- **In the app:** Settings shows the live computer and build; same-named files are numbered; no Invalid Date time row; Support and More no longer promise a menu ([#299](https://github.com/FRIKKern/barkbot/pull/299), [#306](https://github.com/FRIKKern/barkbot/pull/306), [#301](https://github.com/FRIKKern/barkbot/pull/301), [#298](https://github.com/FRIKKern/barkbot/pull/298))
- **Gate A:** the Voice dialog scrolled to the top 0 to 48 of 48; a file waiting to send 52 to 66 of 66 ([#307](https://github.com/FRIKKern/barkbot/pull/307), [#308](https://github.com/FRIKKern/barkbot/pull/308))
- **Checks:** every layer the app can show opens from the live page as a person opens it; CI runs the type check; scenes may not carry gate-only spacing ([#303](https://github.com/FRIKKern/barkbot/pull/303), [#304](https://github.com/FRIKKern/barkbot/pull/304), [#302](https://github.com/FRIKKern/barkbot/pull/302))

**Saturday 21 November.** 5 pull requests merged, one of them Friday's News. The account menu, the Connect Apps dialog and all four Settings pages now follow Grok Bot 1.2.3, and in those four pages every measured case passes. A conversation now shows a time row above a message sent an hour or more after the one before it, or on another day, from the messages' own times. Gate A, which measures our screens against the oracle's, passed 1,977 of 2,103 cases at the day's last merge, up from 1,522. [The full day](docs/news/2026-11-21.md)
- **Menus and Settings:** the account menu in three groups; Connect Apps and the four Settings pages as in 1.2.3, several of their buttons not working yet ([#281](https://github.com/FRIKKern/barkbot/pull/281), [#280](https://github.com/FRIKKern/barkbot/pull/280))
- **Conversation:** a time row above a message an hour or more after the last, or on another day; a file card stacks two files, and the details panel stays open under 800 wide ([#297](https://github.com/FRIKKern/barkbot/pull/297), [#295](https://github.com/FRIKKern/barkbot/pull/295))
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
