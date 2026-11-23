// Every door that takes a session id asks ownSession first (task-26a1a137b955ef3b). The doors are
// read from the source, never listed: a route file under app/src/routes, or a createServerFn, whose
// handler builds a Barkpark session path (/v1/chat/sessions/${…}) from its input (params.<k>,
// data.<k>), or hands that input to a function that builds one from its own parameter. Each such
// door must open with `if (!(await ownSession(<that input>)))` before the input is used.

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const PATH = /\/v1\/chat\/sessions\/\$\{([^}]*)\}/g;
const INPUT = /\b(data|params)\.(\w+)/;
// A top-level piece: from `start` to the next line that begins in column 0 with a word or a comment.
const piece = (src, start) => { const m = /\n(?=[A-Za-z/])/g; m.lastIndex = start + 1; const n = m.exec(src); return src.slice(start, n ? n.index : src.length); };

/** Names of functions, in any of `files`, that build a session path from one of their parameters. */
export function sessionReaders(files) {
  const out = new Set();
  for (const { src } of files) {
    const s = strip(src);
    for (const m of s.matchAll(/(?:^|\n)(?:export )?(?:async )?function (\w+)(?:<[^>]*>)?\(([^)]*)\)|(?:^|\n)(?:export )?const (\w+) = (?:async )?\(([^)]*)\) *(?::[^=]*)?=>/g)) {
      const name = m[1] ?? m[3];
      const params = (m[2] ?? m[4]).split(',').map((p) => p.trim().split(/[:=\s]/)[0]).filter(Boolean);
      const body = piece(s, m.index);
      for (const p of body.matchAll(PATH)) if (params.some((q) => new RegExp(`\\b${q}\\b`).test(p[1]))) out.add(name);
    }
  }
  return out;
}

/** The doors in `files` ([{path, src}]): [{where, input, guarded}], one per door and input. */
export function sessionDoors(files) {
  const readers = sessionReaders(files);
  const doors = [];
  const judge = (where, body) => {
    const uses = [];
    for (const p of body.matchAll(PATH)) { const i = p[1].match(INPUT); if (i) uses.push({ input: i[0], at: p.index }); }
    for (const name of readers) for (const c of body.matchAll(new RegExp(`\\b${name}\\(\\s*(?:encodeURIComponent\\()?((?:data|params)\\.\\w+)`, 'g'))) uses.push({ input: c[1], at: c.index });
    for (const input of [...new Set(uses.map((u) => u.input))]) {
      const first = Math.min(...uses.filter((u) => u.input === input).map((u) => u.at));
      const g = body.search(new RegExp(`if \\(!\\(await ownSession\\(${input.replace('.', '\\.')}\\)\\)\\)`));
      doors.push({ where, input, guarded: g >= 0 && g < first });
    }
  };
  for (const { path, src } of files) {
    const s = strip(src);
    if (/(^|\/)app\/src\/routes\//.test(path) && /createFileRoute\(/.test(s)) judge(path, s);
    for (const m of s.matchAll(/(?:^|\n)(?:export )?const (\w+) = createServerFn\(/g)) judge(`${path} ${m[1]}`, piece(s, m.index));
  }
  return doors;
}
