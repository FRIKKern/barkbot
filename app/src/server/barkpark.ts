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

/** How long a read (a GET) waits for Barkpark, answer and body: 8 s. A read answers in well under
 *  0.3 s; a slow one under load can take a few seconds and is still an answer (behaviour's slow
 *  page loads hold reads 3 to 4 s), so the bound is twice the slowest answer taken as normal. A page
 *  load waits on a few reads in a row (computers, sessions, bot records, the Main Bot's move-in): a
 *  read that hangs costs it 8 s once, not the whole load, and is then a failed read on the caller's
 *  own failed-read path (the move-in takes nothing).
 *  Not bounded: anything that is not a GET (a message send, an upload, an answer, a pref write),
 *  since one with no answer may have been done and is judged so (a long turn is normal); the event
 *  streams (bpStream); and a picture's bytes (`unbounded`): up to 3 MB on a slow link is not a hang,
 *  and it holds only that picture. */
export const READ_MS = 8000

/** One JSON call. A refusal throws with Barkpark's own code and message; a read past READ_MS throws a
 *  plain Error (not a BarkparkError: Barkpark did not answer). */
export async function bp<T>(path: string, init: {method?: string; json?: unknown; unbounded?: boolean; signal?: AbortSignal; headers?: Record<string, string>; answered?: (res: Response) => void} = {}): Promise<T> {
  const c = conf()
  const method = init.method ?? 'GET'
  const bounded = method === 'GET' && !init.unbounded
  let text: string
  let res: Response
  try {
    res = await fetch(c.url + path, {
      method,
      headers: {authorization: `Bearer ${c.token}`, accept: 'application/json', ...(init.json === undefined ? {} : {'content-type': 'application/json'}), ...init.headers},
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
      signal: bounded ? AbortSignal.timeout(READ_MS) : init.signal,
    })
    text = await res.text()
  } catch (e) {
    if (bounded && (e as Error)?.name === 'TimeoutError') throw new Error(`Barkpark did not answer a read within ${READ_MS / 1000} s`)
    throw e
  }
  init.answered?.(res)
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
