// The conversation's server functions. Their bodies run on the server only (TanStack Start
// strips them from the browser bundle), so they may use server/barkpark.
import {createServerFn} from '@tanstack/react-start'
import {bp, conf} from '../server/barkpark'

export type Host = {id: string; name: string; online: boolean}
export type Chat = {bot: string; host: Host | null; sessionId: string | null; startedAt: string | null}

type RawHost = {id: string; name: string; online: boolean; enrolled: boolean; revoked: boolean}
type RawSession = {id: string; execution_target: string; execution_host_id?: string | null; inserted_at: string; status: string}

// Phase 1 has one bot, on one computer: the host enrolled under this name (npm run host:enroll).
const HOST_NAME = () => process.env.BARKBOT_HOST_NAME || 'BarkBot Mac'
const BOT_NAME = () => process.env.BARKBOT_NAME || 'BarkBot'

// The bot's name as the person last renamed it (the details panel's Bot name field). Barkpark has
// no bot record yet, so it is a per-account pref (/v1/prefs, docs/contracts/user-prefs.md in
// Barkpark): phase 1 is one bot under the owner's own login. Unset, the bot is BARKBOT_NAME.
const PREF_KEY = 'barkbot.bot'
const prefPath = () => {
  const c = conf()
  return `/w/${c.workspace}/p/${c.project}/v1/prefs/${encodeURIComponent(c.dataset)}/${PREF_KEY}`
}

async function savedName(): Promise<string | null> {
  try {
    const {value} = await bp<{value: {name?: unknown} | null}>(prefPath())
    return typeof value?.name === 'string' && value.name.trim() ? value.name : null
  } catch (e) {
    // The name is not worth a broken page: say why and show the default one.
    console.warn(`barkbot: could not read the saved bot name (${(e as Error).message}); showing ${BOT_NAME()}`)
    return null
  }
}

async function findHost(): Promise<Host | null> {
  const {hosts} = await bp<{hosts: RawHost[]}>(`/w/${conf().workspace}/v1/chat-hosts`)
  const h = hosts.find((x) => x.name === HOST_NAME() && x.enrolled && !x.revoked)
  return h ? {id: h.id, name: h.name, online: h.online} : null
}

/** The bot, its computer, and its conversation (the newest session on that computer). */
export const loadChat = createServerFn({method: 'GET'}).handler(async (): Promise<Chat> => {
  const [host, saved] = await Promise.all([findHost(), savedName()])
  const bot = saved ?? BOT_NAME()
  if (!host) return {bot, host: null, sessionId: null, startedAt: null}
  const {sessions} = await bp<{sessions: RawSession[]}>('/v1/chat/sessions')
  const mine = sessions.filter((s) => s.execution_target === 'registered_host' && s.execution_host_id === host.id)
  mine.sort((a, b) => b.inserted_at.localeCompare(a.inserted_at))
  return {bot, host, sessionId: mine[0]?.id ?? null, startedAt: mine[0]?.inserted_at ?? null}
})

/** A new conversation on the bot's computer. Claude starts in plan mode (the host's default). */
export const startChat = createServerFn({method: 'POST'})
  .validator((hostId: string) => hostId)
  .handler(async ({data: hostId}) => {
    const s = await bp<RawSession>('/v1/chat/sessions', {method: 'POST', json: {provider: 'claude', execution_target: 'registered_host', execution_host_id: hostId}})
    return {sessionId: s.id, startedAt: s.inserted_at}
  })

export const sendMessage = createServerFn({method: 'POST'})
  .validator((d: {id: string; content: string}) => d)
  .handler(async ({data}) => {
    await bp(`/v1/chat/sessions/${encodeURIComponent(data.id)}/messages`, {method: 'POST', json: {content: data.content}})
    return {accepted: true}
  })

/** Saves the bot's new name. Details never sends an empty one (it puts the old name back); this
 *  refuses one anyway, so no path can save a blank bot. */
export const renameBot = createServerFn({method: 'POST'})
  .validator((name: unknown) => {
    if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new Error('A bot name is 1 to 200 characters')
    return name
  })
  .handler(async ({data: name}) => {
    await bp(prefPath(), {method: 'PUT', json: {value: {name}}})
    return {name}
  })
