// The owner's own Barkpark login, for the owner-run live checks (turn-live, cancel-live): from
// BARKPARK_URL / BARKPARK_TOKEN / BARKPARK_WORKSPACE, else ~/.config/barkpark/config.json, as the
// app's server reads it (app/src/server/barkpark.ts). The token is never printed.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function barkparkLive() {
  let bp = {};
  try { bp = JSON.parse(readFileSync(join(homedir(), '.config', 'barkpark', 'config.json'), 'utf8')); } catch {}
  const url = (process.env.BARKPARK_URL || bp.server || '').replace(/\/$/, '');
  const token = process.env.BARKPARK_TOKEN || bp.token;
  if (!url || !token) throw new Error('no Barkpark login (bp login, or BARKPARK_URL and BARKPARK_TOKEN)');
  const workspace = process.env.BARKPARK_WORKSPACE || bp.workspace || 'default';
  // One JSON call; a refusal throws with its status (never the body: it may quote the message).
  const call = async (p, init = {}) => {
    const res = await fetch(url + p, { ...init, headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers } });
    const text = await res.text();
    if (!res.ok) throw new Error(`${init.method || 'GET'} ${p.split('?')[0]} answered ${res.status}`);
    return text ? JSON.parse(text) : null;
  };
  const session = (id, since = 999999999) => call(`/v1/chat/sessions/${encodeURIComponent(id)}?since=${since}`);
  const hosts = async () => (await call(`/w/${encodeURIComponent(workspace)}/v1/chat-hosts`)).hosts;
  // The computer a conversation runs on, by name (null: not one of the caller's enrolled computers).
  const hostOf = async (id) => {
    const s = await session(id);
    const h = (await hosts()).find((x) => x.id === s.execution_host_id && x.enrolled && !x.revoked);
    return { id: s.execution_host_id ?? null, name: h?.name ?? null, online: !!h?.online };
  };
  return { url, token, call, session, hosts, hostOf };
}
