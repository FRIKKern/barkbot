# 0006 The oracle is the desktop app, watched over its own DevTools port

Date: 2026-11-08 · Status: accepted · Supersedes in part: [0001](0001-black-box-oracle.md) (the owner's tab, headless Chrome with a copied login)

```
Grok Bot.app (owner's Mac) ──restart with --remote-debugging-port=9333──► 127.0.0.1 only
   scripts/oracle/*  ── CDP over Node's own WebSocket ──► fixtures/, traces/
   done ──restart plainly──► port closed
```

## Context

0001 planned to read Grok Bot in a browser tab through headless Chrome, with the owner's login copied in. Grok Bot is an Electron app on the owner's Mac. It allows one copy at a time and ignores a second profile, so there is no tab to copy and no second instance to drive.

## Decision

The oracle is the owner's own Grok Bot.app. To capture, it is restarted with a DevTools port on 127.0.0.1; afterwards it is restarted without one. While the port is open any program on the Mac could drive the logged-in app, so it stays open only for a capture. Probes run in a throwaway bot named Oracle, and anything that sends refuses in any other bot (O1). The rest of 0001 stands: watch, never copy code, art or fonts.

Three findings from doing it:

- A hidden window does not paint. Frame-by-frame timing needs the app in front for the seconds it records.
- The engine's Animation domain sees CSS and Web Animations, not script that moves things each frame (the working face). Those are sampled per frame.
- The transcript keeps only what is on screen. Counting bubbles is no instrument; read the draft or the store instead.

## Considered

- **A second Grok Bot instance with its own profile.** Not possible: the single-instance lock wins.
- **Screenshots only.** Rejected for the reasons in 0001.
