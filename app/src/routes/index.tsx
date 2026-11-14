import {createFileRoute, useRouter} from '@tanstack/react-router'
import {useEffect, useState} from 'react'
import {Shell} from '../components/Shell'
import {Transcript} from '../components/Transcript'
import {Composer, placeholderFor, type Picture, type WaitingFile} from '../components/Composer'
import {computerOnline, loadChat, renameBot, startChat} from '../chat/api'
import {useConversation, type Outgoing} from '../chat/useConversation'

// The bot, live: its computer and conversation come from Barkpark (loadChat). No made-up data:
// with no computer enrolled, the page says so (D11).
export const Route = createFileRoute('/')({
  loader: () => loadChat(),
  component: Home,
})

// The Voice card's values until Barkpark has a voice setting: what the oracle's fresh bot shows
// (fixtures/states: Helix, 1x, Auto-detect).
const VOICE = {voice: 'Helix', speed: '1x', language: 'Auto-detect'}

function Home() {
  const chat = Route.useLoaderData()
  const router = useRouter()
  const [started, setStarted] = useState<{sessionId: string; startedAt: string} | null>(null)
  const sessionId = started?.sessionId ?? chat.sessionId
  const convo = useConversation(sessionId)
  const [opening, setOpening] = useState(false)
  const [waiting, setWaiting] = useState<{text: string; outgoing: Outgoing[]; done: (why: string | null) => void} | null>(null)
  // The bot's name as renamed in the details panel: the composer and the transcript follow it at
  // once, and it is saved to Barkpark, so a reload shows it too (loadChat reads it back).
  const [name, setName] = useState(chat.bot)
  const [renameError, setRenameError] = useState<string | null>(null)
  const rename = async (_bot: string, next: string) => {
    setName(next)
    try {
      await renameBot({data: next})
      setRenameError(null)
    } catch (e) {
      setRenameError(`The new name was not saved: ${(e as Error).message}`)
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
        setStarted(await startChat({data: chat.host.id}))
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
      scene={{bots: [{name: chat.bot}], active: chat.bot, panelOpen: true, computer, voice: VOICE}}
      onRenameBot={rename}
      workingBots={convo.botState === 'working' ? [chat.bot] : []}
      transcript={
        chat.host ? (
          <Transcript bot={name} startedAt={started?.startedAt ?? chat.startedAt} bubbles={convo.bubbles} working={convo.working} error={convo.error ?? renameError ?? offline} picture={convo.picture} ask={convo.ask} onAnswer={convo.answer} onChoose={convo.choose} />
        ) : (
          <div className="transcript">
            <p className="chat-note">
              {name} has no computer yet. Enroll one: <code>npm run host:enroll</code>, then <code>npm run host</code>.{' '}
              <button className="link" onClick={() => router.invalidate()}>Check again</button>
            </p>
          </div>
        )
      }
      composer={<Composer placeholder={placeholderFor(name, convo.ask)} onSend={send} disabled={!chat.host || opening || !!waiting} />}
    />
  )
}

