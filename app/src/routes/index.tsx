import {createFileRoute, useRouter} from '@tanstack/react-router'
import {useEffect, useState} from 'react'
import {Shell} from '../components/Shell'
import {Transcript} from '../components/Transcript'
import {Composer} from '../components/Composer'
import {loadChat, startChat} from '../chat/api'
import {useConversation} from '../chat/useConversation'

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
  const [waiting, setWaiting] = useState<string | null>(null)

  const send = async (text: string) => {
    if (!chat.host) return
    if (sessionId && convo.ready) return convo.send(text)
    // The first message opens the conversation on the bot's computer, then goes once the
    // live stream is open, so its run is seen from the start.
    setWaiting(text)
    if (!sessionId && !opening) {
      setOpening(true)
      try {
        setStarted(await startChat({data: chat.host.id}))
      } finally {
        setOpening(false)
      }
    }
  }
  useEffect(() => {
    if (waiting && convo.ready) {
      setWaiting(null)
      void convo.send(waiting)
    }
  }, [waiting, convo.ready, convo.send])

  const computer = !chat.host ? 'Unreachable' : chat.host.online ? 'Asleep' : 'Unreachable'
  return (
    <Shell
      scene={{bots: [{name: chat.bot}], active: chat.bot, panelOpen: true, computer, voice: VOICE}}
      transcript={
        chat.host ? (
          <Transcript bot={chat.bot} startedAt={started?.startedAt ?? chat.startedAt} bubbles={convo.bubbles} working={convo.working} error={convo.error} />
        ) : (
          <div className="transcript">
            <p className="chat-note">
              {chat.bot} has no computer yet. Enroll one: <code>npm run host:enroll</code>, then <code>npm run host</code>.{' '}
              <button className="link" onClick={() => router.invalidate()}>Check again</button>
            </p>
          </div>
        )
      }
      composer={<Composer placeholder={`Message ${chat.bot}`} onSend={send} disabled={!chat.host || opening || !!waiting} />}
    />
  )
}

