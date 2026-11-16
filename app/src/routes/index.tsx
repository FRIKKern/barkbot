import {createFileRoute, useNavigate, useRouter} from '@tanstack/react-router'
import {useEffect, useRef, useState} from 'react'
import {Shell, useUnread} from '../components/Shell'
import {Transcript} from '../components/Transcript'
import {Composer, placeholderFor, type ComposerStart, type Picture, type WaitingFile} from '../components/Composer'
import {computerOnline, createBot, loadChat, renameBot, startChat, type Chat} from '../chat/api'
import {barkpark, useConversation, type BotState, type Outgoing, type Transport} from '../chat/useConversation'
import {useFleet} from '../chat/useFleet'

// The bot, live: its computer and conversation come from Barkpark (loadChat). No made-up data:
// with no computer enrolled, the page says so (D11).
// ?bot=<id>: the open bot (a reload keeps it). Its id keys the page, so another bot's page starts fresh.
// Picking a tile goes to that bot's ?bot=. The page above it (Page) stays: it holds the one fleet
// stream, every bot's Working, and the unread dots, so they outlive a pick.
export const Route = createFileRoute('/')({
  validateSearch: (s: Record<string, unknown>): {bot?: string} => (typeof s.bot === 'string' ? {bot: s.bot} : {}),
  loaderDeps: ({search}) => ({bot: search.bot ?? null}),
  loader: ({deps}) => loadChat({data: deps.bot}),
  component: function Page() {
    const chat = Route.useLoaderData()
    const navigate = useNavigate()
    const fleet = useFleet()
    // A conversation opened on this page (the first message), by bot id, until a reload reads it back.
    const [opened, setOpened] = useState<Record<string, string>>({})
    // A first message given up on when a held pick went through: its words wait in that bot's box.
    const [kept, setKept] = useState<Record<string, ComposerStart>>({})
    const sessions = {...chat.sessions, ...opened}
    const of = (id: string) => fleet(sessions[id] ?? null)
    const working = chat.bots.filter((b) => sessions[b.id] && of(b.id) === 'working').map((b) => b.id)
    const unread = useUnread(working)
    const botId = chat.botId
    return (
      <Home
        key={botId}
        chat={chat}
        state={of(botId)}
        working={working}
        unread={unread}
        onOpened={(sessionId) => setOpened((o) => ({...o, [botId]: sessionId}))}
        kept={kept[botId]}
        onKeep={(id, start) => setKept(({[id]: _, ...k}) => (start ? {...k, [id]: start} : k))}
        onPick={(id) => navigate({to: '/', search: {bot: id}})}
      />
    )
  },
})

// The conversation's own events and sends; the bot's state comes from the page's fleet stream.
const live: Transport = {...barkpark, fleet: undefined}

// The Voice card's values until Barkpark has a voice setting: what the oracle's fresh bot shows
// (fixtures/states: Helix, 1x, Auto-detect).
const VOICE = {voice: 'Helix', speed: '1x', language: 'Auto-detect'}

// How long a pick waits for a first message still opening its conversation (Home's pick).
const PICK_HOLD_MS = 6000

type HomeProps = {chat: Chat; state: BotState; working: string[]; unread: string[]; onOpened: (sessionId: string) => void; onPick: (id: string) => Promise<void>; kept?: ComposerStart; onKeep: (botId: string, start: ComposerStart | null) => void}

