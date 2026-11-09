# Parity

[![Journeys: one tile per journey, one dot per parity item](images/journeys.svg)](../JOURNEYS.md)

16 of 43 items done, 11 partial, 7 open, 9 not yet read on the oracle.
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
| H5 | Gate B: a recorded turn replayed in ours, report in parity/gate-b/<trace>.json | — | ✓ done | Gate: npm run gate:b (CI: gate.yml); 33/37 over 3 turns, a lower count fails. Evidence: scripts/gate-b.mjs plays traces/2026-11-08-{say-hi,say-hi-2,storage} through /gate-b/<trace> (server/replay.ts as Barkpark's runtime stream, the real hook and transcript); moments timed in-page. Proof it fails: the working line's exit delayed 100 -> 300 ms took it to 27/37 and --ci exited 1. |
| H9 | Gate A in CI: build the app and run npm run gate in headless Chrome on every pull request | — | ✓ done | Gate: GitHub Actions workflow gate (macos-15): node scripts/gate.mjs --ci. Evidence: Run 42534687321 on 100bb6c: green, every recorded count matched on a clean macOS runner. Red when a count drops or a captured state has no record. |
| T1 | App shell: TanStack Start; the Barkpark token lives only in server functions | J01 | ◐ partial | Evidence: app/src/server/barkpark.ts (server-only; token from .env or the owner's bp login); app/src/chat/api.ts loadChat/startChat/sendMessage; /api/chat/$id/events passes Barkpark's stream through. Browser bundle has no token code (build checked). Missing: a real turn end to end (T6). |
| T2 | Transcript: user and bot bubbles, grouping, the day and time line | J01 | ◐ partial | Evidence: app/src/components/Transcript.tsx: bubbles 15/22, 7x12, radius 18, max 480, user .18 / bot .04, +12 on a change of speaker, time row 12/16 (fixture articles 71-86); slide-in 12 pt 240 ms. Gate B (H5): own and reply bubbles land at the oracle's moments and group into the same bubbles on all 3 recorded turns (storage: two reply bubbles). The live path still waits on T6. |
| T3 | Working line: the bot's mark and what it is doing now | J01 | ◐ partial | Evidence: Working line in Transcript.tsx + styles.css: row 180 ms, mark 340 ms spring, label 180 ms (+220 ms first), shimmer steps(60) 2.2 s, face squash and tilt, exit 140 ms. Starts with the mark alone, like the oracle; "Typing…" while text streams (not for text that lands within a frame). Gate B: "replied" and the exit inside budget on 3 turns. Missing: the oracle's summary labels ("Saying hello", "Checking system storage") need host events: task-f13fc4b4dc2af6de; and in the storage turn the oracle shows the row 0.8 s after "is working", ours at once. |
| T4 | Composer: attach, text, Enter sends, Shift+Enter breaks, focus after send | J01 | ◐ partial | Evidence: app/src/components/Composer.tsx: Enter sends and clears at once, Shift+Enter adds a line, focus stays in Prompt, the voice button turns into Send while there is a draft (200 ms, scale .5). Attach is S4. |
| T5 | Live reply from /v1/chat/sessions/:id/events | J01 | ◐ partial | Evidence: useConversation.ts reads event: message (history), event: chat (claude frames, managed) and event: runtime (registered host). Runtime path replayed by Gate B (H5): a second turn_started in a turn lands the text before it as its own bubble (it was dropped). Not yet seen live: no host enrolled. |
| T6 | A registered chat host on the owner's Mac runs real claude -p | J01 | ○ open | Evidence: npm run host:enroll / npm run host (scripts/host.sh): one locked folder ~/BarkBot/home, claude in plan mode. Enrollment is owner-only: the owner issues it in Studio > Chat hosts. |

## S2 Frame

| Id | Item | Journey | Status | Gate or evidence |
|---|---|---|---|---|
| F1 | Left rail: bots, the active one, badge, new chat, apps grid, my avatar | J02 | ✓ done | Gate: Gate A: aside Bots, both Bot tiles, New Bot, Connect apps, Open account menu pass in all five frame states; hover: oracle-hover-new-bot 2/2, -connect-apps 2/2, -open-account-menu 1/1, -bot-tile-2 1/1 (tooltips and the chat preview). Evidence: Rail.tsx + rail.css; parity/gate-a/oracle-{turn-1040,main-1280,main-1600,panel-closed,library}.json; hover looks in rail.css, tooltips and the bot's chat preview in tips.tsx (preview card, its inner block, name and line on the fixture's boxes to 0.4 pt; its line is placeholder text, O2) |
| F2 | Header: the bot's name pill, centred over the transcript | J02 | ✓ done | Gate: Gate A: View conversation details and span Oracle pass at 1040, 1280, 1600 and with the panel closed. Evidence: Shell.tsx + convo.css; parity/gate-a/oracle-{turn-1040,main-1280,main-1600,panel-closed}.json |
| F3 | Right panel: mark, name, Activity and Library tabs, close | J03 | ✓ done | Gate: Gate A: Close, Edit Bot avatar, Bot name, Activity, Library pass in oracle-turn-1040 (39/39) and oracle-library (20/20); hover: oracle-hover-close, -bot-name, -edit-bot-avatar (Edit Avatar tooltip), -library, -bot-s-computer, -voice, -speed, -language all pass. Evidence: Details.tsx + details.css; name field 10 pt side padding matches the oracle's 74.2 pt field for 'Oracle'; parity/gate-a/oracle-turn-1040.json; hover looks in details.css, the Edit Avatar tooltip in tips.tsx |
| F4 | Computer card: asleep (zzz, breathing), waking up, unreachable, working; read from the host heartbeat | J04 | ◐ partial | Gate: Gate A: Bot's computer and Asleep pass in oracle-turn-1040. Evidence: Details.tsx; only the asleep state is captured. Left: waking up, unreachable, working, the breathing zzz, and the host heartbeat |
| F5 | Top bar: Share (the sidebar toggle shows on hover; not in the captured state) | J02 | ◐ partial | Gate: Gate A: Share (control and label) passes in all five frame states. Evidence: Shell.tsx + convo.css. Left: the sidebar toggle shows on hover, which no capture holds yet |
| F6 | Stand-in font picked by measured widths: Gate A's last misses are Inter running 1-3 pt wider than the oracle's own font | — | ✓ done | Gate: npm run gate (2026-11-09): oracle-turn-1040 39/39, oracle-library 20/20, oracle-main-1280 35/39, oracle-main-1600 35/39, oracle-panel-closed 10/14; every miss left is the composer's width. Evidence: 41 oracle widths (fixtures/states/*, fixtures/text-metrics.json) measured in 36 faces in headless Chrome: the macOS system face (SF Pro) runs 0.52 pt off on average after tracking, Inter 0.70 and 2.88 raw; base.css sets BlinkMacSystemFont, -apple-system, Inter fallback. Three fixed words keep their own tracking (parts.tsx FIT) where SF still runs 1.2-1.6 pt off. No oracle font file read or shipped (O2) |
| F7 | Composer actions menu: Attach files, Teach a task (oracle-composer-menu) | — | ✓ done | Gate: Gate A oracle-composer-menu 43/43. Evidence: app/src/components/overlays/Menus.tsx, styles/overlays.css; opens from the + button, closes on a pick, Escape or a click outside. Attach files and Teach a task look and open 1:1 and stop there until a decision wires them (0005). |
| F8 | Account menu: Weekly usage, Get Grok Bot for mobile, Support, Settings, Add account, Log out (oracle-account-menu); each row's target is its own item | — | ◐ partial | Gate: Gate A oracle-account-menu 50/52: Weekly usage and 12% used are 1.4 pt off on text width (the font stand-in measures "12% used" wider). Evidence: app/src/components/overlays/Menus.tsx; opens from the account button. Left: the usage line is the captured 12% (data.ts), and every row's target is its own item. |
| F9 | Library tab: the empty state 'Pages, files, and apps this Bot makes show up here' (oracle-library) | J03 | ✓ done | Gate: Gate A: oracle-library 20/20. The panel's unnamed elements (not Gate A cases) measured box by box with scripts/oracle/collect.mjs against fixtures/states/oracle-library.json elements 212-221: every box in the tab panel equal to 0.1 pt, every look equal. Evidence: Details.tsx + details.css. Matched: tab panel 217 at 736,329.6,288,414.4; empty state 218 at 736,339.6,288,72; its inner block 219 at 752,339.6,256,72; text 220 at 752,355.6,256,40 (14/20, 54% ink); rule 221 at 736,433.6,288,1; tab fade 216 at 720,229,320,12; tabs row 212 exact, tabs within 1.3 pt (font). The 100.6 pt drop is the oracle's settled layout (recaptured with a 3 s settle, 2026-11-09) |
| F10 | Every captured width matches: 1040, 1280, 1600 (oracle-main-*) | J02 | ✓ done | Gate: Gate A: oracle-main-1280 39/39, oracle-main-1600 39/39, oracle-panel-closed 14/14, oracle-turn-1040 39/39. Evidence: Every frame case passes at every captured width. The composer is the main column less 16 each side, up to 960 (#3). The 1280 capture had held a hovered Composer actions; recaptured 2026-11-09 with the pointer parked (sweep park()), it reads like the other widths. |
| F11 | Connect Apps view: header with the connected count, Your plugins, Bot templates, category filters, Recommended for you with each app's Open and Connect (oracle-connect-apps). Look only: Connect and Open act outside the page and are their own items | — | ○ open | — |
| F12 | Bot avatar editor: Bot, Generate, Upload, Reset character to default (oracle-edit-avatar). Look only: Generate and Upload change the bot and are their own items | — | ○ open | — |
| F13 | Settings, General page: General, Computer, Permissions, Vault, Usage & Billing, Updates; Account (name and e-mail are the owner's: lengths only), Add account, Sign Out; Appearance; Spelling; Microphone (oracle-settings). Look only | — | ○ open | — |

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
| N3 | Suggested card: Add to Slack and Create a routine; each opens 1:1 and stops before acting outside the page; its Hide button shows while the pointer is over the window (oracle-hover-*) | — | ◐ partial | Gate: Gate A: oracle-hover-add-to-slack 1/1, oracle-hover-create-a-routine 1/1; Hide measured against oracle-hover-add-to-slack (button 979.5,236,38.5,24) to 0.2 pt. Evidence: parts.tsx Section action + details.css: Hide shows while the pointer is over the window (:root:hover), hidden in every parked state. Left: Add to Slack and Create a routine opening 1:1 and stopping before acting outside the page, and what Hide does |
| N4 | Voice chat card: voice, speed and language pickers | — | ◐ partial | Gate: Gate A oracle-voice-picker 71/71, oracle-speed-picker 45/45, oracle-language-picker 56/56. Evidence: app/src/components/overlays/Pickers.tsx; each opens 4 pt above its row with the row's value checked, a pick closes it. Left: 12 more voices and 12 more languages need a capture scrolled to the end; a pick does not yet change the row (Details owns the value); preview buttons play nothing. |
| N5 | Create New Bot dialog: name, 13 shapes, 11 colours, Cancel and Create (Create stays disabled until named) | J12 | ◐ partial | Gate: Gate A oracle-new-bot-dialog 43/45 (Cancel 1.1 pt off on text width), oracle-new-bot-named 2/2 (Create's enabled look). Evidence: app/src/components/overlays/NewBotDialog.tsx; opens from New Bot; shape and colour pick, Create disabled until named, Close and Cancel close. Left: the shapes are plain stand-ins (O2), and Create makes nothing yet. |
