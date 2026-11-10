// Gate B's two readings of one recorded oracle turn (traces/*.json, H5):
//   oracleTurn   what appeared, in order, in ms after the composer cleared (the send)
//   replayScript the Barkpark events that make those things appear in ours, at the same times
// Plain TypeScript with no imports, so scripts/gate-b.mjs runs it in Node as it is.
//
// How the script is read off the oracle's DOM (its network is never watched, O2):
//   own bubble lands      → the send is accepted then (our bubble lands on acceptance)
//   "is working" / row    → turn_started (the first of the two)
//   the rail says Working → the bot's state flips (fleet stream, event: state; stateScript);
//                           0.79.3 never says it on the open bot: the line is the witness (fromRow);
//                           a moment of its own (rail:working), judged like the others.
//   the rail gains        → the bot's state flips to idle in a window without focus: the tile's
//   "Unread activity"       own moment (rail:unread). It trails the reply by a time the oracle's
//                           own side sets (66 ms in storage, 996 ms in say-hi, both 0.79.3), so
//                           the idle flip is scripted at the dot, as Working's is at the rail.
//                           The row waits for it: in storage the row came with the rail,
//                           779 ms after "is working", not with the turn's start.
//   "Typing…" label       → text_delta from then until the bubble, in ~50 ms chunks
//   reply bubble          → the text ends: turn_completed for the last bubble; for an earlier
//                           one, turn_started (Claude's host sends one per model message, so
//                           a new one means the text before it is a whole message)
//   a bubble with no "Typing…" before it gets its text in one delta at the bubble's time.
// The oracle's own summary labels ("Saying hello") have no Barkpark event: they summarise the
// turn (say-hi calls no tool), and a host's tool items (task-f13fc4b4dc2af6de) name tools, not
// that. The oracle's DOM shows no tool call either, so the script sends none; Gate B says so.

export type Kind = 'user' | 'working' | 'label:status' | 'label:typing' | 'assistant' | 'status:working' | 'status:replied' | 'rail:working' | 'rail:unread'
export type Milestone = {kind: Kind; t: number; len?: number; text?: string}
export type TraceEvent = {t: number; type: string; kind: string; tag?: string; role?: string; data?: string; text?: string; textLength?: number; name?: string; value?: string}
export type Trace = {id: string; recipe: string; bot: string; viewport: [number, number, number]; events: TraceEvent[]}
export type Step = {t: number; data: Record<string, unknown>}
/** The bot's state as the oracle's rail shows it ("Oracle, Working"), in ms after the send. */
export type RailState = {t: number; state: 'working' | 'idle'}

/** An oracle article's text is the message plus 15 characters of name and time (say-hi 29 → 44, storage 40 → 55). */
export const ARTICLE_CHROME = 15

const round = (t: number) => Math.round(t * 10) / 10
const labelKind = (text: string): Kind => (/^Typing/.test(text) ? 'label:typing' : 'label:status')

export function oracleTurn(trace: Trace): {clear: number; milestones: Milestone[]; rail: RailState[]; fleet: RailState[]} {
  const clear = trace.events.find((e) => e.type === 'remove' && e.kind === 'main' && e.tag === 'br')
  if (!clear) throw new Error(`${trace.id}: no send (the composer never cleared)`)
  const out: Milestone[] = []
  const at = (e: TraceEvent) => round(e.t - clear.t)
  for (const e of trace.events) {
    if (e.type !== 'add' || e.t < clear.t) continue
    if (e.kind === 'bubble:user' && e.role === 'article') out.push({kind: 'user', t: at(e), len: (e.textLength ?? 0) - ARTICLE_CHROME})
    else if (e.kind === 'bubble:assistant' && e.role === 'article') out.push({kind: 'assistant', t: at(e), len: (e.textLength ?? 0) - ARTICLE_CHROME})
    // The transcript's time row ("Today 11:04 PM", data `index rowKey`) is a row too, not the working line.
    else if (e.kind === 'main' && e.tag === 'div' && !e.role && e.data?.split(' ').includes('rowKey') && !e.data.split(' ').includes('index')) {
      out.push({kind: 'working', t: at(e)})
      if (e.text) out.push({kind: labelKind(e.text), t: at(e), text: e.text})
    } else if (e.kind === 'main' && e.tag === 'span' && e.text) out.push({kind: labelKind(e.text), t: at(e), text: e.text})
    else if (e.kind === 'other' && e.tag === 'span' && e.text?.endsWith(' is working')) out.push({kind: 'status:working', t: at(e)})
    else if (e.kind === 'other' && e.tag === 'span' && e.text?.endsWith(' replied')) out.push({kind: 'status:replied', t: at(e)})
  }
  const rail: RailState[] = []
  // Whether the tile said Unread before this label. Before the first one nobody saw it: a first
  // label that says Working too was unread already (0.79.2 storage: "Oracle, Unread activity,
  // Working" as the turn starts), since no reply lands in the event that starts the turn.
  let unread: boolean | null = null
  for (const e of trace.events) {
    if (e.type !== 'attr' || e.kind !== 'rail' || e.name !== 'aria-label' || e.t < clear.t || typeof e.value !== 'string') continue
    const says = e.value.split(', ')
    const state = says.includes('Working') ? 'working' : 'idle'
    if (rail.at(-1)?.state !== state) rail.push({t: at(e), state})
    const now = says.includes('Unread activity')
    if (now && !(unread ?? state === 'working')) out.push({kind: 'rail:unread', t: at(e)})
    unread = now
  }
  // The rail turning to Working is a moment too: it comes with the bot's state, not the turn.
  for (const r of rail) if (r.state === 'working') out.push({kind: 'rail:working', t: r.t})
  out.sort((a, b) => a.t - b.t) // stable: same-ms moments keep the trace's order
  // The rail's times are the state's only where the rail said Working (up to 0.79.2).
  return {clear: clear.t, milestones: out, rail, fleet: rail.some((r) => r.state === 'working') ? rail : fromRow(out)}
}

