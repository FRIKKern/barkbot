// Every server door is closed unless it proves otherwise (task-26a1a137b955ef3b; rev299 on #320,
// the lead's rulings: deny by default, never try to spot which doors take a session id). The scan
// reads every source file under app/ (appSources: all but node_modules and generated output). A door is:
//  - every direct call `createServerFn(` (const, let, var, export default, an object member), each
//    judged by its own .handler; and
//  - every method handler (GET, POST, DELETE, ...) of every server route under app/src/routes, each
//    judged on its own, never the whole file.
// A door passes only when its handler's first statement is its own kind's guard, standing alone, on
// a field of the handler's input: `await requireOwnSessionFn(data.<key>)` for a server function (it
// throws an Error), `await requireOwnSessionRoute(params.<key>)` for a route (it throws a 404
// Response); the guard imported from server/own-session, not renamed, not made in the file. Or when
// it is on OPEN (below) with a reason of 10 characters or more. Anything else is a red, not a pass:
// a handler passed by name, an expression body, `handlers` the scan cannot read, and createServerFn
// anywhere but its plain named import from @tanstack/react-start and a direct call (an alias, a
// namespace, a bracket, a destructure, a re-export, a comment or a string that names it).
// What it still does not see: which input the guard names (requireOwnSessionFn(data.a) passes while
// data.b is the session used), a validator that reads Barkpark before the handler runs, and a door
// made by something other than createServerFn or a route's server handlers (createMiddleware).
import { readdirSync, readFileSync } from 'node:fs';

/** The doors that open without the guard, each with its reason. A stale entry (no such door) is a red. */
export const OPEN = Object.freeze({
  'app/src/chat/api.ts loadChat': "takes no session id: reads the caller's own bot records, and opens only a conversation one of them names (ownSessions)",
  'app/src/chat/api.ts createBot': 'takes no session id: writes a new bot record under a fresh id',
  'app/src/chat/api.ts computerOnline': 'takes a computer id, answered only for one of ownHosts()',
  'app/src/chat/api.ts startChat': 'makes the conversation, from a computer id and a bot id: no session id to check yet (the page picks the computer: T1 known miss 4, task-7baccaa5734a64bd)',
  'app/src/chat/api.ts renameBot': "takes a bot id, and writes only a record trusted() holds as the caller's own",
  'app/src/routes/api/chat.events.ts GET': "takes no id: Barkpark's fleet stream, cut by server/fleet.ts to our own sessions' {session_id, agent_state} in snapshot and state frames; titles, ts, heartbeat and title frames, and every other session never go out",
  'app/src/routes/api/gate-b.$trace.ts GET': 'development builds only (404 in production): a recorded oracle trace, no Barkpark session',
  'app/src/routes/api/gate-b.$trace.ts POST': 'development builds only (404 in production): a recorded oracle trace, no Barkpark session',
});

export const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const START = /@tanstack\/[\w-]*start[\w-]*/;
const GUARD = Object.freeze({ fn: 'requireOwnSessionFn', route: 'requireOwnSessionRoute' });
// What appSources leaves out: installed packages and what a build or the router writes.
const SKIP = new Set(['node_modules', 'dist', '.output', '.tanstack', '.vinxi', '.nitro']);
const GENERATED = /\.gen\.[cm]?[jt]sx?$/;

/** Every source file under `abs` (the repo's app/), as [{path, src}] with paths from `rel`. */
export function appSources(abs, rel = 'app') {
  return readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return SKIP.has(e.name) ? [] : appSources(`${abs}/${e.name}`, `${rel}/${e.name}`);
    return SOURCE.test(e.name) && !GENERATED.test(e.name) ? [{ path: `${rel}/${e.name}`, src: readFileSync(`${abs}/${e.name}`, 'utf8') }] : [];
  });
}
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'ANY']);

/** The source with every comment, string and template text blanked to spaces, the same length, so
 *  code found in it is code (a guard in a string or a comment is not a guard). A template's ${ }
 *  stays code. Regex literals are skipped by the usual rule: a / where a value cannot end. */