function Home({chat, state, working, unread, onOpened, onPick, kept, onKeep}: HomeProps) {
  const router = useRouter()
  const navigate = useNavigate()
  // Picked another bot (`target`): its page is loading, and this one's rows are not shown under the
  // new name meanwhile. While a first message is still opening its conversation (`parked`), the pick
  // is held (task-f954370021fb60fb: the pick remounts Home, which dropped the parked message):
  // - the message goes once, to this bot; then the pick goes through
  // - it is refused or fails: the pick is taken back; this bot's page shows why, with the words
  // - picking this bot again takes the pick back; the last pick wins
  // - after PICK_HOLD_MS with the message not yet going, the pick goes through, and the words wait,
  //   unsent, in this bot's box with a line saying so; they are never sent later on their own
  const [target, setTarget] = useState<string | null>(null)
  const leaving = target !== null
  const pendingPick = useRef<string | null>(null)
  const parked = useRef(false)
  const sending = useRef(false)
  const gaveUp = useRef(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unhold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
  }
  // The parked message is over: sent (why null), or not (why).
  const settle = (why: string | null) => {
    parked.current = false
    sending.current = false
    unhold()
    const id = pendingPick.current
    pendingPick.current = null
    if (!id) return
    if (why === null) return void onPick(id)
    setTarget(null)
  }
  const pick = (id: string) => {
    if (id === chat.botId) {
      pendingPick.current = null
      unhold()
      return setTarget(null)
    }
    setTarget(id)
    if (!parked.current) return void onPick(id)
    pendingPick.current = id
    holdTimer.current ??= setTimeout(giveUp, PICK_HOLD_MS)
  }
  // The hold is over and the message is not on its way: keep its words for this bot, then pick.
  const giveUp = () => {
    holdTimer.current = null
    if (sending.current || !parked.current || !pendingPick.current) return
    const w = waitingRef.current
    gaveUp.current = true
    if (w) onKeep(chat.botId, {...w.start, line: 'This message was not sent: its conversation did not open in time. Send it again when you are back.'})
    const id = pendingPick.current
    pendingPick.current = null
    parked.current = false
    void onPick(id)
  }
  useEffect(() => () => unhold(), [])
  // Words kept from a given-up message are in the box now (Composer's start): the page forgets them.
  useEffect(() => {
    if (kept) onKeep(chat.botId, null)
  }, [])
  // Create in the New Bot dialog: the bot is made (its record, then its id in the list), and the
  // page opens it, with its empty conversation; the rail shows it at the end of the pinned bots.
  const create = async (b: {name: string; shape: string; colour: string}) => {
    const {id} = await createBot({data: b})
    await navigate({to: '/', search: {bot: id}})
  }
  const [started, setStarted] = useState<{sessionId: string; startedAt: string} | null>(null)
  const sessionId = started?.sessionId ?? chat.sessionId
  const convo = useConversation(sessionId, live, state)
  const [opening, setOpening] = useState(false)
  type Waiting = {text: string; outgoing: Outgoing[]; start: ComposerStart; done: (why: string | null) => void}
  const [waiting, setWaiting] = useState<Waiting | null>(null)
  const waitingRef = useRef<Waiting | null>(null)
  waitingRef.current = waiting
  // The bot's name as renamed in the details panel: the composer and the transcript follow it at
  // once, and it is saved to Barkpark, so a reload shows it too (loadChat reads it back).
  const [name, setName] = useState(chat.bot)
  // A plain line when the name or the conversation was not saved (the page goes on).
  const [note, setNote] = useState<string | null>(null)
  const rename = async (_id: string, next: string) => {
    setName(next)
    try {
      await renameBot({data: {id: chat.botId, name: next}})
      setNote(null)
    } catch (e) {
      setNote(`The new name was not saved: ${(e as Error).message}`)
    }
  }

  // Answers why nothing was sent, if so (the composer then keeps the draft).
  const send = async (text: string, pictures: Picture[] = [], files: WaitingFile[] = []): Promise<string | null> => {
    if (!chat.host) return null
    const outgoing: Outgoing[] = [...pictures.map((p) => ({data: p.data, name: p.name})), ...files.filter((f) => f.data).map((f) => ({data: f.data!, name: f.name, file: true}))]
    if (sessionId && convo.ready) return convo.send(text, outgoing)
    // The first message opens the conversation on the bot's computer, then goes once the
    // live stream is open, so its run is seen from the start.
    parked.current = true
    let done!: (why: string | null) => void
    const sent = new Promise<string | null>((d) => {
      done = d
      setWaiting({text, outgoing, start: {draft: text, pictures, files}, done: d})
    })
    if (!sessionId && !opening) {
      setOpening(true)
      try {
        const made = await startChat({data: {hostId: chat.host.id, botId: chat.botId}})
        setStarted(made)
        onOpened(made.sessionId)
        if (!made.kept) setNote('This conversation was not saved to the bot, so a reload may not open it again.')
      } catch (e) {
        // No conversation was made (botFolder refused, or Barkpark did): say why; the draft stays.
        setWaiting(null)
        const why = (e as Error).message
        done(why)
        settle(why)
      } finally {
        setOpening(false)
      }
    }
    return sent
  }
  useEffect(() => {
    if (waiting && convo.ready && !gaveUp.current) {
      setWaiting(null)
      sending.current = true
      let failed: string | null = null
      void convo.send(waiting.text, waiting.outgoing, (why) => (failed = why)).then((why) => {
        const held = pendingPick.current !== null
        // A failed send while a pick is held: the words come back with the reason, as a refusal.
        if (failed && held) why = failed
        else if (failed) setNote(failed)
        waiting.done(why)
        settle(why ?? failed)
      })
    }
  }, [waiting, convo.ready, convo.send])

  // The computer can stop and come back while the page is open: ask again every few seconds.
  // A failed ask keeps the last answer (the page may be the thing that is offline).
  const [online, setOnline] = useState(chat.host?.online ?? false)
  useEffect(() => {
    if (!chat.host) return
    setOnline(chat.host.online)
    const t = setInterval(() => void computerOnline().then(setOnline, () => {}), 5000)
    return () => clearInterval(t)
  }, [chat.host])
  const offline = chat.host && !online ? `${name}'s computer is unreachable. Messages wait until it is back. Start it with: npm run host` : null
  const computer = online ? 'Asleep' : 'Unreachable'
  return (
    <Shell
      scene={{bots: chat.bots, active: chat.botId, panelOpen: true, computer, voice: VOICE}}
      onRenameBot={rename}
      onCreateBot={create}
      onPickBot={pick}
      picked={target ?? chat.botId}
      workingBots={working}
      unreadBots={unread}
      transcript={
        leaving ? (
          <div className="transcript" />
        ) : chat.host ? (
          <Transcript bot={name} startedAt={started?.startedAt ?? chat.startedAt} bubbles={convo.bubbles} working={convo.working} error={convo.error ?? note ?? chat.notice ?? offline} picture={convo.picture} ask={convo.ask} onAnswer={convo.answer} onChoose={convo.choose} />
        ) : (
          <div className="transcript">
            <p className="chat-note">
              {name} has no computer yet. Enroll one: <code>npm run host:enroll</code>, then <code>npm run host</code>.{' '}
              <button className="link" onClick={() => router.invalidate()}>Check again</button>
            </p>
          </div>
        )
      }
      composer={<Composer placeholder={placeholderFor(name, convo.ask)} onSend={send} disabled={!chat.host || opening || !!waiting || leaving} start={kept} />}
    />
  )
}

