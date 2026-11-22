// The version Gate A and behaviour start the app with (BARKBOT_VERSION, read by app/vite.config.ts).
// Settings > Updates draws the app's version, and its width lands in Gate A's record: a short commit
// there would rewrite parity/gate-a/oracle-settings-updates.json on every commit. Seven characters,
// as a short commit is, so the box is the size a real build draws.
export const PINNED_VERSION = '0000000';
