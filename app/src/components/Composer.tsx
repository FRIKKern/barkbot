// The message box. Enter sends and clears at once (oracle: 3 ms); Shift+Enter adds a line and
// sends nothing; focus stays in Prompt after a send. While there is a draft the voice-chat
// button turns into send (scale .5 -> 1, 200 ms, measured). What waits to go with the message
// sits inside the box above the words (Attachments.tsx; oracle 1.0.3, oracle-*-waiting).
import {useEffect, useLayoutEffect, useRef, useState, type ReactNode} from 'react'
import {Keys, Tooltip, useHover} from './tips'
import {Attachments, type Picture, type WaitingFile} from './Attachments'
import {fileSize} from '../chat/useConversation'

export type {Picture, WaitingFile} from './Attachments'
const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
// A text file or PDF. Barkpark reads the type from the bytes (UTF-8 text or a PDF), so a file the
// browser cannot name ('' or octet-stream) is let through for Barkpark to judge at the send.
const FILE_TYPES = /^(text\/.+|application\/(pdf|json|xml|javascript|x-yaml|yaml|toml|x-sh|sql|octet-stream)|)$/
const MAX_ATTACHMENTS = 4 // Barkpark takes four a message, pictures and files together
const MAX_BYTES = 3_000_000 // and 3 MB each
// A name Barkpark refuses rather than cleans: no / or \, no control or format character, 255 bytes at most.
const sendableName = (name: string) => name !== '.' && name !== '..' && !/[\/\\\p{Cc}\p{Cf}]/u.test(name) && new TextEncoder().encode(name).length <= 255
/** The composer menu's "Attach files" asks the composer to open its file chooser. */
export const ATTACH_EVENT = 'barkbot:attach'

const base64 = (f: File) =>
  new Promise<string>((ok, no) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result).split(',')[1] ?? '')
    r.onerror = () => no(r.error)
    r.readAsDataURL(f)
  })

/** What the empty box says: while the bot waits on a question, that it can be answered here (oracle 1.0.3, the
 *  composer while oracle-ask-choice waits; a placeholder is drawn, not read by Gate A); else whom you write to. */
export const placeholderFor = (bot: string, ask?: {questions?: unknown[]} | null) => (ask?.questions?.length ? 'Type your answer, or talk about something else' : bot ? `Message ${bot}` : 'Message')

/** Where a gate scene's composer starts: words typed, and what waits to go with them. */
export type ComposerStart = {draft?: string; pictures?: Picture[]; files?: WaitingFile[]}

/** Sends what the box holds. It may answer why nothing was sent (a file refused, a computer that cannot take
 *  files): the box then shows that in a plain line and gets its draft back. */
export type OnSend = (text: string, pictures: Picture[], files: WaitingFile[]) => Promise<string | null | void> | void

