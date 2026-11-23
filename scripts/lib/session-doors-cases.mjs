// The door scan (session-doors.mjs) on made-up sources: each case and how many reds it must give.
// rev299's planted doors on #320 (export let; a DELETE after a guarded GET; the empty-if guard)
// are here, each red; on 4cb8a28 the first two passed the real check.

const IMPORTS = "import {createServerFn} from '@tanstack/react-start'\nimport {requireOwnSession} from '../server/own-session'\n";
const GUARD = '    await requireOwnSession(data.id)';
const SEND = '    await bp(`/v1/chat/sessions/${encodeURIComponent(data.id)}/messages`, {method: \'POST\'})';
const fn = (decl, body, { imports = IMPORTS, handler = `async ({data}) => {\n${body}\n  }` } = {}) => `${imports}${decl} createServerFn({method: 'POST'})\n  .validator((d: {id: string}) => d)\n  .handler(${handler})\n`;
const FILE = (src, path = 'app/src/chat/x.ts') => [{ path, src }];
const route = (handlers) => FILE(`import {createFileRoute} from '@tanstack/react-router'\nimport {requireOwnSession} from '../../server/own-session'\nexport const Route = createFileRoute('/api/chat/$id/x')({\n  server: {\n    handlers: {\n${handlers}\n    },\n  },\n})\n`, 'app/src/routes/api/chat.$id.x.ts');
const GET = "      GET: async ({params}) => {\n        await requireOwnSession(params.id)\n        return bpStream(`/v1/chat/sessions/${params.id}/events`)\n      },";

/** [name, files, reds wanted, open list (default none), a pattern every red must match] */
export const CASES = [
  ['a server function guarded first', FILE(fn('export const send =', `${GUARD}\n${SEND}`)), 0],
  ['a server function with no guard', FILE(fn('export const send =', SEND)), 1, {}, /send .*first statement/],
  ['a guard after the use', FILE(fn('export const send =', `${SEND}\n${GUARD}`)), 1],
  ["rev299's door: `export let`, no guard", FILE(fn('export let archiveChat =', "    await bp(`/v1/chat/sessions/${encodeURIComponent(data.id)}/archive`, {method: 'POST'})")), 1, {}, /archiveChat/],
  ['`var`, no guard', FILE(fn('var archiveChat =', SEND)), 1, {}, /archiveChat/],
  ['`export default`, no guard', FILE(fn('export default', SEND)), 1, {}, / default /],
  ["rev299's door: a DELETE after a guarded GET in one route file", route(`${GET}\n      DELETE: async ({params}) => {\n        return bp(\`/v1/chat/sessions/\${params.id}\`, {method: 'DELETE'})\n      },`), 1, {}, / DELETE /],
  ['the same route with the DELETE guarded too', route(`${GET}\n      DELETE: async ({params}) => {\n        await requireOwnSession(params.id)\n        return bp(\`/v1/chat/sessions/\${params.id}\`, {method: 'DELETE'})\n      },`), 0],
  ['a route method written as a method, no guard', route(`${GET}\n      async POST({params}) {\n        return bp(\`/v1/chat/sessions/\${params.id}/messages\`)\n      },`), 1, {}, / POST /],
  ["rev299's door: the empty-if guard (it cannot be written now)", FILE(fn('export const send =', `    if (!(await requireOwnSession(data.id))) {}\n${SEND}`)), 1],
  ['a guard that does not stand alone', FILE(fn('export const send =', `    await requireOwnSession(data.id).catch(() => {})\n${SEND}`)), 1, {}, /statement of its own/],
  ['a guard in a string', FILE(fn('export const send =', `    const s = "await requireOwnSession(data.id)"\n${SEND}`)), 1],
  ['a guard in a comment', FILE(fn('export const send =', `    // await requireOwnSession(data.id)\n${SEND}`)), 1],
  ['a guard on something other than the handler\'s input', FILE(fn('export const send =', `    await requireOwnSession(id)\n${SEND}`)), 1, {}, /names id/],
  ['a requireOwnSession made in the file', FILE(fn('const requireOwnSession = async (_: unknown) => {}\nexport const send =', `${GUARD}\n${SEND}`, { imports: "import {createServerFn} from '@tanstack/react-start'\n" })), 1, {}, /not the one imported/],
  ['a handler argument renamed, guarded on it', FILE(fn('export const send =', '', { handler: "async ({data: d}) => {\n    await requireOwnSession(d.id)\n    await bp(`/v1/chat/sessions/${d.id}/messages`)\n  }" })), 0],
  ['a typed handler, guarded', FILE(fn('export const send =', '', { handler: "async ({data}): Promise<{ok: true} | {failed: string}> => {\n    await requireOwnSession(data.id)\n    return {ok: true}\n  }" })), 0],
  ['a handler passed by name', FILE(fn('export const send =', '', { handler: 'run' })), 1, {}, /not one the scan can read/],
  ['an expression body', FILE(fn('export const send =', '', { handler: 'async ({data}) => bp(`/v1/chat/sessions/${data.id}`)' })), 1],
  ['createServerFn renamed on import', FILE(fn('export const send =', SEND, { imports: "import {createServerFn as make} from '@tanstack/react-start'\n" }).replace(' createServerFn(', ' make(')), 1],
  ['createServerFn through a namespace', FILE(fn('export const send =', SEND, { imports: "import * as Start from '@tanstack/react-start'\n" }).replace(' createServerFn(', ' Start.createServerFn(')), 1],
  ['a server function as an object member', FILE(`${IMPORTS}export const fns = {\n  go: createServerFn({method: 'POST'}).handler(async ({data}) => {\n${SEND}\n  }),\n}\n`), 1, {}, / go /],
  ['createServerFn used other than called', FILE(`${IMPORTS}const make = createServerFn\nexport const send = make({method: 'POST'}).handler(async ({data}) => {\n${SEND}\n})\n`), 1, {}, /other than called/],
  ["Start re-exported", FILE("export * from '@tanstack/react-start'\n"), 1, {}, /re-exported/],
  ['a .js file', FILE(fn('export const send =', SEND), 'app/src/chat/x.js'), 1],
  ['route handlers that are not an object written there', route('').map((f) => ({ ...f, src: f.src.replace('handlers: {\n\n    },', 'handlers: makeHandlers(),') })), 1, {}, /not an object/],
  ['a door on the open list passes; an entry for no door reds', FILE(fn('export const listBots =', "    return bp('/v1/chat/sessions')")), 1, { 'app/src/chat/x.ts listBots': 'takes no id', 'app/src/chat/x.ts gone': 'it went' }, /gone is no door/],
];
