import {createFileRoute, useNavigate, useRouter} from '@tanstack/react-router'
import {useEffect, useRef, useState} from 'react'
import {Shell, useUnread} from '../components/Shell'
import {Transcript} from '../components/Transcript'
import {Composer, placeholderFor, type ComposerStart, type Picture, type WaitingFile} from '../components/Composer'
import {computerOnline, createBot, loadChat, renameBot, startChat, type Chat} from '../chat/api'
import {barkpark, MAY_HAVE_GONE, useConversation, type BotState, type Outgoing, type Transport} from '../chat/useConversation'
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
// The line over the words of a first message given up on when a held pick went through.
const NOT_SENT = 'This message was not sent: its conversation did not open in time. Send it again when you are back.'
const MAYBE_SENT = `This message was on its way when you left and had no answer yet, so ${MAY_HAVE_GONE}`

type HomeProps = {chat: Chat; state: BotState; working: string[]; unread: string[]; onOpened: (sessionId: string) => void; onPick: (id: string) => Promise<void>; kept?: ComposerStart; onKeep: (botId: string, start: ComposerStart | null) => void}

function Home({chat, state, working, unread, onOpened, onPick, kept, onKeep}: HomeProps) {
  const router = useRouter()
  const navigate = useNavigate()
  // Picked another bot (`target`): its page is loading, and this one's rows are not shown under the
  // new name meanwhile. While a first message is still opening its conversation (`parked`), the pick
  // is held (task-f954370021fb60fb: the pick remounts Home, which dropped the parked message):
  // - the message goes once, to this bot; then the pick goes through
  // - it is refused or fails: the pick is taken back; this bot's page shows why, with the words
  // - its conversation is made but cannot be saved to this bot (startChat's kept: false): the pick
  //   is taken back, so this page shows that line; the message still goes once, to that conversation
  // - picking this bot again takes the pick back; the last pick wins
  // - after PICK_HOLD_MS the pick goes through, and the words wait in this bot's box with a line:
  //   not sent (the conversation never opened; they are never sent later on their own), or
  //   perhaps sent (the send was on its way and had no answer yet: look before sending again)
  const [target, setTarget] = useState<string | null>(null)
  const leaving = target !== null
  const pendingPick = useRef<string | null>(null)
  const parked = useRef(false)
  const sending = useRef(false)
  const gaveUp = useRef(false)
  const parkedWords = useRef<ComposerStart | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unhold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
  }
  // A pick that goes (at once, or once its held message went) is `going`; the open bot picked again
  // before that page loads goes back to it, so the last click wins and the rail and the page agree
  // (task-4a719948e5ff5b80). After a give-up the words are already kept: that pick stays. Create's
  // own navigation needs none: its dialog is modal and stays open until the new bot's page is up.
  // But Create can be pressed while a first message is still opening: it leaves at once, as a
  // give-up does (task-37b324b9e0b5b768).
  const going = useRef(false)
  // The parked message is over: sent (why null), or not (why).
  const settle = (why: string | null) => {
    parked.current = false
    sending.current = false
    parkedWords.current = null
    unhold()
    const id = pendingPick.current
    pendingPick.current = null
    if (!id) return
    if (why === null) {
      going.current = true
      return void onPick(id)
    }
    setTarget(null)
  }
  const pick = (id: string) => {
    if (id === chat.botId) {
      if (gaveUp.current) return
      pendingPick.current = null
      unhold()
      setTarget(null)
      if (going.current) {
        going.current = false
        void onPick(id)
      }
      return
    }
    setTarget(id)
    if (!parked.current) {
      going.current = true
      return void onPick(id)
    }
    pendingPick.current = id
    holdTimer.current ??= setTimeout(giveUp, PICK_HOLD_MS)
  }
  // The page leaves while a first message is parked: its words wait in this bot's box, with a line
  // that says whether it may have gone; it is never sent later on its own.
  const keepParked = () => {
    gaveUp.current = true
    const words = parkedWords.current
    if (words) onKeep(chat.botId, {...words, line: sending.current ? MAYBE_SENT : NOT_SENT})
    parked.current = false
  }
  // The hold is over and the message is not on its way: keep its words for this bot, then pick.
  const giveUp = () => {
    holdTimer.current = null
    if (!parked.current || !pendingPick.current) return
    keepParked()
    const id = pendingPick.current
    pendingPick.current = null
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
    if (parked.current) {
      keepParked()
      pendingPick.current = null
      unhold()
    }
    await navigate({to: '/', search: {bot: id}})
  }
  const [started, setStarted] = useState<{sessionId: string; startedAt: string} | null>(null)
  const sessionId = started?.sessionId ?? chat.sessionId
  const convo = useConversation(sessionId, live, state)
  const [opening, setOpening] = useState(false)
  const [waiting, setWaiting] = useState<{text: string; outgoing: Outgoing[]; done: (why: string | null) => void} | null>(null)
  // A first message that failed to send, with no pick held: said until the next send, as convo.error is.
  const [failedLine, setFailedLine] = useState<string | null>(null)
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
    setFailedLine(null)
    const outgoing: Outgoing[] = [...pictures.map((p) => ({data: p.data, name: p.name})), ...files.filter((f) => f.data).map((f) => ({data: f.data!, name: f.name, file: true}))]
    if (sessionId && convo.ready) return convo.send(text, outgoing)
    // The first message opens the conversation on the bot's computer, then goes once the
    // live stream is open, so its run is seen from the start.
    parked.current = true
    parkedWords.current = {draft: text, pictures, files}
    let done!: (why: string | null) => void
    const sent = new Promise<string | null>((d) => {
      done = d
      setWaiting({text, outgoing, done: d})
    })
    if (!sessionId && !opening) {
      setOpening(true)
      try {
        const made = await startChat({data: {hostId: chat.host.id, botId: chat.botId}})
        setStarted(made)
        onOpened(made.sessionId)
        if (!made.kept) {
          setNote('This conversation was not saved to the bot, so a reload may not open it again.')
          // The line is said here, on this bot's page, so a held pick is taken back (task-97a57c9b49a06691).
          if (pendingPick.current) {
            pendingPick.current = null
            unhold()
            setTarget(null)
          }
        }
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
        else if (failed) setFailedLine(failed)
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
    const hostId = chat.host.id
    const t = setInterval(() => void computerOnline({data: {hostId}}).then(setOnline, () => {}), 5000)
    return () => clearInterval(t)
  }, [chat.host])
  const offline = chat.host && !online ? `${name}'s computer is unreachable. Messages wait until it is back. Start it with: npm run host` : null
  // While a pick loads, this page still holds the bot it is leaving, but the panel already names the
  // picked one: say nothing about a computer until the picked bot's own page knows its own.
  const computer = leaving ? '' : online ? 'Asleep' : 'Unreachable'
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
          <Transcript bot={name} startedAt={started?.startedAt ?? chat.startedAt} bubbles={convo.bubbles} working={convo.working} error={convo.error ?? failedLine ?? note ?? chat.notice ?? offline} picture={convo.picture} ask={convo.ask} onAnswer={convo.answer} onChoose={convo.choose} />
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

