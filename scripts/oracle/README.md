# The oracle

Grok Bot.app on the owner's Mac, watched through its own Chrome DevTools port. Only one copy can run, so the owner's app is restarted with the port while capturing and restarted plainly afterwards: while the port is open, any program on this Mac can drive the logged-in app.

```sh
osascript -e 'tell application "Grok Bot" to quit'
open -a "Grok Bot" --args --remote-debugging-port=9333     # capture
node scripts/oracle/outline.mjs                            # structure, text redacted
ORACLE_BOT=Oracle node scripts/oracle/record.mjs say-hi    # one recorded turn
osascript -e 'tell application "Grok Bot" to quit' && open -a "Grok Bot"   # done: port closed
```

Rules ([QUALITY.md](../../QUALITY.md)): recipes only (O3); anything that sends refuses unless the open bot is the throwaway `Oracle` (O1); numbers and UI labels are stored, conversation text never (O2); the app's own code in `app.asar` is never opened.
