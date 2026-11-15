import {createFileRoute, useNavigate, useRouter} from '@tanstack/react-router'
import {useEffect, useState} from 'react'
import {Shell, useUnread} from '../components/Shell'
import {Transcript} from '../components/Transcript'
import {Composer, placeholderFor, type Picture, type WaitingFile} from '../components/Composer'
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

type HomeProps = {chat: Chat; state: BotState; working: string[]; unread: string[]; onOpened: (sessionId: string) => void; onPick: (id: string) => Promise<void>}

function Home({chat, state, working, unread, onOpened, onPick}: HomeProps) {
  const router = useRouter()
  const navigate = useNavigate()
  // Picked another bot: its page is loading. This one's rows are not shown under the new name meanwhile.
  const [leaving, setLeaving] = useState(false)
  const pick = (id: string) => {
    if (id === chat.botId) return
    setLeaving(true)
    void onPick(id)
  }
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
  const [waiting, setWaiting] = useState<{text: string; outgoing: Outgoing[]; done: (why: string | null) => void} | null>(null)
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
    const sent = new Promise<string | null>((done) => setWaiting({text, outgoing, done}))
    if (!sessionId && !opening) {
      setOpening(true)
      try {
        const made = await startChat({data: {hostId: chat.host.id, botId: chat.botId}})
        setStarted(made)
        onOpened(made.sessionId)
        if (!made.kept) setNote('This conversation was not saved to the bot, so a reload may not open it again.')
      } finally {
        setOpening(false)
      }
    }
    return sent
  }
  useEffect(() => {
    if (waiting && convo.ready) {
      setWaiting(null)
      void convo.send(waiting.text, waiting.outgoing).then(waiting.done)
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
      composer={<Composer placeholder={placeholderFor(name, convo.ask)} onSend={send} disabled={!chat.host || opening || !!waiting || leaving} />}
    />
  )
}