export function codeOf(src) {
  const out = src.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  const stack = []; // open template literals, by the brace depth their ${ } started at
  let depth = 0, i = 0, last = '';
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { const e = src.indexOf('\n', i); const end = e < 0 ? src.length : e; blank(i, end); i = end; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; blank(i, end); i = end; continue; }
    if (c === "'" || c === '"') { let j = i + 1; while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1; blank(i + 1, j); i = j + 1; last = 'v'; continue; }
    if (c === '`' || (c === '}' && stack.length && stack.at(-1) === depth)) {
      if (c === '}') stack.pop(); // back into the template's text after its ${ }
      let j = i + 1;
      while (j < src.length && src[j] !== '`' && !(src[j] === '$' && src[j + 1] === '{')) j += src[j] === '\\' ? 2 : 1;
      blank(i + 1, j);
      if (src[j] === '$') { stack.push(depth); i = j + 2; last = '('; continue; }
      i = j + 1; last = 'v'; continue;
    }
    if (c === '/' && (last === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(last) || /\b(?:return|typeof|case|in|of|void|delete|throw)$/.test(src.slice(Math.max(0, i - 8), i).trimEnd()))) {
      let j = i + 1, cls = false;
      while (j < src.length && src[j] !== '\n' && (cls || src[j] !== '/')) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
      blank(i + 1, j); i = j + 1; last = 'v'; continue;
    }
    if (c === '{') depth++;
    if (c === '}') depth--;
    if (!/\s/.test(c)) last = /[\w$)\]]/.test(c) ? 'v' : c;
    i++;
  }
  return out.join('');
}

const ws = (s, i) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };
const PAIR = { '(': ')', '{': '}', '[': ']' };
/** The index of the bracket that closes the one at `i` (in code: strings are blank), or -1. */
const close = (s, i) => { const want = [PAIR[s[i]]]; for (let j = i + 1; j < s.length; j++) { if (PAIR[s[j]]) want.push(PAIR[s[j]]); else if (s[j] === want.at(-1)) { want.pop(); if (!want.length) return j; } else if (/[)}\]]/.test(s[j])) return -1; } return -1; };
/** A parameter list's first parameter: up to its first comma at bracket depth 0. */
const firstParam = (list) => { let d = 0; for (let k = 0; k < list.length; k++) { const c = list[k]; if ('([{<'.includes(c)) d++; else if (')]}>'.includes(c)) d--; else if (c === ',' && d === 0) return list.slice(0, k).trim(); } return list.trim(); };
const lineAt = (s, i) => s.slice(0, i).split('\n').length;

/** A function written at `i` (an arrow, `function`, or a method's `(…) {`): where its body opens and
 *  the name its first parameter gives the input under `key` (data, params). null: not a function the
 *  scan can read (a name, an expression body). */
function fnAt(code, src, i, key) {
  let j = ws(code, i);
  if (code.startsWith('async', j) && !/[\w$]/.test(code[j + 5] ?? '')) j = ws(code, j + 5);
  if (code.startsWith('function', j)) { j = ws(code, j + 8); while (/[\w$*]/.test(code[j])) j++; j = ws(code, j); }
  let param;
  if (code[j] === '(') { const e = close(code, j); if (e < 0) return null; param = firstParam(src.slice(j + 1, e)); j = ws(code, e + 1); }
  else { const m = /^[A-Za-z_$][\w$]*/.exec(code.slice(j)); if (!m) return null; param = m[0]; j = ws(code, j + m[0].length); }
  // A return type, read at bracket depth 0: up to the arrow, or to the body of a `function` (a { that
  // follows a finished type, not one that starts it or follows | & , < :).
  if (code[j] === ':') {
    let d = 0, k = ws(code, j + 1), typed = false;
    for (; k < code.length; k++) {
      const c = code[k];
      if (d === 0 && code.startsWith('=>', k)) break;
      if (d === 0 && c === '{' && typed && !/[|&,<:(]\s*$/.test(code.slice(0, k))) break;
      if ('([{<'.includes(c)) d++;
      else if (')]}'.includes(c) || (c === '>' && code[k - 1] !== '=')) d--;
      if (!/\s/.test(c)) typed = true;
    }
    j = k;
  }
  if (code.startsWith('=>', j)) j = ws(code, j + 2);
  if (code[j] !== '{') return null;
  // The name the input goes by: {data}, {data: d}, {params, request}, or the whole argument (ctx.data).
  const p = param.replace(/:\s*[^,}]*$/, '').trim();
  let input = null;
  if (p.startsWith('{')) { const m = new RegExp(`(?:^|[{,\\s])${key}\\s*(?::\\s*([A-Za-z_$][\\w$]*))?\\s*(?=[,}=])`).exec(p); if (m) input = m[1] ?? key; }
  else if (/^[A-Za-z_$][\w$]*$/.test(p)) input = `${p}.${key}`;
  return { body: j, end: close(code, j), input };
}

