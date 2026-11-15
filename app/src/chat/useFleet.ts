import {useEffect, useState} from 'react'
import type {BotState} from './useConversation'

/** Every bot's state, from Barkpark's one fleet stream (/v1/chat/events: a snapshot, then a
 *  `state` flip per session). The page opens one, whatever the number of bots, and maps each bot
 *  to its session. Barkpark scopes the stream by workspace, not by a list fixed at connect, so a
 *  conversation started later is heard on it too.
 *  Answers a session's state: null until the snapshot (busy, as useConversation reads null), and
 *  idle for a session the snapshot does not list (as useConversation did). */
export function useFleet(url = '/api/chat/events'): (sessionId: string | null) => BotState {
  const [states, setStates] = useState<Map<string, BotState> | null>(null)
  useEffect(() => {
    const es = new EventSource(url)
    es.addEventListener('snapshot', (e) => {
      const f = JSON.parse((e as MessageEvent).data) as {sessions?: {session_id: string; agent_state: BotState}[]}
      setStates(new Map((f.sessions ?? []).map((x) => [x.session_id, x.agent_state])))
    })
    es.addEventListener('state', (e) => {
      const f = JSON.parse((e as MessageEvent).data) as {session_id: string; agent_state: BotState}
      setStates((m) => new Map(m ?? []).set(f.session_id, f.agent_state))
    })
    return () => es.close()
  }, [url])
  return (id) => (id === null || states === null ? null : (states.get(id) ?? 'idle'))
}
