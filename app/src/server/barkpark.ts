// The only module that talks to Barkpark. Server-only: importing it from browser code fails
// the build (vite.config.ts), so the token never reaches a page.
import '@tanstack/react-start/server-only'
import {readFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

type Conf = {url: string; token: string; workspace: string; project: string; dataset: string}
let cached: Conf | null = null

/**
 * Where Barkpark is and who we are: BARKPARK_URL, BARKPARK_TOKEN, BARKPARK_WORKSPACE, _PROJECT and _DATASET from
 * the repo's .env, else the owner's own `bp` login on this machine. Phase 1 runs on the
 * owner's Mac, so the owner's login is the honest default; nothing is copied anywhere.
 */
export function conf(): Conf {
  if (cached) return cached
  let bp: {server?: string; token?: string; workspace?: string; project?: string; dataset?: string} = {}
  try {
    bp = JSON.parse(readFileSync(join(homedir(), '.config', 'barkpark', 'config.json'), 'utf8'))
  } catch {}
  const url = process.env.BARKPARK_URL || bp.server
  const token = process.env.BARKPARK_TOKEN || bp.token
  if (!url || !token) throw new Error('No Barkpark: set BARKPARK_URL and BARKPARK_TOKEN in .env, or log in with bp')
  cached = {
    url: url.replace(/\/$/, ''),
    token,
    workspace: process.env.BARKPARK_WORKSPACE || bp.workspace || 'default',
    project: process.env.BARKPARK_PROJECT || bp.project || 'default',
    dataset: process.env.BARKPARK_DATASET || bp.dataset || 'production',
  }
  return cached
}

export class BarkparkError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** One JSON call. A refusal throws with Barkpark's own code and message. */
export async function bp<T>(path: string, init: {method?: string; json?: unknown} = {}): Promise<T> {
  const c = conf()
  const res = await fetch(c.url + path, {
    method: init.method ?? 'GET',
    headers: {authorization: `Bearer ${c.token}`, accept: 'application/json', ...(init.json === undefined ? {} : {'content-type': 'application/json'})},
    body: init.json === undefined ? undefined : JSON.stringify(init.json),
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) throw new BarkparkError(res.status, body?.error?.code ?? 'http_' + res.status, body?.error?.message ?? res.statusText)
  return body as T
}

/** A Barkpark event stream, passed through as it arrives. */
export function bpStream(path: string, signal: AbortSignal, lastEventId?: string | null): Promise<Response> {
  const c = conf()
  return fetch(c.url + path, {
    headers: {authorization: `Bearer ${c.token}`, accept: 'text/event-stream', ...(lastEventId ? {'last-event-id': lastEventId} : {})},
    signal,
  })
}

/** The history cursor a conversation's stream is opened with. Barkpark replays stored rows only
 *  after a Last-Event-ID, and none when there is no header, so a first connect asks from 0
 *  (a reloaded page showed an empty conversation, seen live 2026-11-11). The real stream route
 *  and Gate B's stand-in both take their cursor from here, so the gate measures this rule. */
export const historyCursor = (request: Request): string => request.headers.get('last-event-id') ?? '0'