/** Whether the body opening at `at` starts with the guard, alone, on its own input. */
function guardFirst(code, src, at, input, kind) {
  const j = ws(code, at + 1);
  const G = `await ${GUARD[kind]}(`;
  if (!code.startsWith(G, j)) {
    const other = GUARD[kind === 'fn' ? 'route' : 'fn'];
    if (code.startsWith(`await ${other}(`, j)) return `it opens with ${other}, the guard for a ${kind === 'fn' ? 'route' : 'server function'}; a ${kind === 'fn' ? 'server function' : 'route'} needs \`${G}…)\``;
    return `its first statement is not \`${G}…)\``;
  }
  const p = j + G.length - 1, e = close(code, p);
  if (e < 0) return 'its guard does not close';
  const arg = src.slice(p + 1, e).trim();
  if (!input || !new RegExp(`^${input.replace(/[.$]/g, '\\$&')}(?:\\.[A-Za-z_$][\\w$]*)+$`).test(arg)) return `its guard names ${arg || 'nothing'}, not a field of the handler's ${input ?? 'input (none the scan can read)'}`;
  const after = code.slice(e + 1).match(/^[ \t]*(\S)/)?.[1];
  if (after && after !== ';' && after !== '}') return `its guard is not a statement of its own (\`${after}\` follows it)`;
  return null;
}

/** Every door in `files` ([{path, src}]), judged: [{where, line, why}], `why` null for a pass; and
 *  what the scan could not read, as reds of their own (`unread`). */