export function Composer({placeholder, onSend, disabled, start}: {placeholder: string; onSend?: OnSend; disabled?: boolean; start?: ComposerStart}) {
  const box = useRef<HTMLDivElement>(null)
  const chooser = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(!!start?.draft)
  const [pictures, setPictures] = useState<Picture[]>(start?.pictures ?? [])
  const [files, setFiles] = useState<WaitingFile[]>(start?.files ?? [])
  const [refused, setRefused] = useState<string | null>(null)
  const ready = draft || pictures.length > 0 || files.length > 0
  // A scene's words, as the oracle's editor holds them: a paragraph in the box.
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !start?.draft) return
    const p = document.createElement('p')
    p.textContent = start.draft
    el.replaceChildren(p)
  }, [])
  useEffect(() => {
    const open = () => chooser.current?.click()
    window.addEventListener(ATTACH_EVENT, open)
    return () => window.removeEventListener(ATTACH_EVENT, open)
  }, [])
  // Pictures, text files and PDFs: what Barkpark stores for a conversation. Anything else is
  // refused here, with the reason, instead of failing after the send.
  const add = async (picked: File[]) => {
    setRefused(null)
    const pics = [...pictures]
    const docs = [...files]
    for (const f of picked) {
      const picture = PICTURE_TYPES.includes(f.type)
      if (!picture && !FILE_TYPES.test(f.type)) setRefused(`${f.name} is not a picture, a text file or a PDF`)
      else if (f.size > MAX_BYTES) setRefused(`${f.name} is over 3 MB`)
      else if (!f.size) setRefused(`${f.name} is empty`)
      else if (pics.length + docs.length >= MAX_ATTACHMENTS) setRefused('A message takes four pictures and files at most')
      else if (!picture && !sendableName(f.name)) setRefused(`${f.name} has a name that cannot be sent: no / or \\, no control characters, 255 bytes at most`)
      else {
        const data = await base64(f)
        if (picture) pics.push({name: f.name, data, src: `data:${f.type};base64,${data}`})
        else docs.push({name: f.name, size: fileSize(f.size), data})
      }
    }
    setPictures(pics)
    setFiles(docs)
  }
  const submit = async () => {
    const el = box.current
    if (!el || !onSend || disabled) return
    const text = el.innerText.replace(/\n+$/, '').trim()
    if (!text && !pictures.length && !files.length) return
    el.replaceChildren()
    setDraft(false)
    const sent = {pictures, files}
    setPictures([])
    setFiles([])
    setRefused(null)
    el.focus()
    const why = await onSend(text, sent.pictures, sent.files)
    if (!why) return
    // Nothing went: the words and what waited with them come back, and the line says why.
    setRefused(why)
    setPictures((now) => [...sent.pictures, ...now])
    setFiles((now) => [...sent.files, ...now])
    if (text && !el.innerText.trim()) {
      const p = document.createElement('p')
      p.textContent = text
      el.replaceChildren(p)
      setDraft(true)
    }
  }
  const waiting = pictures.length > 0 || files.length > 0
  return (
    <div className="composer-wrap">
      {refused && (
        // Why a file was not taken, above the box so the box itself never moves.
        <div className="composer-refused">
          <span className="picture-refused" role="alert">{refused}</span>
        </div>
      )}
      <input ref={chooser} type="file" accept={[...PICTURE_TYPES, 'text/*', 'application/pdf', '.txt', '.md', '.csv', '.json', '.log', '.pdf'].join(',')} multiple hidden onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = '' }} />
      <div
        className={`composer${waiting ? ' waiting' : ''}`}
        // A picture or file dropped on the box waits as a picked one does.
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }}
        onDrop={(e) => {
          const dropped = [...e.dataTransfer.files]
          if (dropped.length) { e.preventDefault(); void add(dropped) }
        }}
      >
        {waiting && <Attachments pictures={pictures} files={files} onRemovePicture={(i) => setPictures((all) => all.filter((_, j) => j !== i))} onRemoveFile={(i) => setFiles((all) => all.filter((_, j) => j !== i))} />}
        <Round label="Composer actions" area="act">
          <Icon d="M8 3v10M3 8h10" />
        </Round>
        <div
          ref={box}
          className="prompt"
          role="textbox"
          aria-label="Prompt"
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          onInput={(e) => {
            const el = e.currentTarget
            // An emptied box keeps a stray <br>: clear it so the placeholder comes back.
            if (!el.innerText.trim()) el.replaceChildren()
            setDraft(!!el.innerText.trim())
          }}
          onPaste={(e) => {
            // A pasted picture or file is attached; pasted words go in as words.
            const files = [...e.clipboardData.files]
            if (files.length) { e.preventDefault(); void add(files) }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <Round
          label="Start voice input"
          area="mic"
          tip={
            <>
              Click or hold <Keys keys={['⌘', 'D']} /> to dictate
            </>
          }
        >
          <Icon d="M8 2.5a2 2 0 0 1 2 2v3a2 2 0 0 1-4 0v-3a2 2 0 0 1 2-2zM4.5 7.5a3.5 3.5 0 0 0 7 0M8 11v2" />
        </Round>
        {/* "Send message" while there is something to send (0.79.3 traces: the label flips at 35 ms; 1.0.3 the same). */}
        <Round label={ready ? 'Send message' : 'Start voice chat'} area="send" tip={ready ? undefined : 'Start voice chat'} voice onClick={ready ? submit : undefined}>
          <span className={`swap${ready ? ' on' : ''}`}>
            <Icon d="M3 6.5v3M5.5 4.5v7M8 3v10M10.5 5v6M13 6.5v3" />
            <Icon d="M8 13V3M3.5 7.5L8 3l4.5 4.5" />
          </span>
        </Round>
      </div>
    </div>
  )
}

function Round({label, area, tip, voice, onClick, children}: {label: string; area: string; tip?: ReactNode; voice?: boolean; onClick?: () => void; children: ReactNode}) {
  const h = useHover()
  return (
    <>
      <button className={`round round-${area}${voice ? ' voice' : ''}`} aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick} {...h.on}>
        {children}
      </button>
      {tip && <Tooltip box={h.box}>{tip}</Tooltip>}
    </>
  )
}

export function Icon({d}: {d: string}) {
  return (
    <svg className="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
