// One conversation, live: history from Barkpark's stream, then the running turn.
// Timing follows the oracle (QUALITY.md, feel budgets; Gate B replays its recorded turns): the
// own bubble lands when Barkpark accepts the send; a working line (the mark alone, then what it
// is doing) shows while the run goes; a reply bubble lands whole when its text ends ("Typing…"
// while it is written); the line leaves once the turn ends.
import {useCallback, useEffect, useRef, useState} from 'react'
import {answerApproval, answerQuestion, sendMessage, uploadAttachment, type AttachmentRef} from './api'

export type Bubble = {
  key: string
  role: 'user' | 'assistant'
  text: string
  seq?: number
  /** Picture ids sent with the message (Barkpark's attachments); shown above its words. */
  images?: string[]
  /** Gate scenes only: each paragraph's height on the oracle, kept whatever the placeholder words do. */
  heights?: number[]
  /** Text files and PDFs sent with the message, by name and size: shown as a file card above its words. */
  files?: {name: string; size: string}[]
  /** A question the person answered, shown as its card in place of a bubble (gate scenes; the live page clears an ask once answered). */
  answered?: {question: string; letter: string; label: string}
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

/** What the bot asks leave for before it goes on (Barkpark's approval_requested): nothing happens
 *  until the person answers. `detail` is the plan, the command or the file's new text. */
export type Question = {question: string; header: string | null; multi: boolean; options: {label: string; description: string | null}[]}
/** `questions`: the bot asks the person to choose (claude's AskUserQuestion), not for leave. */
/** `stored`: read back from Barkpark's stored rows on a fresh page, not heard live. Such a row
 *  stays "pending" for ever if its turn was stopped, so it is shown only while the bot's state
 *  says it is waiting on the person (blocked). */
export type Ask = {id: string; what: string; detail: string | null; answering: 'allow' | 'deny' | 'choice' | null; questions?: Question[]; stored?: boolean}
export type Answers = Record<string, string | string[]>
// The bot's questions as it sent them; a choice given as a bare word is a label with no note.
function questionsOf(input: Frame | undefined): Question[] {
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
  return (Array.isArray(input?.questions) ? (input!.questions as Frame[]) : [])
    .map((q) => ({
      question: String(q?.question ?? ''),
      header: text(q?.header),
      multi: q?.multiSelect === true,
      options: (Array.isArray(q?.options) ? (q.options as unknown[]) : []).map((o) => (typeof o === 'string' ? {label: o, description: null} : {label: String((o as Frame)?.label ?? ''), description: text((o as Frame)?.description)})).filter((o) => o.label),
    }))
    .filter((q) => q.question && q.options.length)
}
// The question, in plain words. The bot's computer runs claude in plan mode, so the first ask of
// a piece of work is its plan (ExitPlanMode); then each step that changes something.
export function askOf(id: string, tool: string, input: Frame | undefined): Ask {
  const file = typeof input?.file_path === 'string' ? input.file_path.split('/').pop() : null
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const base = {id, answering: null}
  const questions = tool === 'AskUserQuestion' ? questionsOf(input) : []
  if (questions.length) return {...base, what: 'ask you something', detail: null, questions}
  switch (tool) {
    case 'ExitPlanMode': return {...base, what: 'start on this plan', detail: text(input?.plan)}
    case 'Write': return {...base, what: `write ${file ?? 'a file'}`, detail: text(input?.content)}
    case 'Edit': case 'MultiEdit': case 'NotebookEdit': return {...base, what: `change ${file ?? 'a file'}`, detail: text(input?.new_string)}
    case 'Bash': return {...base, what: 'run a command', detail: text(input?.command)}
    case 'WebFetch': return {...base, what: 'read a web page', detail: text(input?.url)}
    case 'WebSearch': return {...base, what: 'search the web', detail: text(input?.query)}
    default: return {...base, what: `use ${tool}`, detail: null}
  }
}

let n = 0
const key = () => `local-${++n}`

/** What goes with a message, as base64: a picture, or a text file or PDF (`file`, named by its name). */
export type Outgoing = {data: string; name: string; file?: boolean}
/** One stored attachment, as Barkpark answers the upload. */
type Stored = {id: string; media_type: string; byte_size: number}
const isPicture = (mediaType?: string) => !mediaType || mediaType.startsWith('image/')
/** A file's size as its card says it. */
export const fileSize = (bytes: number) => (bytes < 1000 ? `${bytes} B` : bytes < 1_000_000 ? `${Math.round(bytes / 1000)} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`)
/** Why a message did not go, said plainly; the draft stays in the box. */
export const CANNOT_TAKE_FILES = "The bot's computer cannot take this file yet, so nothing was sent. Update its chat host, or send the words alone."

const flat = (s: string) => s.replace(/\s+/g, '')

/** Where a conversation's events come from and where a send goes: Barkpark, or Gate B's replay.
 *  `fleet` is the stream of every bot's state (Barkpark's /v1/chat/events: snapshot, then state). */
export type Transport = {events: (sessionId: string) => string; fleet?: (sessionId: string) => string; send: (sessionId: string, content: string, attachments?: AttachmentRef[]) => Promise<unknown>; upload?: (sessionId: string, data: string) => Promise<Stored | {refused: string}>; picture?: (sessionId: string, id: string) => string; answer?: (sessionId: string, requestId: string, decision: 'allow' | 'deny') => Promise<unknown>; choose?: (sessionId: string, requestId: string, answers: Answers) => Promise<unknown>}
export const barkpark: Transport = {
  events: (id) => `/api/chat/${id}/events`,
  fleet: () => '/api/chat/events',
  send: (id, content, attachments) => sendMessage({data: {id, content, attachments}}),
  upload: (id, data) => uploadAttachment({data: {id, data}}),
  picture: (id, aid) => `/api/chat/${id}/attachments/${aid}`,
  answer: (id, requestId, decision) => answerApproval({data: {id, requestId, decision}}),
  choose: (id, requestId, answers) => answerQuestion({data: {id, requestId, answers}}),
}

/** One conversation. `transport` must be stable (module-level or memoized): a new one reconnects. */
export function useConversation(sessionId: string | null, transport: Transport = barkpark) {
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [working, setWorking] = useState<Working>(null)
  const [error, setError] = useState<string | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
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
        // A message of pictures alone has no words to claim by: it claims the live bubble with the same pictures.
        if (!want) {
          const same = (x: Bubble) => x.seq === undefined && x.role === b.role && !flat(x.text) && (x.images ?? []).join() === (b.images ?? []).join() && (x.files ?? []).map((f) => f.name).join() === (b.files ?? []).map((f) => f.name).join()
          return all.some(same) ? all.map((x) => (same(x) && !all.slice(0, all.indexOf(x)).some(same) ? {...x, seq: b.seq} : x)) : [...all, {...b, key: `seq-${b.seq}`}]
        }
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
    setAsk(null)
    setReady(false)
    setBotState(null)
    if (!sessionId) return
    const es = new EventSource(transport.events(sessionId))
    es.onopen = () => setReady(true)
    const row = (e: Event) => {
      const m = JSON.parse((e as MessageEvent).data) as {seq: number; role: string; source_markdown?: string; metadata?: Frame; attachments?: {id: string; media_type?: string; byte_size?: number | null; name?: string}[]}
      // A stored row names its pictures by id, and its text files and PDFs by id, type, size and name.
      const held = (m.attachments ?? []).filter((a) => typeof a.id === 'string')
      const images = held.filter((a) => isPicture(a.media_type)).map((a) => a.id)
      const files = held.filter((a) => !isPicture(a.media_type)).map((a) => ({name: a.name || 'file', size: typeof a.byte_size === 'number' ? fileSize(a.byte_size) : ''}))
      if ((m.role === 'user' || m.role === 'assistant') && (m.source_markdown || held.length)) {
        land({role: m.role, text: m.source_markdown ?? '', seq: m.seq, ...(images.length ? {images} : {}), ...(files.length ? {files} : {})})
        // A row after a stored ask: that ask is over.
        return setAsk((a) => (a?.stored ? null : a))
      }
      // An ask that was still waiting when the page loaded (a reload in the middle of one).
      const meta = m.metadata
      if (['approval', 'plan', 'question'].includes(m.role) && meta?.approval_status === 'pending' && typeof meta.request_id === 'string')
        setAsk((a) => (a && !a.stored ? a : {...askOf(meta.request_id, String(meta.tool_name ?? 'a tool'), meta.input), stored: true}))
    }
    es.addEventListener('message', row)
    // Barkpark sends a stored row only when a stream opens (from the asked-for cursor), never as
    // it is written (seen live 2026-11-13). So after a turn heard from its middle, the rows are
    // asked for once more: the whole reply is among them, and a row already shown is not doubled.
    let again: EventSource | null = null
    const rows = () => {
      again?.close()
      const more = (again = new EventSource(transport.events(sessionId)))
      more.addEventListener('message', row)
      setTimeout(() => more.close(), 4000)
    }
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
    // A page that opens in the middle of a reply (a reload) hears only the rest of it: the turn's
    // start is not replayed. That tail is not a message, so nothing of such a turn lands from the
    // live events; its stored row, which follows the turn's end, is the whole reply.
    let started = false
    let tail = false
    let spoke = false // the turn has sent text: a summary label that comes after it is too late
    const part = () => {
      if (!started) tail = true
    }
    const whole = () => {
      const t = (text.current ?? '').trim()
      if (t && !tail) land({role: 'assistant', text: t})
    }
    const message = () => {
      whole()
      text.current = ''
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
          started = true
          return message()
        case 'status': {
          // The bot's own summary of the turn ("Explaining ocean tides"), once a turn, before its
          // first text (Barkpark #26296): the working line says it. Plain words, 60 at most; one
          // that comes after the text has started is ignored, so it never covers "Typing…".
          const label = ev.native?.label ?? ev.label
          if (typeof label !== 'string' || spoke) return
          const words = label.replace(/\s+/g, ' ').trim().slice(0, 60)
          if (words) show(words)
          return
        }
        case 'text_delta': {
          const d = ev.native?.params?.delta ?? ev.native?.delta
          if (typeof d !== 'string') return
          spoke = true
          part()
          if (text.current === null) text.current = ''
          if (!text.current) typingSoon()
          text.current += d
          return
        }
        case 'item_started': {
          const it = ev.native?.params?.item
          part()
          if (it?.type !== 'text' && typeof it?.name === 'string') show(toolLabel(it.name, it.input))
          return
        }
        case 'item_completed': {
          // A text block ended: its text is a whole message. (Barkpark puts a paragraph break in
          // front of the next block's first delta; the bubble is trimmed.)
          part()
          if (ev.native?.params?.item?.type === 'text') message()
          return
        }
        case 'approval_requested': {
          // The turn waits here until the person answers; the text so far lands first.
          whole()
          text.current = ''
          return setAsk(askOf(String(ev.approval_id), String(ev.native?.tool_name ?? 'a tool'), ev.native?.input))
        }
        case 'control_completed':
          // The bot's computer has the answer: the card goes, the turn goes on.
          if (ev.native?.operation === 'answer_approval') setAsk(null)
          return
        case 'turn_completed': {
          whole()
          text.current = null
          if (tail) rows()
          started = tail = spoke = false
          setAsk(null)
          return end()
        }
        case 'error':
        case 'process_failed':
        case 'protocol_error':
          text.current = null
          started = tail = spoke = false
          setAsk(null)
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
      again?.close()
      fleet?.close()
      bot.current = null
      if (leave.current) clearTimeout(leave.current)
      if (typing.current !== null) cancelAnimationFrame(typing.current), (typing.current = null)
    }
  }, [sessionId, transport, land, show, resume, typingSoon, end])

  /** Sends a message with what goes with it. Answers null once it is sent, or the plain words for why it was not
   *  (a file Barkpark does not take, a computer that cannot take files): then nothing was sent and the draft stays. */
  const send = useCallback(
    async (content: string, outgoing: Outgoing[] = []): Promise<string | null> => {
      if (!sessionId) return null
      setError(null)
      try {
        // Each is stored for the conversation first; the message then names a picture by its id,
        // a text file or PDF by its id and its name.
        const refs: AttachmentRef[] = []
        const images: string[] = []
        const files: {name: string; size: string}[] = []
        for (const o of outgoing) {
          if (!transport.upload) throw new Error('This conversation cannot take pictures or files')
          const r = await transport.upload(sessionId, o.data)
          if ('refused' in r) return `${o.name} was not taken: ${r.refused}`
          if (o.file && !isPicture(r.media_type)) refs.push({id: r.id, name: o.name}), files.push({name: o.name, size: fileSize(r.byte_size)})
          else refs.push(r.id), images.push(r.id)
        }
        const sent = (await transport.send(sessionId, content, refs.length ? refs : undefined)) as {refused?: string} | undefined
        if (sent?.refused) return CANNOT_TAKE_FILES
        land({role: 'user', text: content, ...(images.length ? {images} : {}), ...(files.length ? {files} : {})})
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
      return null
    },
    [sessionId, transport, land],
  )

  // One answer per ask: the buttons lock while it is on its way, and open again if it fails.
  const answer = useCallback(
    async (decision: 'allow' | 'deny') => {
      if (!sessionId || !ask || ask.answering || !transport.answer) return
      const id = ask.id
      setAsk((a) => (a?.id === id ? {...a, answering: decision} : a))
      setError(null)
      try {
        await transport.answer(sessionId, id, decision)
      } catch (e) {
        setAsk((a) => (a?.id === id ? {...a, answering: null} : a))
        setError(`Your answer did not reach the bot: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [sessionId, transport, ask],
  )

  // The same for a question: one set of choices per ask.
  const choose = useCallback(
    async (answers: Answers) => {
      if (!sessionId || !ask || ask.answering || !transport.choose) return
      const id = ask.id
      setAsk((a) => (a?.id === id ? {...a, answering: 'choice'} : a))
      setError(null)
      try {
        await transport.choose(sessionId, id, answers)
      } catch (e) {
        setAsk((a) => (a?.id === id ? {...a, answering: null} : a))
        setError(`Your answer did not reach the bot: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [sessionId, transport, ask],
  )

  const picture = useCallback((id: string) => (sessionId && transport.picture ? transport.picture(sessionId, id) : null), [sessionId, transport])

  return {bubbles, working, botState, error, ready, send, picture, ask: ask?.stored && botState !== 'blocked' ? null : ask, answer, choose}
}
