// One conversation, live: history from Barkpark's stream, then the running turn.
// Timing follows the oracle (QUALITY.md, feel budgets): the own bubble lands when Barkpark
// accepts the send; a working line shows while the run goes; a reply bubble lands whole when
// its text block ends ("Typing…" while it is written); the line leaves once the turn ends.
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

export function useConversation(sessionId: string | null) {
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
  const land = useCallback((b: Omit<Bubble, 'key'>) => {
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
    const es = new EventSource(`/api/chat/${sessionId}/events`)
    es.onopen = () => setReady(true)
    es.addEventListener('message', (e) => {
      const m = JSON.parse((e as MessageEvent).data) as {seq: number; role: string; source_markdown?: string}
      if ((m.role === 'user' || m.role === 'assistant') && m.source_markdown) land({role: m.role, text: m.source_markdown, seq: m.seq})
    })
    es.addEventListener('chat', (e) => {
      const f = JSON.parse((e as MessageEvent).data) as Frame
      if (import.meta.env.DEV) console.debug('[chat]', f.type, f.subtype ?? f.event?.type ?? '')
      if (f.type === 'system' && f.subtype === 'init') return show('Thinking')
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
        case 'turn_started':
          text.current = ''
          return show('Thinking')
        case 'text_delta': {
          const d = ev.native?.params?.delta ?? ev.native?.delta
          if (typeof d !== 'string') return
          if (text.current === null) text.current = ''
          if (!text.current) show('Typing…')
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
    }
  }, [sessionId, land, show, end])

  const send = useCallback(
    async (content: string) => {
      if (!sessionId) return
      setError(null)
      try {
        await sendMessage({data: {id: sessionId, content}})
        land({role: 'user', text: content})
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [sessionId, land],
  )

  return {bubbles, working, error, ready, send}
}
