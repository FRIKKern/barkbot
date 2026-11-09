# Parity

[![Journeys: one tile per journey, one dot per parity item](images/journeys.svg)](../JOURNEYS.md)

14 of 40 items done, 7 partial, 8 open, 11 not yet read on the oracle.
Generated from [`parity/items/`](../parity/items/) by `npm run docs`. Edit an item file, never this page.

## S0 Harness

| Id | Item | Journey | Status | Gate or evidence |
|---|---|---|---|---|
| H1 | Oracle access: Grok Bot.app on the owner's Mac, watched over its own local DevTools port, one lane at a time | — | ✓ done | Gate: recipes guard + 4 recorded recipes. Evidence: Grok Bot.app relaunched with --remote-debugging-port=9333 (127.0.0.1); decision 0006; the send guard refused Grookie |
| H2 | State capture: element boxes, tokens and labels to fixtures/states/<id>.json, dated | — | ✓ done | Gate: capture.mjs writes a dated state; Gate A reads it (27/39). Evidence: scripts/oracle/capture.mjs + collect.mjs -> fixtures/states/oracle-turn-1040.json (289 elements); measure-text.mjs control 0 px. More widths come with S2. |
| H3 | Turn recorder: the oracle's DOM over time to traces/<id>.json | — | ✓ done | Gate: traces carry DOM order, engine animations with keyframes, and per-frame samples of scripted motion. Evidence: scripts/oracle/record.mjs, feel.mjs; traces/2026-11-08-storage.json, -say-hi.json, -mark.json. Limit: layout shifts need the app in front (0006). |
| H4 | Gate A: box and look diff, ours against the oracle, report in parity/gate-a.json | — | ✓ done | Gate: npm run gate: 27/39 on oracle-turn-1040; zero cases fails; a lower count fails unless --accept. Evidence: scripts/gate.mjs + scripts/oracle/collect.mjs (one instrument both sides) + app/src/routes/gate.$state.tsx; parity/gate-a.json |
| H6 | Inventory: every visible control, ours against the oracle, to parity/inventory.json; each control belongs to an item (controls) | — | ✓ done | Gate: npm run check (every oracle control claimed by an item); npm run gate (ours has 21/21). Evidence: scripts/lib/controls.mjs, parity/inventory.json, controls on F1 F2 F3 F4 F5 T4 N3 N4 |
| H7 | Feel budgets measured on the oracle and written in QUALITY.md | — | ✓ done | Gate: QUALITY.md feel budgets table. Evidence: traces/2026-11-08-feel.json, -feel-shift.json, -feel-panel.json, -storage.json, -say-hi.json |
| H8 | Hero motion: the guessed TIMING in scripts/generate-hero.mjs replaced by the oracle's recorded turn | — | ✓ done | Gate: npm run check (hero fresh), seam diff under 1 px. Evidence: scripts/generate-hero.mjs draws rail, header, transcript, composer and panel from fixtures/states/oracle-turn-1040.json; text held to oracle-measured widths; motion from traces/2026-11-08-*.json. Region diff vs the live capture: rail 1.4%, header 0.9%, composer 1.4%, panel 1.3%. |

## S1 Talk

