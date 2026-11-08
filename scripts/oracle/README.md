# The oracle

Grok Bot.app on the owner's Mac, watched through its own DevTools port ([0006](../../docs/decisions/0006-oracle-is-the-desktop-app.md)). While the port is open any program on this Mac can drive the logged-in app, so open it for a capture and close it after.

```sh
osascript -e 'tell application "Grok Bot" to quit'
open -a "Grok Bot" --args --remote-debugging-port=9333          # port open
node scripts/oracle/outline.mjs                                  # structure, text redacted
node scripts/oracle/capture.mjs <id> [--shot x.png]              # a state -> fixtures/states/<id>.json
ORACLE_BOT=Oracle node scripts/oracle/record.mjs say-hi          # a turn -> traces/
ORACLE_BOT=Oracle node scripts/oracle/feel.mjs [--only shift|send|panel]   # gate C budgets
node scripts/oracle/measure-text.mjs                             # our words in the oracle's font
osascript -e 'tell application "Grok Bot" to quit' && open -a "Grok Bot"   # port closed
```

Bring the app to the front (`open -a "Grok Bot"`) before anything timed: a hidden window does not paint. Rules ([QUALITY.md](../../QUALITY.md)): recipes only (O3); anything that sends refuses unless the open bot is the throwaway `Oracle` (O1); numbers and UI labels are stored, conversation text never (O2); the app's own code is never opened.
