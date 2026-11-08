# Journeys

The spec of "works". Each journey runs on the oracle and on BarkBot, and passes when both end the same way. Ids are never removed or reused. Nobody signs off their own journey.

```
oracle (Grok Bot) ─► read state, one gesture, read state ─► traces/<id>.json
BarkBot           ─► the same gesture, real Barkpark, real claude ─► same result? pass
```

| Id | Slice | Journey | Proof |
|---|---|---|---|
| J01 | S1 | Send a message. A working line with the bot's mark shows, then the reply arrives in one or more bubbles. | Gate A, Gate B |
| J02 | S2 | The left rail shows my bots and the active one; new chat, the apps grid and my avatar sit at the bottom. | Gate A |
| J03 | S2 | The right panel opens and closes: mark, name, Activity and Library tabs, its cards. | Gate A |
| J04 | S2 | The Computer card tells the truth: asleep, waking or working. | Gate A, host stopped and started |
| J05 | S3 | Cancel a running reply. It stops at once and the machine has nothing left running. | Gate B, `pgrep` on the host |
| J06 | S3 | Close everything and come back: the conversation is there and the bot remembers it. | restart, then a follow-up |
| J07 | S4 | Attach a file with +. It shows as a card with name and size, and the bot can read it. | Gate A, the bot quotes it |
| J08 | S4 | The bot replies with pictures: a grid with a +N tile, each opens large. | Gate A |
| J09 | S4 | Library lists what the bot saved, newest first. | Gate A |
| J10 | S5 | The bot asks before acting; nothing happens until I press. | Gate B, no side effect before the press |
| J11 | S5 | The bot asks a question with lettered choices; picking one answers it. | Gate A, Gate B |
| J12 | S7 | First run: the bot greets me and I name it; a "Renamed to …" line marks it. | Gate B |
| J13 | S5 | Activity shows the bot's open work, such as a pull request and its state. | Gate A |
