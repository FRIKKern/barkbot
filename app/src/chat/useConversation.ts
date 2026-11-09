// One conversation, live: history from Barkpark's stream, then the running turn.
// Timing follows the oracle (QUALITY.md, feel budgets; Gate B replays its recorded turns): the
// own bubble lands when Barkpark accepts the send; a working line (the mark alone, then what it
// is doing) shows while the run goes; a reply bubble lands whole when its text ends ("Typing…"
// while it is written); the line leaves once the turn ends.
import {useCallback, useEffect, useRef, useState} from 'react'
import {sendMessage} from './api'

export type Bubble = {key: string; role: 'user' | 'assistant'; text: string; seq?: number}
export type Working = {label: string; leaving: boolean; first: boolean} | null

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

/** Where a conversation's events come from and where a send goes: Barkpark, or Gate B's replay. */
export type Transport = {events: (sessionId: string) => string; send: (sessionId: string, content: string) => Promise<unknown>}
export const barkpark: Transport = {
  events: (id) => `/api/chat/${id}/events`,
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

  const show = useCallback((label: string) => {
    if (leave.current) clearTimeout(leave.current), (leave.current = null)
    setWorking((w) => ({label, leaving: false, first: !w || w.leaving}))
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
    setWorking((w) => (w && !w.leaving && w.label !== 'Typing…' ? w : {label: '', leaving: false, first: !w || w.leaving}))
  }, [])
  const land = useCallback((b: Omit<Bubble, 'key'>) => {
    if (b.role === 'assistant' && typing.current !== null) cancelAnimationFrame(typing.current), (typing.current = null)
    setBubbles((all) => {
      // A history row that matches a bubble we already showed claims it, instead of doubling it.
      if (b.seq !== undefined) {
        if (all.some((x) => x.seq === b.seq)) return all
        const i = all.findIndex((x) => x.seq === undefined && x.role === b.role && x.text.trim() === b.text.trim())
        if (i >= 0) return all.map((x, j) => (j === i ? {...x, seq: b.seq} : x))
      }
      return [...all, {...b, key: b.seq !== undefined ? `seq-${b.seq}` : key()}]
    })
  }, [])
  const end = useCallback(() => {
    // Measured: the line goes ~100 ms after the reply lands, then a 140 ms exit.
    if (typing.current !== null) cancelAnimationFrame(typing.current), (typing.current = null)
    leave.current = setTimeout(() => {
      setWorking((w) => (w ? {...w, leaving: true} : w))
      leave.current = setTimeout(() => setWorking(null), 140)
    }, 100)
  }, [])

  useEffect(() => {
    setBubbles([])
    setWorking(null)
    setReady(false)
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
    // turn_started, text_delta, turn_completed, error. Barkpark's host protocol carries no tool
    // calls or text-block edges yet, so a reply lands whole when the turn ends.
    es.addEventListener('runtime', (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as Frame
      if (import.meta.env.DEV) console.debug('[runtime]', ev.kind)
      switch (ev.kind) {
        case 'turn_started': {
          // Claude's host sends one per model message (message_start), so a second one in a
          // turn means the text before it is a whole message: it lands now, not lost (Gate B,
          // storage: a sentence, a tool, then the answer are two bubbles).
          const t = (text.current ?? '').trim()
          text.current = ''
          if (t) land({role: 'assistant', text: t})
          return resume()
        }
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
          if (typeof it?.name === 'string') show(toolLabel(it.name, it.input))
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
    return () => {
      es.close()
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

  return {bubbles, working, error, ready, send}
}
