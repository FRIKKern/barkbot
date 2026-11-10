// One conversation, live: history from Barkpark's stream, then the running turn.
// Timing follows the oracle (QUALITY.md, feel budgets; Gate B replays its recorded turns): the
// own bubble lands when Barkpark accepts the send; a working line (the mark alone, then what it
// is doing) shows while the run goes; a reply bubble lands whole when its text ends ("Typing…"
// while it is written); the line leaves once the turn ends.
import {useCallback, useEffect, useRef, useState} from 'react'
import {sendMessage} from './api'

export type Bubble = {
  key: string
  role: 'user' | 'assistant'
  text: string
  seq?: number
  /** Gate scenes only: each paragraph's height on the oracle, kept whatever the placeholder words do. */
  heights?: number[]
}
/** The working line. `held`: the turn has started but the bot's state is not Working yet, so the
 *  row waits (the oracle's row comes with its rail's Working, not with the turn's start).
 *  `ended`: the turn is over and the line is about to leave; the status says "replied" from then,
 *  with the reply bubble (0.79.3: the same ms in all four turn traces), not when the line goes. */
export type Working = {label: string; leaving: boolean; first: boolean; held: boolean; ended?: boolean} | null
/** The bot's state from Barkpark's fleet stream (agent_state); null until the stream has said. */
export type BotState = 'working' | 'blocked' | 'idle' | 'unknown' | null
const busy = (s: BotState) => s === null || s === 'working' || s === 'blocked'

type Frame = Record<string, any>

// A tool call, said the way the working line says it. Bash carries its own description.
export function toolLabel(name: string, input: Frame | undefined): string {
  const file = (p?: string) => (p ? p.split('/').pop() : 'a file')
  if (typeof input?.description === 'string' && input.description) return input.description
  switch (name) {
    case 'Read': return `Reading ${file(input?.file_path)}`
    case 'Write': case 'Edit': case 'MultiEdit': return `Editing ${file(input?.file_path)}`
    case 'Grep': case 'Glob': return 'Searching files'
    case 'WebSearch': return 'Searching the web'
    case 'WebFetch': return 'Reading the web'
    case 'Bash': return 'Running a command'
    default: return `Using ${name}`
  }
}

let n = 0
const key = () => `local-${++n}`
const flat = (s: string) => s.replace(/\s+/g, '')

/** Where a conversation's events come from and where a send goes: Barkpark, or Gate B's replay.
 *  `fleet` is the stream of every bot's state (Barkpark's /v1/chat/events: snapshot, then state). */
export type Transport = {events: (sessionId: string) => string; fleet?: (sessionId: string) => string; send: (sessionId: string, content: string) => Promise<unknown>}
export const barkpark: Transport = {
  events: (id) => `/api/chat/${id}/events`,
  fleet: () => '/api/chat/events',
  send: (id, content) => sendMessage({data: {id, content}}),
}