| Id | Item | Journey | Status | Gate or evidence |
|---|---|---|---|---|
| H5 | Gate B: a recorded turn replayed in ours (needs the S1 transcript), report in parity/gate-b.json | — | ○ open | — |
| H9 | Gate A in CI: build the app and run npm run gate in headless Chrome on every pull request | — | ✓ done | Gate: GitHub Actions workflow gate (macos-15): node scripts/gate.mjs --ci. Evidence: Run 42534687321 on 100bb6c: green, every recorded count matched on a clean macOS runner. Red when a count drops or a captured state has no record. |
| T1 | App shell: TanStack Start; the Barkpark token lives only in server functions | J01 | ◐ partial | Evidence: app/src/server/barkpark.ts (server-only; token from .env or the owner's bp login); app/src/chat/api.ts loadChat/startChat/sendMessage; /api/chat/$id/events passes Barkpark's stream through. Browser bundle has no token code (build checked). Missing: a real turn end to end (T6). |
| T2 | Transcript: user and bot bubbles, grouping, the day and time line | J01 | ◐ partial | Evidence: app/src/components/Transcript.tsx: bubbles 15/22, 7x12, radius 18, max 480, user .18 / bot .04, +12 on a change of speaker, time row 12/16 (fixture articles 71-86); slide-in 12 pt 240 ms. Not yet gated: Gate B (H5) needs a live turn. |
| T3 | Working line: the bot's mark and what it is doing now | J01 | ◐ partial | Evidence: Working line in Transcript.tsx + styles.css: row 180 ms, mark 340 ms spring, label 180 ms (+220 ms first), shimmer steps(60) 2.2 s, face squash and tilt, exit 140 ms. Labels: Thinking, Typing…, a tool's own description. The oracle's summary labels ("Checking system storage") need tool events from the host: task-f13fc4b4dc2af6de. |
| T4 | Composer: attach, text, Enter sends, Shift+Enter breaks, focus after send | J01 | ◐ partial | Evidence: app/src/components/Composer.tsx: Enter sends and clears at once, Shift+Enter adds a line, focus stays in Prompt, the voice button turns into Send while there is a draft (200 ms, scale .5). Attach is S4. |
| T5 | Live reply from /v1/chat/sessions/:id/events | J01 | ◐ partial | Evidence: useConversation.ts reads event: message (history), event: chat (claude frames, managed) and event: runtime (registered host). Not yet seen live: no host enrolled. |
| T6 | A registered chat host on the owner's Mac runs real claude -p | J01 | ○ open | Evidence: npm run host:enroll / npm run host (scripts/host.sh): one locked folder ~/BarkBot/home, claude in plan mode. Enrollment is owner-only: the owner issues it in Studio > Chat hosts. |

## S2 Frame

| Id | Item | Journey | Status | Gate or evidence |
|---|---|---|---|---|
| F1 | Left rail: bots, the active one, badge, new chat, apps grid, my avatar | J02 | ✓ done | Gate: Gate A: aside Bots, both Bot tiles, New Bot, Connect apps, Open account menu pass in all five frame states. Evidence: Rail.tsx + rail.css; parity/gate-a/oracle-{turn-1040,main-1280,main-1600,panel-closed,library}.json |
| F2 | Header: the bot's name pill, centred over the transcript | J02 | ✓ done | Gate: Gate A: View conversation details and span Oracle pass at 1040, 1280, 1600 and with the panel closed. Evidence: Shell.tsx + convo.css; parity/gate-a/oracle-{turn-1040,main-1280,main-1600,panel-closed}.json |
| F3 | Right panel: mark, name, Activity and Library tabs, close | J03 | ✓ done | Gate: Gate A: Close, Edit Bot avatar, Bot name, Activity, Library pass in oracle-turn-1040 (39/39) and oracle-library (20/20). Evidence: Details.tsx + details.css; name field 10 pt side padding matches the oracle's 74.2 pt field for 'Oracle'; parity/gate-a/oracle-turn-1040.json |
| F4 | Computer card: asleep (zzz, breathing), waking up, unreachable, working; read from the host heartbeat | J04 | ◐ partial | Gate: Gate A: Bot's computer and Asleep pass in oracle-turn-1040. Evidence: Details.tsx; only the asleep state is captured. Left: waking up, unreachable, working, the breathing zzz, and the host heartbeat |
| F5 | Top bar: Share (the sidebar toggle shows on hover; not in the captured state) | J02 | ◐ partial | Gate: Gate A: Share (control and label) passes in all five frame states. Evidence: Shell.tsx + convo.css. Left: the sidebar toggle shows on hover, which no capture holds yet |
| F6 | Stand-in font picked by measured widths: Gate A's last misses are Inter running 1-3 pt wider than the oracle's own font | — | ✓ done | Gate: npm run gate (2026-11-09): oracle-turn-1040 39/39, oracle-library 20/20, oracle-main-1280 35/39, oracle-main-1600 35/39, oracle-panel-closed 10/14; every miss left is the composer's width. Evidence: 41 oracle widths (fixtures/states/*, fixtures/text-metrics.json) measured in 36 faces in headless Chrome: the macOS system face (SF Pro) runs 0.52 pt off on average after tracking, Inter 0.70 and 2.88 raw; base.css sets BlinkMacSystemFont, -apple-system, Inter fallback. Three fixed words keep their own tracking (parts.tsx FIT) where SF still runs 1.2-1.6 pt off. No oracle font file read or shipped (O2) |
| F7 | Composer actions menu: Attach files, Teach a task (oracle-composer-menu) | — | ○ open | — |
| F8 | Account menu: Weekly usage, Get Grok Bot for mobile, Support, Settings, Add account, Log out (oracle-account-menu); each row's target is its own item | — | ○ open | — |
| F9 | Library tab: the empty state 'Pages, files, and apps this Bot makes show up here' (oracle-library) | J03 | ✓ done | Gate: Gate A: oracle-library 20/20. The panel's unnamed elements (not Gate A cases) measured box by box with scripts/oracle/collect.mjs against fixtures/states/oracle-library.json elements 212-221: every box in the tab panel equal to 0.1 pt, every look equal. Evidence: Details.tsx + details.css. Matched: tab panel 217 at 736,329.6,288,414.4; empty state 218 at 736,339.6,288,72; its inner block 219 at 752,339.6,256,72; text 220 at 752,355.6,256,40 (14/20, 54% ink); rule 221 at 736,433.6,288,1; tab fade 216 at 720,229,320,12; tabs row 212 exact, tabs within 1.3 pt (font). The 100.6 pt drop is the oracle's settled layout (recaptured with a 3 s settle, 2026-11-09) |
| F10 | Every captured width matches: 1040, 1280, 1600 (oracle-main-*) | J02 | ✓ done | Gate: Gate A: oracle-main-1280 39/39, oracle-main-1600 39/39, oracle-panel-closed 14/14, oracle-turn-1040 39/39. Evidence: Every frame case passes at every captured width. The composer is the main column less 16 each side, up to 960 (#3). The 1280 capture had held a hovered Composer actions; recaptured 2026-11-09 with the pointer parked (sweep park()), it reads like the other widths. |

## S3 Control

| Id | Item | Journey | Status | Gate or evidence |
|---|---|---|---|---|
| C1 | Cancel a reply: it stops at once and nothing is left running | J05 | ? unread | — |
| C2 | Come back later: transcript and Claude session resume after a restart | J06 | ○ open | — |

## S4 Things

| Id | Item | Journey | Status | Gate or evidence |
|---|---|---|---|---|
| A1 | File card: name and size, readable by the bot | J07 | ? unread | — |
| A2 | Picture grid with a +N tile; each opens large | J08 | ? unread | — |
| A3 | Library: what the bot saved, newest first | J09 | ? unread | — |

## S5 Ask

| Id | Item | Journey | Status | Gate or evidence |
|---|---|---|---|---|
| Q1 | Approval card: nothing happens until I press | J10 | ? unread | — |
| Q2 | Question card with lettered choices | J11 | ? unread | — |
| Q3 | Activity: open work such as a pull request and its state | J13 | ? unread | — |

## S6 Own computer

| Id | Item | Journey | Status | Gate or evidence |
|---|---|---|---|---|
| V1 | The bot's host moves to its own VM; J01, J05 and J06 pass there | — | ○ open | — |
| V2 | The Claude token never reaches Barkpark: grep of DB and logs is empty | — | ○ open | — |

## S7 Hello

| Id | Item | Journey | Status | Gate or evidence |
|---|---|---|---|---|
| N1 | First run: greeting, naming, a 'Renamed to' line | J12 | ? unread | — |
| N2 | Message actions on hover | — | ? unread | — |
| N3 | Suggested card: Add to Slack and Create a routine; each opens 1:1 and stops before acting outside the page; its Hide button shows while the pointer is over the window (oracle-hover-*) | — | ? unread | — |
| N4 | Voice chat card: voice, speed and language pickers | — | ? unread | — |
| N5 | Create New Bot dialog: name, 13 shapes, 11 colours, Cancel and Create (Create stays disabled until named) | J12 | ○ open | — |
