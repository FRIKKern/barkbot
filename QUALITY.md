# Quality

## The gates

| Gate | Compares | Passes when |
|---|---|---|
| A · Look | Each named element in each captured oracle state (rail, header, bubbles, working line, cards, composer, panel) against ours, at 1280, 1600 and 2000 px | Box within 1 px; color, radius, font size, weight and line height equal |
| B · Turn | A recorded oracle turn (what appears, in what order) against ours playing the same event script | Same element kinds, same order, same grouping into bubbles |
| C · Feel | Budgets measured on the oracle first | Within the budget below |
| Inventory | Every visible control and label in each oracle state against ours | Every gap is an item in `parity/items.json` or a named `outOfScope` entry |

Both sides run in headless Chrome. The oracle's DOM is watched over time with a MutationObserver, never its network. A gate run with zero cases fails. A change that lowers a pass count does not land.

## Feel budgets

Measured on the oracle in S0 (H7), then kept here: send to first visible change, scroll pinned while a reply arrives, Enter and Shift+Enter, focus after send, panel open and close.

## Oracle rules

| # | Rule |
|---|---|
| O1 | Read state, do one gesture, read state, leave. Never press Connect, Approve, Share, Add to Slack or Create a routine, and never answer a permission prompt: they act on the owner's real accounts. Probes use a throwaway bot or conversation. |
| O2 | Black box only. No Grok Bot JavaScript, CSS files, mascot or logo art, or font files in this repo; they get plain stand-ins of the same size. Everything else is recreated 1:1, labels included ([0005](docs/decisions/0005-recreate-first.md)). |
| O3 | Messages sent to the oracle are fixed recipes in `scripts/oracle/recipes.mjs`, never free typing. Each send uses the owner's allowance, so recapture only when a gate needs it. |
| O4 | An oracle change that breaks a gate is a finding: recapture, date it, never hide it. A capture older than 30 days is recaptured before it is trusted. |

## The bar

| Rule | Check |
|---|---|
| An item is done only with its gate and evidence named in `parity/items.json` | `npm run check` |
| An `outOfScope` entry names the decision that says so | `npm run check` |
| Generated pictures and `docs/PARITY.md` match their sources | `npm run check` |
| A journey is signed by someone other than its builder, naming the sha | criterion on the slice task |
| Doc caps are tightened, never raised | `npm run check` |

## Pace

| Rule | Why |
|---|---|
| Before landing, run only the checks for what changed; the full run after every few lands. Up to 5 small commits per land. | Full runs serialised lands and left agents idle |
| Review risky code only (tokens, the chat API client, anything that writes outside the app): one review, one re-check, then decide | Review found real bugs only there |
| Three agents at once, not four | A swapping 16 GB Mac failed tests that were fine |
| Each agent owns its worktree, port, dataset, chat host root and area of code; nothing shared in `/tmp` | Agents collided on names, temp files and data |
| Short turns, so a stop is read within minutes; commit work in progress early | Agents only read messages between turns |
| One lane owns the oracle at a time | One logged-in tab, one allowance |
