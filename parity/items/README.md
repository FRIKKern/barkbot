# Items

One file per parity item, `<id>.json`, so lanes that change different items never touch the same file ([0007](../../docs/decisions/0007-one-file-per-item-and-state.md)).

Fields: `id`, `slice`, `journey`, `title`, `status`, and on the way to done `gate`, `evidence`, `controls` (oracle control names or `/patterns/` this item answers for), `outOfScope` (each naming a decision).

Status: `unknown` (not yet captured on the oracle), `open` (captured or ours-only, not built), `partial`, `done` (needs `gate` and `evidence`). Edit a file, then `npm run docs`. Order in the generated pages: slice, then id.
