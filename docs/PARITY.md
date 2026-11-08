# Parity

[![Journeys: one tile per journey, one dot per parity item](images/journeys.svg)](../JOURNEYS.md)

7 of 40 items done, 5 partial, 12 open, 16 not yet read on the oracle.
Generated from [`parity/items.json`](../parity/items.json) by `npm run docs`. Edit the JSON, never this page.

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
| T1 | App shell: TanStack Start; the Barkpark token lives only in server functions | J01 | ◐ partial | Evidence: app/src/server/barkpark.ts (server-only; token from .env or the owner's bp login); app/src/chat/api.ts loadChat/startChat/sendMessage; /api/chat/$id/events passes Barkpark's stream through. Browser bundle has no token code (build checked). Missing: a real turn end to end (T6). |
| T2 | Transcript: user and bot bubbles, grouping, the day and time line | J01 | ◐ partial | Evidence: app/src/components/Transcript.tsx: bubbles 15/22, 7x12, radius 18, max 480, user .18 / bot .04, +12 on a change of speaker, time row 12/16 (fixture articles 71-86); slide-in 12 pt 240 ms. Not yet gated: Gate B (H5) needs a live turn. |
| T3 | Working line: the bot's mark and what it is doing now | J01 | ◐ partial | Evidence: Working line in Transcript.tsx + styles.css: row 180 ms, mark 340 ms spring, label 180 ms (+220 ms first), shimmer steps(60) 2.2 s, face squash and tilt, exit 140 ms. Labels: Thinking, Typing…, a tool's own description. The oracle's summary labels ("Checking system storage") need tool events from the host: task-f13fc4b4dc2af6de. |
| T4 | Composer: attach, text, Enter sends, Shift+Enter breaks, focus after send | J01 | ◐ partial | Evidence: app/src/components/Composer.tsx: Enter sends and clears at once, Shift+Enter adds a line, focus stays in Prompt, the voice button turns into Send while there is a draft (200 ms, scale .5). Attach is S4. |
| T5 | Live reply from /v1/chat/sessions/:id/events | J01 | ◐ partial | Evidence: useConversation.ts reads event: message (history), event: chat (claude frames, managed) and event: runtime (registered host). Not yet seen live: no host enrolled. |
| T6 | A registered chat host on the owner's Mac runs real claude -p | J01 | ○ open | Evidence: npm run host:enroll / npm run host (scripts/host.sh): one locked folder ~/BarkBot/home, claude in plan mode. Enrollment is owner-only: the owner issues it in Studio > Chat hosts. |
| H5 | Gate B: a recorded turn replayed in ours (needs the S1 transcript), report in parity/gate-b.json | — | ○ open | — |
| H9 | Gate A in CI: build the app and run npm run gate in headless Chrome on every pull request | — | ○ open | — |

## S2 Frame

| Id | Item | Journey | Status | Gate or evidence |
|---|---|---|---|---|
| F1 | Left rail: bots, the active one, badge, new chat, apps grid, my avatar | J02 | ? unread | — |
| F2 | Header: the bot's name pill, centred over the transcript | J02 | ? unread | — |
| F5 | Top bar: Share (the sidebar toggle shows on hover; not in the captured state) | J02 | ? unread | — |
| F6 | Stand-in font picked by measured widths: Gate A's last misses are Inter running 1-3 pt wider than the oracle's own font | — | ○ open | — |
| F7 | Composer actions menu: Attach files, Teach a task (oracle-composer-menu) | — | ○ open | — |
| F8 | Account menu: Weekly usage, Get Grok Bot for mobile, Support, Settings, Add account, Log out (oracle-account-menu); each row's target is its own item | — | ○ open | — |
| F9 | Library tab: the empty state 'Pages, files, and apps this Bot makes show up here' (oracle-library) | J03 | ○ open | — |
| F10 | Every captured width matches: 1040, 1280, 1600 (oracle-main-*) | J02 | ○ open | — |
| F3 | Right panel: mark, name, Activity and Library tabs, close | J03 | ? unread | — |
| F4 | Computer card: asleep (zzz, breathing), waking up, unreachable, working; read from the host heartbeat | J04 | ? unread | — |

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
| N5 | Create New Bot dialog: name, 13 shapes, 11 colours, Cancel and Create (Create stays disabled until named) | J12 | ○ open | — |
| N2 | Message actions on hover | — | ? unread | — |
| N3 | Suggested card: Add to Slack and Create a routine; each opens 1:1 and stops before acting outside the page | — | ? unread | — |
| N4 | Voice chat card: voice, speed and language pickers | — | ? unread | — |