/** True when the oracle's window had no focus as the reply landed: the tile's Unread dot is the
 *  trace's only witness of that (traces/2026-11-09-unread.json: a reply in a focused window sets none). */
export const awayAtReply = (m: Milestone[]) => m.some((x) => x.kind === 'rail:unread')

/** The bot's state as Barkpark's fleet stream sends it. Up to Grok 0.79.2 the open bot's tile said
 *  Working, so the rail's times are the state's. 0.79.3 never says Working on the open bot
 *  (long-answer), so the working line, which shows with the state, is its only witness: Working at
 *  the line, idle at the reply. Where the tile gained Unread (a window without focus), that is the
 *  rail showing the state go idle: idle then, never before the reply. */
function fromRow(m: Milestone[]): RailState[] {
  const line = m.find((x) => x.kind === 'working')
  const reply = m.filter((x) => x.kind === 'assistant').at(-1)
  const dot = m.find((x) => x.kind === 'rail:unread' && reply && x.t >= reply.t)
  const idle = dot ?? reply
  return line ? [{t: line.t, state: 'working'}, ...(idle ? [{t: idle.t, state: 'idle' as const}] : [])] : []
}

/** Neutral words of exactly n characters, no space at either end (O2: no conversation text). */
export function filler(n: number): string {
  const words = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.split(' ')
  let s = ''
  for (let i = 0; s.length < n; i++) s += (s ? ' ' : '') + words[i % words.length]
  s = s.slice(0, n)
  return s.endsWith(' ') ? s.slice(0, -1) + 'x' : s
}

const runtime = (kind: string, extra: Record<string, unknown> = {}) => {
  // Barkpark's runtime event as /v1/chat/sessions/:id/events sends it for a registered host.
  const native: Record<string, unknown> = {kind, ...extra}
  if (typeof extra.delta === 'string') native.params = {delta: extra.delta}
  if (extra.item) native.params = {item: extra.item}
  return {provider: 'claude', kind, native, durability: 'durable', terminal_state: kind === 'turn_completed' ? 'completed' : null}
}

/** Which host the replay plays: `items` is what a registered claude host sends since Barkpark
 *  #25471 (task-f13fc4b4dc2af6de): one turn_started, each text block between item_started and
 *  item_completed {type: text}, and Barkpark's paragraph break in front of a later block's first
 *  delta. `legacy` is the older host: a turn_started per model message. */
export type Shape = 'legacy' | 'items'

export function replayScript(milestones: Milestone[], shape: Shape = 'items'): {accept: number; steps: Step[]} {
  const first = (k: Kind) => milestones.find((m) => m.kind === k)
  const accept = first('user')?.t ?? 0
  const starts = [first('status:working')?.t, first('working')?.t].filter((t): t is number => t !== undefined)
  const steps: Step[] = []
  if (!starts.length) return {accept, steps}
  const start = Math.min(...starts)
  steps.push({t: start, data: runtime('turn_started')})
  const replies = milestones.filter((m) => m.kind === 'assistant')
  let from = start
  replies.forEach((b, i) => {
    const text = filler(b.len ?? 0)
    const typing = milestones.find((m) => m.kind === 'label:typing' && m.t > from && m.t <= b.t)
    const last = i === replies.length - 1
    const item = {type: 'text', id: `text-${i + 1}`}
    const deltas: Step[] = []
    if (typing && b.t - typing.t >= 1) {
      const n = Math.max(1, Math.floor((b.t - typing.t) / 50))
      const size = Math.ceil(text.length / n)
      for (let k = 0; k < n; k++) {
        const chunk = text.slice(k * size, (k + 1) * size)
        if (chunk) deltas.push({t: round(typing.t + ((b.t - typing.t) * k) / n), data: runtime('text_delta', {delta: chunk})})
      }
    } else if (text) deltas.push({t: b.t, data: runtime('text_delta', {delta: text})})
    if (shape === 'legacy') {
      steps.push(...deltas, {t: b.t, data: runtime(last ? 'turn_completed' : 'turn_started')})
    } else {
      if (i > 0 && deltas[0]) deltas[0] = {t: deltas[0].t, data: runtime('text_delta', {delta: '\n\n' + (deltas[0].data.native as {delta: string}).delta})}
      steps.push({t: deltas[0]?.t ?? b.t, data: runtime('item_started', {item_id: item.id, item})}, ...deltas, {t: b.t, data: runtime('item_completed', {item_id: item.id, item})})
      if (last) steps.push({t: b.t, data: runtime('turn_completed')})
    }
    from = b.t
  })
  return {accept, steps}
}

/** The fleet stream's state flips (event: state) at oracleTurn's `fleet` times; replay.ts adds the run's session id. */
export function stateScript(rail: RailState[]): Step[] {
  return rail.map((r) => ({t: r.t, data: {agent_state: r.state, title: null}}))
}
