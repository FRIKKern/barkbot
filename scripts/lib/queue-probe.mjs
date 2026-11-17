// The bot-record queue (app/src/server/bots.ts oneAtATime) run on its own in this Node process:
// no page, no Barkpark. bots.ts is loaded through the app's own Vite in SSR mode, without the
// app's plugins (nothing here needs them), and each change's write is a stand-in that counts.
// task-2ad4f1be48ff7f4d: a change that never reaches its write must not hold its bot for ever,
// and a write handed to a change must write nothing once that change has ended.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
// Settles to {ok, value | error, at} and never throws, or {pending} after `ms`.
const settle = (p, t0, ms) => Promise.race([
  p.then((value) => ({ ok: true, value, at: Date.now() - t0 }), (e) => ({ ok: false, error: String(e?.message ?? e), at: Date.now() - t0 })),
  wait(ms).then(() => ({ pending: true })),
]);

export async function queueProbe({ check, path }) {
  const vite = await import(pathToFileURL(createRequire(path('app', 'package.json')).resolve('vite')).href);
  const server = await vite.createServer({ root: path('app'), configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const q = await server.ssrLoadModule('/src/server/bots.ts');
    const BOUND = 40_000; // the stated bound: longer than three reads (3 × 8 s) and the write (10 s)
    const X = 'probe-bot-x', Y = 'probe-bot-y';
    let writes = 0, release;
    const t0 = Date.now();
    // A: queued for X, hangs on something with no bound before it ever calls its write.
    const hung = q.oneAtATime(X, async (write) => { await new Promise((ok) => (release = ok)); return write(async () => { writes++; return 'late'; }); });
    const a = settle(hung, t0, BOUND + 20_000);
    // Alongside, on bots of their own (from the review of #126, rev63's probes):
    // - a healthy change at the edge of the stated steps, three reads (24 s) then a 9.9 s write, is kept;
    // - a change that hangs 35 s and then starts an 8 s save that obeys its signal, with the next
    //   change queued at 30 s: at the bound its save is called off, before the next one's save
    //   starts, and it never lands.
    const log = [], stamp = (what) => log.push([what, Date.now() - t0]);
    const edge = settle(q.oneAtATime('probe-bot-edge', async (write) => { await wait(24_000); return write(async () => { await wait(9_900); return 'edge'; }); }), t0, BOUND + 20_000);
    const late = settle(q.oneAtATime('probe-bot-late', async (write) => {
      await wait(35_000);
      return write((signal) => new Promise((ok, no) => {
        stamp('late save starts');
        const t = setTimeout(() => { stamp('late save lands'); ok('late'); }, 8_000);
        signal.addEventListener('abort', () => { clearTimeout(t); stamp('late save called off'); no(new Error('called off')); });
      }));
    }), t0, BOUND + 20_000);
    let afterLate;
    setTimeout(() => { afterLate = settle(q.oneAtATime('probe-bot-late', async (write) => write(async () => { stamp('next save starts'); return 'next'; })), t0, 20_000); }, 30_000);
    // Control: a change for another bot is never held by X's.
    const other = await settle(q.oneAtATime(Y, async (write) => write(async () => 'y')), t0, 5_000);
    // B: queued for X ten seconds before the bound; it waits its turn (WAIT_MS 15 s), so it runs
    // only if A lets X go by the bound.
    await wait(BOUND - 10_000);
    const tb = Date.now();
    const next = await settle(q.oneAtATime(X, async (write) => write(async () => 'b')), tb, 20_000);
    const first = await a;
    // A's hang ends after the bound: its own write must now write nothing.
    release?.(); await wait(300);
    // A change that ended normally, its write kept and called after: it must write nothing either.
    let kept, afterWrites = 0;
    const done = await settle(q.oneAtATime(Y, async (write) => { kept = write; return 'done'; }), Date.now(), 5_000);
    const keptCall = await settle(Promise.resolve().then(() => kept(async () => { afterWrites++; return 'after'; })), Date.now(), 12_000);
    const out = { other, first, next: { ...next, at: next.at === undefined ? undefined : next.at + (tb - t0) }, lateWrites: writes, done, keptCall, afterWrites };
    const edgeOut = await edge, gaveUp = await late, then = await afterLate;
    await wait(9_000); // any save not called off lands by now
    const when = (what) => log.find(([w]) => w === what)?.[1];
    const steps = { edgeOut, gaveUp, then, log };
    check('control: a change for another bot runs at once while one bot\'s change hangs', other.ok && other.value === 'y' && other.at < 2_000, out);
    check(`a queued change that hangs before its write lets its bot go within ${BOUND / 1000} s: it fails with a plain line, and the next change for that bot then runs`, first.ok === false && first.at <= BOUND + 1_000 && next.ok === true && next.value === 'b' && out.next.at <= BOUND + 2_000, out);
    check('a healthy change at the edge of its steps, three reads (24 s) and then a 9.9 s write, is kept: its write answers its value', edgeOut.ok === true && edgeOut.value === 'edge', steps);
    check(`a save still on its way when its change reaches the ${BOUND / 1000} s bound is called off by the bound, before the next change's save starts, and never lands`, gaveUp.ok === false && when('late save called off') !== undefined && when('late save called off') <= BOUND + 1_000 && when('late save lands') === undefined && then?.ok === true && when('next save starts') >= when('late save called off'), steps);
    check('a write called after its change ended writes nothing: the hung change\'s, once it was let go, and one kept by a change that had returned', writes === 0 && done.ok === true && afterWrites === 0 && keptCall.ok === false, out);
  } finally {
    await server.close();
  }
}