/** One conversation. `transport` must be stable (module-level or memoized): a new one reconnects. */
export function useConversation(sessionId: string | null, transport: Transport = barkpark) {
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [working, setWorking] = useState<Working>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false) // the live stream is open: a send now cannot miss its run
  const text = useRef<string | null>(null) // the reply block being written, not shown until it ends
  const leave = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [botState, setBotState] = useState<BotState>(null)
  const bot = useRef<BotState>(null) // the same, for event handlers
  // A new line is held while the bot is not Working; once shown it stays until the turn ends.
  const fresh = (w: Working) => !w || w.leaving
  const held = (w: Working) => (fresh(w) ? !busy(bot.current) : w!.held)

  const show = useCallback((label: string) => {
    if (leave.current) clearTimeout(leave.current), (leave.current = null)
    setWorking((w) => ({label, leaving: false, first: fresh(w), held: held(w)}))
  }, [])
  // "Typing…" waits one frame: text that lands within the frame it began never shows it (the
  // oracle shows no "Typing…" for a reply that arrives whole, Gate B say-hi-2).
  const typing = useRef<number | null>(null)
  const typingSoon = useCallback(() => {
    if (typing.current === null) typing.current = requestAnimationFrame(() => ((typing.current = null), show('Typing…')))
  }, [show])
  // The line starts with the mark alone: the oracle's row has no words until it has something
  // to say (Gate B, say-hi: the row at 960 ms is empty, its first label comes at 2.4 s).
  // A new model message in the same turn keeps what the line said, unless that was "Typing…".
  const resume = useCallback(() => {
    if (leave.current) clearTimeout(leave.current), (leave.current = null)
    setWorking((w) => (w && !w.leaving && w.label !== 'Typing…' ? (w.ended ? {...w, ended: false} : w) : {label: '', leaving: false, first: fresh(w), held: held(w)}))
  }, [])
  const land = useCallback((b: Omit<Bubble, 'key'>) => {
    if (b.role === 'assistant' && typing.current !== null) cancelAnimationFrame(typing.current), (typing.current = null)
    setBubbles((all) => {
      // A history row (event: message, replayed on every connect) that matches what we already
      // showed claims it, instead of doubling it. Barkpark stores a turn as ONE row: today the
      // text of its last model message (the recorder resets at each turn_started), and if that
      // is ever fixed, all of them joined. So a row claims one live bubble, or a run of them
      // whose texts joined are its text. Gate B replays both shapes after a reconnect.
      if (b.seq !== undefined) {
        if (all.some((x) => x.seq === b.seq)) return all
        const want = flat(b.text)
        for (let i = 0; i < all.length; i++) {
          let got = ''
          let j = i
          while (j < all.length && all[j].seq === undefined && all[j].role === b.role && got.length < want.length) got += flat(all[j++].text)
          if (j > i && got === want) return all.map((x, k) => (k >= i && k < j ? {...x, seq: b.seq} : x))
        }
      }
      return [...all, {...b, key: b.seq !== undefined ? `seq-${b.seq}` : key()}]
    })
  }, [])
  const end = useCallback(() => {
    // Measured: the line goes ~100 ms after the reply lands, then a 140 ms exit.
    if (typing.current !== null) cancelAnimationFrame(typing.current), (typing.current = null)
    setWorking((w) => (w ? {...w, ended: true} : w))
    leave.current = setTimeout(() => {
      setWorking((w) => (w ? {...w, leaving: true} : w))
      leave.current = setTimeout(() => setWorking(null), 140)
    }, 100)
  }, [])

  useEffect(() => {
    setBubbles([])
    setWorking(null)
    setReady(false)
    setBotState(null)
    if (!sessionId) return
    const es = new EventSource(transport.events(sessionId))
    es.onopen = () => setReady(true)
    es.addEventListener('message', (e) => {
      const m = JSON.parse((e as MessageEvent).data) as {seq: number; role: string; source_markdown?: string}
      if ((m.role === 'user' || m.role === 'assistant') && m.source_markdown) land({role: m.role, text: m.source_markdown, seq: m.seq})
    })
    es.addEventListener('chat', (e) => {
      const f = JSON.parse((e as MessageEvent).data) as Frame
      if (import.meta.env.DEV) console.debug('[chat]', f.type, f.subtype ?? f.event?.type ?? '')
      if (f.type === 'system' && f.subtype === 'init') return show('')
      if (f.type === 'stream_event') {
        const ev = f.event as Frame
        if (ev.type === 'content_block_start' && ev.content_block?.type === 'text') (text.current = ''), show('Typing…')
        else if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') show(toolLabel(ev.content_block.name, undefined))
        else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && text.current !== null) text.current += ev.delta.text
        else if (ev.type === 'content_block_stop' && text.current !== null) {
          const t = text.current.trim()
          text.current = null
          if (t) land({role: 'assistant', text: t})
        }
        return
      }
      if (f.type === 'assistant') {
        for (const c of (f.message?.content ?? []) as Frame[]) if (c.type === 'tool_use') show(toolLabel(c.name, c.input))
        return
      }
      if (f.type === 'result') {
        if (f.is_error) setError(String(f.result ?? 'The run failed'))
        end()
      }
    })
    // A registered host (the bot's own computer) speaks in runtime events, not claude's frames:
    // turn_started, text_delta, turn_completed, error. A host with Barkpark's item events
    // (task-f13fc4b4dc2af6de) also sends each tool call (item {type: tool_use, name, input}) and
    // each text block's edges (item {type: text}); an older one sends a turn_started per model
    // message instead. Either way a message that ends lands as its own bubble.
    const message = () => {
      const t = (text.current ?? '').trim()
      text.current = ''
      if (t) land({role: 'assistant', text: t})
      resume()
    }
    es.addEventListener('runtime', (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as Frame
      if (import.meta.env.DEV) console.debug('[runtime]', ev.kind)
      switch (ev.kind) {
        case 'turn_started':
          // An older host sends one per model message (message_start), so a second one in a
          // turn means the text before it is a whole message: it lands now, not lost (Gate B,
          // storage: a sentence, a tool, then the answer are two bubbles).
          return message()
        case 'text_delta': {
          const d = ev.native?.params?.delta ?? ev.native?.delta
          if (typeof d !== 'string') return
          if (text.current === null) text.current = ''
          if (!text.current) typingSoon()
          text.current += d
          return
        }
        case 'item_started': {
          const it = ev.native?.params?.item
          if (it?.type !== 'text' && typeof it?.name === 'string') show(toolLabel(it.name, it.input))
          return
        }
        case 'item_completed': {
          // A text block ended: its text is a whole message. (Barkpark puts a paragraph break in
          // front of the next block's first delta; the bubble is trimmed.)
          if (ev.native?.params?.item?.type === 'text') message()
          return
        }
        case 'turn_completed': {
          const t = (text.current ?? '').trim()
          text.current = null
          if (t) land({role: 'assistant', text: t})
          return end()
        }
        case 'error':
        case 'process_failed':
        case 'protocol_error':
          text.current = null
          setError(typeof ev.error === 'string' ? ev.error : ev.error?.result ?? 'The run failed on the bot\'s computer')
          return end()
      }
    })
    es.addEventListener('exit', () => end())
    // The bot's state: Barkpark flips it when a turn starts and ends (Recorder → FleetHub). The
    // working row shows when the bot is Working, which the rail shows too (workingBots).
    const fleet = transport.fleet ? new EventSource(transport.fleet(sessionId)) : null
    const take = (s: BotState) => {
      bot.current = s
      setBotState(s)
      if (busy(s)) setWorking((w) => (w?.held ? {...w, held: false} : w))
    }
    fleet?.addEventListener('snapshot', (e) => {
      const f = JSON.parse((e as MessageEvent).data) as {sessions?: {session_id: string; agent_state: BotState}[]}
      take(f.sessions?.find((x) => x.session_id === sessionId)?.agent_state ?? 'idle')
    })
    fleet?.addEventListener('state', (e) => {
      const f = JSON.parse((e as MessageEvent).data) as {session_id: string; agent_state: BotState}
      if (f.session_id === sessionId) take(f.agent_state)
    })
    return () => {
      es.close()
      fleet?.close()
      bot.current = null
      if (leave.current) clearTimeout(leave.current)
      if (typing.current !== null) cancelAnimationFrame(typing.current), (typing.current = null)
    }
  }, [sessionId, transport, land, show, resume, typingSoon, end])

  const send = useCallback(
    async (content: string) => {
      if (!sessionId) return
      setError(null)
      try {
        await transport.send(sessionId, content)
        land({role: 'user', text: content})
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [sessionId, transport, land],
  )

  return {bubbles, working, botState, error, ready, send}
}