export function serverDoors(files) {
  const doors = [], unread = [];
  for (const { path, src } of files) {
    if (!SOURCE.test(path)) continue;
    const code = codeOf(src);
    // A guard is the real one: imported from server/own-session, not renamed, not made here.
    const outside = code.replace(/\bimport\s*\{[^}]*\}\s*from\s*['"][^'"]*['"]/g, (x) => ' '.repeat(x.length));
    const real = (g) => new RegExp(`import\\s*\\{[^}]*\\b${g}\\b[^}]*\\}\\s*from\\s*['"](?:\\.\\.?\\/)+(?:[\\w.-]+\\/)*server\\/own-session(?:\\.ts)?['"]`).test(src) &&
      !new RegExp(`\\b${g}\\s+as\\b|\\bas\\s+${g}\\b`).test(src) &&
      !new RegExp(`\\b(?:function\\s*\\*?|const|let|var|class)\\s+${g}\\b|\\b${g}\\s*=(?!=)`).test(outside);
    const judge = (where, line, fn, kind) => {
      if (!fn) return doors.push({ where, line, why: 'its handler is not one the scan can read (a function written there, with a body)' });
      const why = guardFirst(code, src, fn.body, fn.input, kind);
      doors.push({ where, line, why: why ?? (real(GUARD[kind]) ? null : `its ${GUARD[kind]} is not the one imported from server/own-session`) });
    };

    // Start, imported the one way the scan reads: \`import {…} from\` a Start package (or \`import type\`).
    // A namespace or default import, a re-export, require() or import() is a red.
    for (const m of src.matchAll(/import\s+(type\s+)?([^'";]*?)\s+from\s*['"]([^'"]+)['"]/g)) {
      if (START.test(m[3]) && !/^\{[^}]*\}$/.test(m[2].trim())) unread.push(`${path}:${lineAt(src, m.index)}: Start is imported here other than as \`import {…}\` (a namespace or a default), which the scan does not follow`);
    }
    for (const m of src.matchAll(new RegExp(`(?:export\\s*(?:\\*|\\{[^}]*\\})\\s*(?:as\\s+[\\w$]+\\s*)?from|require\\(|import\\()\\s*['"]${START.source}`, 'g'))) unread.push(`${path}:${lineAt(src, m.index)}: Start is re-exported or loaded here, which the scan cannot follow`);
    // createServerFn appears only as its plain named import from @tanstack/react-start, and as a direct
    // call. Every other mention is a red: an alias, a member (Start.createServerFn, Start['createServerFn']),
    // a destructure, a re-export, a comment or a string, or a call the scan cannot read as code.
    const plain = [];
    for (const m of src.matchAll(/\bimport\s*\{([^}]*)\}\s*from\s*(['"])@tanstack\/react-start\2/g)) {
      let at = m.index + m[0].indexOf('{') + 1;
      for (const part of m[1].split(',')) { const t = part.trim(); if (t === 'createServerFn') plain.push(at + part.indexOf('createServerFn')); at += part.length + 1; }
    }
    for (const m of src.matchAll(/createServerFn/g)) {
      const i = m.index;
      if (plain.includes(i)) continue;
      const call = code.slice(i, i + 14) === 'createServerFn' && !/[\w$]/.test(code[i + 14] ?? '') && !/[\w$.]/.test(code[i - 1] ?? '') && !/[.?]\s*$/.test(code.slice(Math.max(0, i - 4), i)) && code[ws(code, i + 14)] === '(';
      if (!call) { unread.push(`${path}:${lineAt(src, i)}: createServerFn here is not its plain named import from @tanstack/react-start nor a direct call`); continue; }
      const at = ws(code, i + 14);
      const before = code.slice(0, i).match(/(?:(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*(?::[^=]*)?=|export\s+default|([\w$]+)\s*:)\s*$/);
      const name = before?.[1] ?? before?.[2] ?? (before ? 'default' : `line ${lineAt(src, i)}`);
      // Its own .handler: the chain after the call.
      let j = close(code, at), fn = null;
      while (j > 0) {
        const k = ws(code, j + 1);
        const link = /^\.\s*([\w$]+)\s*\(/.exec(code.slice(k));
        if (!link) break;
        const open = code.indexOf('(', k);
        if (link[1] === 'handler') { fn = fnAt(code, src, open + 1, 'data'); break; }
        j = close(code, open);
      }
      judge(`${path} ${name}`, lineAt(src, i), fn, 'fn');
    }

    // Server routes: each method under a route's `handlers`, on its own.
    if (/(^|\/)app\/src\/routes\//.test(path)) {
      for (const m of src.matchAll(/\bhandlers\b/g)) {
        if (code.slice(m.index, m.index + 8) !== 'handlers') continue; // in a comment or a string
        const at = ws(code, m.index + 8);
        if (code[at] !== ':') { unread.push(`${path}:${lineAt(src, m.index)}: \`handlers\` here is not \`handlers: {…}\``); continue; }
        const o = ws(code, at + 1);
        if (code[o] !== '{') { unread.push(`${path}:${lineAt(src, m.index)}: its handlers are not an object written there`); continue; }
        const end = close(code, o);
        let j = ws(code, o + 1), count = 0;
        while (j < end) {
          const key = /^(?:async\s+)?(?:(['"])([^'"]*)\1|([A-Za-z_$][\w$]*))/.exec(src.slice(j));
          if (!key) { unread.push(`${path}:${lineAt(src, j)}: a member of its handlers the scan cannot read`); break; }
          const method = key[2] ?? key[3];
          const k = ws(code, j + key[0].length);
          const fn = code[k] === ':' ? fnAt(code, src, k + 1, 'params') : code[k] === '(' ? fnAt(code, src, k, 'params') : null;
          if (!METHODS.has(method)) unread.push(`${path}:${lineAt(src, j)}: \`${method}\` is not a method the scan knows`);
          judge(`${path} ${method}`, lineAt(src, j), fn, 'route');
          count++;
          if (!fn || fn.end < 0) break;
          j = ws(code, fn.end + 1);
          if (code[j] === ',') j = ws(code, j + 1);
          else if (j < end) { unread.push(`${path}:${lineAt(src, j)}: its handlers go on in a way the scan cannot read`); break; }
        }
        if (!count) unread.push(`${path}:${lineAt(src, m.index)}: its handlers hold no method the scan can read`);
      }
    }
  }
  return { doors, unread };
}

/** Each red for `files`: a door that is neither guarded first nor on `open`, an `open` entry with no
 *  such door, and what the scan could not read. */
export function doorReds(files, open = OPEN) {
  const { doors, unread } = serverDoors(files);
  const reds = [...unread];
  const where = new Set(doors.map((d) => d.where));
  for (const d of doors) if (d.why && !open[d.where]) reds.push(`${d.where} (line ${d.line}): ${d.why}, and it is not on the open list`);
  for (const [k, why] of Object.entries(open)) {
    if (!where.has(k)) reds.push(`open list: ${k} is no door the scan finds (take it off, or say where it went)`);
    if (typeof why !== 'string' || why.trim().length < 10) reds.push(`open list: ${k} gives no reason (10 characters at least)`);
  }
  return { doors, reds };
}
