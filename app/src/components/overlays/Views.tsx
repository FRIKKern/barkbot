// The avatar editor, a captured view over the main screen, look only (nothing in it acts yet,
// 0005; oracle-edit-avatar.json). Connect Apps and Settings have their own files (ConnectApps.tsx,
// Settings.tsx); Settings is re-exported here.
import {useState} from 'react'
import {CharacterLooks} from './NewBotDialog'

// The avatar editor opens under the details panel's avatar, centred on it (avatar 848..912 ->
// editor 731.5..1028.5), and shows the bot's own shape and colour.
export function AvatarEditor({shape: s0 = 'square', colour: c0 = 'Gray'}: {shape?: string; colour?: string}) {
  const [tab, setTab] = useState('Bot')
  const [shape, setShape] = useState(s0)
  const [colour, setColour] = useState(c0)
  return (
    <div role="dialog" aria-label="Avatar editor" className="pop avatar-editor">
      <div className="avatar-head">
        <div role="tablist" aria-label="Avatar source" className="avatar-tabs">
          {['Bot', 'Generate', 'Upload'].map((t) => (
            <button key={t} role="tab" aria-selected={t === tab} className="avatar-tab" onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        <button aria-label="Reset character to default" className="avatar-reset">
          Reset
        </button>
      </div>
      <div className="avatar-body">
        <CharacterLooks shape={shape} colour={colour} onShape={setShape} onColour={setColour} />
      </div>
    </div>
  )
}

export {Settings} from './Settings'
