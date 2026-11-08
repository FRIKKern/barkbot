# Parity

[![Journeys: one tile per journey, one dot per parity item](images/journeys.svg)](../JOURNEYS.md)

0 of 32 items done, 0 partial, 13 open, 19 not yet read on the oracle.
Generated from [`parity/items.json`](../parity/items.json) by `npm run docs`. Edit the JSON, never this page.

## S0 Harness

| Id | Item | Journey | Status | Gate or evidence |
|---|---|---|---|---|
| H1 | Oracle access: headless Chrome with the owner's login copied from their tab, one lane at a time | — | ○ open | — |
| H2 | State capture: element boxes, tokens and labels to fixtures/states/<id>.json, dated | — | ○ open | — |
| H3 | Turn recorder: the oracle's DOM over time to traces/<id>.json | — | ○ open | — |
| H4 | Gate A: box and token diff, ours against the oracle, report in parity/gate-a.json | — | ○ open | — |
| H5 | Gate B: a recorded turn replayed in ours, report in parity/gate-b.json | — | ○ open | — |
| H6 | Inventory: every visible control, ours against the oracle, to docs/MISSING.md | — | ○ open | — |
| H7 | Feel budgets measured on the oracle and written in QUALITY.md | — | ○ open | — |

## S1 Talk

| Id | Item | Journey | Status | Gate or evidence |
|---|---|---|---|---|
| T1 | App shell: TanStack Start; the Barkpark token lives only in server functions | J01 | ○ open | — |
| T2 | Transcript: user and bot bubbles, grouping, the day and time line | J01 | ? unread | — |
| T3 | Working line: the bot's mark and what it is doing now | J01 | ? unread | — |
| T4 | Composer: attach, text, Enter sends, Shift+Enter breaks, focus after send | J01 | ? unread | — |
| T5 | Live reply from /v1/chat/sessions/:id/events | J01 | ○ open | — |
| T6 | A registered chat host on the owner's Mac runs real claude -p | J01 | ○ open | — |

## S2 Frame

| Id | Item | Journey | Status | Gate or evidence |
|---|---|---|---|---|
| F1 | Left rail: bots, the active one, badge, new chat, apps grid, my avatar | J02 | ? unread | — |
| F2 | Header: the bot's name pill, centred over the transcript | J02 | ? unread | — |
| F5 | Top bar: sidebar toggle and Share | J02 | ? unread | — |
| F3 | Right panel: mark, name, Activity and Library tabs, close | J03 | ? unread | — |
| F4 | Computer card: asleep, waking, working, read from the host heartbeat | J04 | ? unread | — |

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
| N3 | Suggested card: Add to Slack and Create a routine; each opens 1:1 and stops before acting outside the page | — | ? unread | — |
| N4 | Voice chat card: voice, speed and language pickers | — | ? unread | — |
