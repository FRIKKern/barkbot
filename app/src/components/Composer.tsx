// The message box. Enter sends and clears at once (oracle: 3 ms); Shift+Enter adds a line and
// sends nothing; focus stays in Prompt after a send. While there is a draft the voice-chat
// button turns into send (scale .5 -> 1, 200 ms, measured).
import {useRef, useState, type ReactNode} from 'react'

export function Composer({placeholder, onSend, disabled}: {placeholder: string; onSend?: (text: string) => void; disabled?: boolean}) {
  const box = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState(false)
  const submit = () => {
    const el = box.current
    if (!el || !onSend || disabled) return
    const text = el.innerText.replace(/\n+$/, '').trim()
    if (!text) return
    el.replaceChildren()
    setDraft(false)
    el.focus()
    onSend(text)
  }
  return (
    <div className="composer-wrap">
      <div className="composer">
        <Round label="Composer actions">
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
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <Round label="Start voice input">
          <Icon d="M8 2.5a2 2 0 0 1 2 2v3a2 2 0 0 1-4 0v-3a2 2 0 0 1 2-2zM4.5 7.5a3.5 3.5 0 0 0 7 0M8 11v2" />
        </Round>
        <Round label={draft ? 'Send' : 'Start voice chat'} voice onClick={draft ? submit : undefined}>
          <span className={`swap${draft ? ' on' : ''}`}>
            <Icon d="M3 6.5v3M5.5 4.5v7M8 3v10M10.5 5v6M13 6.5v3" />
            <Icon d="M8 13V3M3.5 7.5L8 3l4.5 4.5" />
          </span>
        </Round>
      </div>
    </div>
  )
}

function Round({label, voice, onClick, children}: {label: string; voice?: boolean; onClick?: () => void; children: ReactNode}) {
  return (
    <button className={`round${voice ? ' voice' : ''}`} aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  )
}

export function Icon({d}: {d: string}) {
  return (
    <svg className="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
