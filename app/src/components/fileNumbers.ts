// Files of one message that share a name are told apart by a number after it, in order: two
// oracle-note.txt read "oracle-note.txt (1)" and "oracle-note.txt (2)", on the card and in its
// "Open ..." name (Grok 1.2.3, oracle-main-1600). A name no other file of the message has stays as
// it is (oracle-file-sent). The live page and the gate scenes both number here, so a scene carries
// the names as sent (scripts/transcript-scenes.mjs) and draws only what the live page draws.
export function numberSame<T extends {name: string}>(files: T[]): T[] {
  const count = new Map<string, number>()
  for (const f of files) count.set(f.name, (count.get(f.name) ?? 0) + 1)
  const seen = new Map<string, number>()
  return files.map((f) => {
    if ((count.get(f.name) ?? 0) < 2) return f
    const k = (seen.get(f.name) ?? 0) + 1
    seen.set(f.name, k)
    return {...f, name: `${f.name} (${k})`}
  })
}
