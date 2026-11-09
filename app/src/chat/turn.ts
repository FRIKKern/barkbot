// Gate B's two readings of one recorded oracle turn (traces/*.json, H5):
//   oracleTurn   what appeared, in order, in ms after the composer cleared (the send)
//   replayScript the Barkpark events that make those things appear in ours, at the same times
// Plain TypeScript with no imports, so scripts/gate-b.mjs runs it in Node as it is.
//
// How the script is read off the oracle's DOM (its network is never watched, O2):
//   own bubble lands      → the send is accepted then (our bubble lands on acceptance)
//   "is working" / row    → turn_started (the first of the two)
//   the rail says Working → the bot's state flips (fleet stream, event: state; stateScript);
//                           a moment of its own (rail:working), judged like the others.
//                           The row waits for it: in storage the row came with the rail,
//                           779 ms after "is working", not with the turn's start.
//   "Typing…" label       → text_delta from then until the bubble, in ~50 ms chunks
//   reply bubble          → the text ends: turn_completed for the last bubble; for an earlier
//                           one, turn_started (Claude's host sends one per model message, so
//                           a new one means the text before it is a whole message)
//   a bubble with no "Typing…" before it gets its text in one delta at the bubble's time.
// The oracle's own summary labels ("Saying hello") have no Barkpark event; the script sends
// none, so ours cannot show them (task-f13fc4b4dc2af6de) and Gate B says so.

export type Kind = 'user' | 'working' | 'label:status' | 'label:typing' | 'assistant' | 'status:working' | 'status:replied' | 'rail:working'
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

export function oracleTurn(trace: Trace): {clear: number; milestones: Milestone[]; rail: RailState[]} {
  const clear = trace.events.find((e) => e.type === 'remove' && e.kind === 'main' && e.tag === 'br')
  if (!clear) throw new Error(`${trace.id}: no send (the composer never cleared)`)
  const out: Milestone[] = []
  const at = (e: TraceEvent) => round(e.t - clear.t)
  for (const e of trace.events) {
    if (e.type !== 'add' || e.t < clear.t) continue
    if (e.kind === 'bubble:user' && e.role === 'article') out.push({kind: 'user', t: at(e), len: (e.textLength ?? 0) - ARTICLE_CHROME})
    else if (e.kind === 'bubble:assistant' && e.role === 'article') out.push({kind: 'assistant', t: at(e), len: (e.textLength ?? 0) - ARTICLE_CHROME})
    else if (e.kind === 'main' && e.tag === 'div' && !e.role && e.data?.split(' ').includes('rowKey')) {
      out.push({kind: 'working', t: at(e)})
      if (e.text) out.push({kind: labelKind(e.text), t: at(e), text: e.text})
    } else if (e.kind === 'main' && e.tag === 'span' && e.text) out.push({kind: labelKind(e.text), t: at(e), text: e.text})
    else if (e.kind === 'other' && e.tag === 'span' && e.text?.endsWith(' is working')) out.push({kind: 'status:working', t: at(e)})
    else if (e.kind === 'other' && e.tag === 'span' && e.text?.endsWith(' replied')) out.push({kind: 'status:replied', t: at(e)})
  }
  const rail: RailState[] = []
  for (const e of trace.events) {
    if (e.type !== 'attr' || e.kind !== 'rail' || e.name !== 'aria-label' || e.t < clear.t || typeof e.value !== 'string') continue
    const state = e.value.split(', ').includes('Working') ? 'working' : 'idle'
    if (rail.at(-1)?.state !== state) rail.push({t: at(e), state})
  }
  // The rail turning to Working is a moment too: it comes with the bot's state, not the turn.
  for (const r of rail) if (r.state === 'working') out.push({kind: 'rail:working', t: r.t})
  out.sort((a, b) => a.t - b.t) // stable: same-ms moments keep the trace's order
  return {clear: clear.t, milestones: out, rail}
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
  return {provider: 'claude', kind, native, durability: 'durable', terminal_state: kind === 'turn_completed' ? 'completed' : null}
}

export function replayScript(milestones: Milestone[]): {accept: number; steps: Step[]} {
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
    if (typing && b.t - typing.t >= 1) {
      const n = Math.max(1, Math.floor((b.t - typing.t) / 50))
      const size = Math.ceil(text.length / n)
      for (let k = 0; k < n; k++) {
        const chunk = text.slice(k * size, (k + 1) * size)
        if (chunk) steps.push({t: round(typing.t + ((b.t - typing.t) * k) / n), data: runtime('text_delta', {delta: chunk})})
      }
    } else if (text) steps.push({t: b.t, data: runtime('text_delta', {delta: text})})
    steps.push({t: b.t, data: runtime(i === replies.length - 1 ? 'turn_completed' : 'turn_started')})
    from = b.t
  })
  return {accept, steps}
}

/** The fleet stream's state flips (event: state) at the oracle rail's times; replay.ts adds the run's session id. */
export function stateScript(rail: RailState[]): Step[] {
  return rail.map((r) => ({t: r.t, data: {agent_state: r.state, title: null}}))
}
