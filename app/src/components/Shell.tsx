// The three panes: rail, conversation, details. Sizes and colours come from the captured
// oracle state fixtures/states/oracle-turn-1040.json (see styles.css). The bots' faces are
// plain stand-ins of the same size (O2): never the oracle's mascot art.
import {useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from 'react'
import {Composer, Icon, placeholderFor, type ComposerStart} from './Composer'
import {Rail} from './Rail'
import {Details} from './Details'
import {FacePicture} from './parts'
import {Overlay, type CreateBot} from './overlays'
import {Transcript, fromScene, type SceneRow} from './Transcript'
import {scenePicture} from './Cards'
import {OpenViewer, Viewer, type Viewing} from './Viewer'

/** A bot as the page knows it: by its id; the name is only its label, so two bots may share one. */
export type SceneBot = {id: string; name: string; main?: boolean}

export type Scene = {
  bots: SceneBot[]
  /** The open bot's id. */
  active?: string
  panelOpen: boolean
  computer?: string
  /** When Barkpark last heard from the bot's computer (its last_seen_at, ISO; null: never or no
   *  computer). Settings > Computer draws it as "Last opened ... ago". */
  seen?: string | null
  /** The Voice chat card: the voice and its speed (one row on 1.2.3, "Helix 1.0x"), the language. */
  voice?: {voice: string; speed: number; language: string}
  tab?: 'activity' | 'library'
  /** Each bot's last message by bot id, shown in its chat preview on hover. Placeholder text in scenes (O2). */
  previews?: Record<string, string>
  /** An open menu, picker or dialog, by name (components/overlays). */
  overlay?: string
  /** The conversation on screen, as lengths (gate/transcripts.ts); `time` shows its time row, `lift` where its scroll was left. */
  transcript?: {bubbles: SceneRow[]; time?: string; lift?: number}
  /** The composer as captured: words typed, pictures or a file waiting (gate scenes). */
  composer?: ComposerStart
  /** Connect apps as captured: the day its Calendar tile shows (the live page shows today). */
  apps?: {today: string}
  /** The picture viewer as captured: open on the conversation's first message with pictures, at
   *  picture `at` (0 is the first; oracle-picture-viewer: 1, -rest: 2). */
  viewer?: {at: number}
}

// The scene is where the page starts; what the person does from there (panel, tab, the bot they
// pick in the rail) is held here, so the live page and the gate share one behaviour.
// Bots are known by id everywhere: picking, renames, Working and Unread. The name is the label.
// `onPickBot` tells the page which bot (its id) is now active, so it can load that bot's conversation.
// `onRenameBot` tells it a bot's id and new name (for a composer the page passes in, and for saving it).
// The details panel stays open however narrow the window: 1.2.3 holds the conversation column at
// 424 and narrows the panel instead (208 at 720: oracle-main-720, -790). 0.79.3 closed it under 800.
// No state was captured under 720.
// Which Voice chat value each picker changes (the Voice dialog's slider says 'voice-speed').
const voiceRows: Record<string, keyof NonNullable<Scene['voice']>> = {'voice-picker': 'voice', 'voice-speed': 'speed', 'language-picker': 'language'}

// `workingBots`: the ids of the bots whose run is in progress, from the chat stream (the same signal as the
// transcript's working row; both flip at the same ms in traces say-hi, say-hi-2, storage).
// `unreadBots`: ids of bots the page itself marks unread; Shell adds its own by the oracle's rule
// (useUnread below).
export function Shell({scene: start, transcript, composer, onPickBot, onRenameBot, onCreateBot, workingBots = [], unreadBots = [], picked: pageActive}: {scene: Scene; transcript?: ReactNode; composer?: ReactNode; onPickBot?: (id: string) => void; picked?: string; onRenameBot?: (id: string, name: string) => void; onCreateBot?: CreateBot; workingBots?: string[]; unreadBots?: string[]}) {
  const [panelOpen, setPanelOpen] = useState(start.panelOpen)
  // The Voice chat card's values as the person picked them (a pick in its picker changes the row).
  const [voice, setVoice] = useState(start.voice)
  const [picked, setPicked] = useState<string | undefined>(undefined)
  // The overlay that is up, whether the scene holds it or a click opened it (Overlay's
  // onOpenChange), so its trigger in the panel shows open (Pick's aria-expanded, the pencil).
  const [opened, setOpened] = useState<string | null>(null)
  // `picked` from the page, when it gives one, is the tile the rail shows as open (a pick it holds or takes back).
  const scene: Scene = {...start, panelOpen, voice, active: pageActive ?? picked ?? start.active}
  const talk = useMemo(() => (start.transcript ? fromScene(start.transcript.bubbles) : null), [start.transcript])
  const unread = useUnread(workingBots)
  // The picture viewer, opened by a tile press (Cards.tsx PictureTiles) or open in the scene.
  const [viewing, setViewing] = useState<Viewing | null>(() => {
    const b = start.viewer && talk?.bubbles.find((x) => x.images?.length)
    return b && start.viewer ? {ids: b.images!, names: b.imageNames ?? [], at: start.viewer.at, picture: scenePicture} : null
  })
  // Closing gives focus back to the tile that opened it.
  const shownViewer = useRef(viewing)
  shownViewer.current = viewing
  const closeViewer = useCallback(() => {
    const from = shownViewer.current?.from
    setViewing(null)
    from?.focus()
  }, [])
  const active = scene.active ?? ''
  // A pick the page is still loading: the panel shows the picked bot while the page still holds the
  // one it is leaving, so nothing typed in the panel can belong to either. The name field is read-only.
  const between = pageActive !== undefined && start.active !== undefined && pageActive !== start.active
  // A bot's name as the person renamed it in the details panel, by the bot's id. On Enter the header
  // pill, the rail tile's label and the composer's "Message <name>" all follow in the same frame
  // (traces/2026-11-09-rename.json and the lead's re-run on oracle/focus-bot-name).
  const [names, setNames] = useState<Record<string, string>>({})
  const shown = names[active] ?? scene.bots.find((b) => b.id === active)?.name ?? ''
  const pick = (id: string) => {
    setPicked(id)
    onPickBot?.(id)
  }
  return (
    <OpenViewer.Provider value={setViewing}>
      <div className="app" data-panel={panelOpen ? 'open' : 'closed'} data-viewing={viewing ? '' : undefined}>
        <Rail scene={scene} onPick={pick} working={workingBots} unread={[...new Set([...unreadBots, ...unread])]} names={names} />

        {/* The transcript (Transcript.tsx) is the oracle's role=log, named "Conversation transcript" and
            focusable (tabindex 0); <main> is unnamed, as on the oracle (oracle-main-1280: main i46, log i64). */}
        <main className="convo">
          <header className="convo-head">
            {active && (
              <button className="bot-pill" aria-label="View conversation details" aria-expanded={panelOpen} onClick={() => setPanelOpen((o) => !o)}>
                <FacePicture size={24} />
                <span role="heading" aria-level={1}>
                  {shown}
                </span>
              </button>
            )}
            <button className="share" aria-label="Share">
              <span className="share-label">Share</span>
              <span className="share-icon">
                <Icon d="M8 10V2.5M5 5.5l3-3 3 3M3 9v3.5h10V9" />
              </span>
            </button>
          </header>
          {transcript ??
            (talk ? (
              <Transcript bot={shown} startedAt={scene.transcript?.time ?? null} bubbles={talk.bubbles} working={null} error={null} ask={talk.ask} picture={scenePicture} lift={scene.transcript?.lift} />
            ) : (
              <div className="transcript" role="log" aria-label="Conversation transcript" tabIndex={0} />
            ))}
          {composer ?? <Composer placeholder={placeholderFor(shown, talk?.ask)} start={start.composer} />}
        </main>

        <Details scene={{...scene, overlay: opened ?? scene.overlay}} name={shown} between={between} onRename={(n) => {
          // While a pick loads the field belongs to no page yet: a change to it is not a rename.
          if (between) return
          setNames((m) => ({...m, [active]: n}))
          onRenameBot?.(active, n)
        }} onClose={() => setPanelOpen(false)} />
        <Overlay name={scene.overlay} scene={scene} onOpenChange={setOpened} onCreateBot={onCreateBot} onChoose={(overlay, value) => {
          const key = voiceRows[overlay]
          if (key) setVoice((v) => v && {...v, [key]: value})
        }} />
        {viewing && <Viewer key={`${viewing.ids.join()} ${viewing.at}`} viewing={viewing} onClose={closeViewer} />}
      </div>
    </OpenViewer.Provider>
  )
}

// The unread dot, by the rule in traces/2026-11-09-unread.json (0.79.3): a reply that lands while
// the window does not have focus marks its bot unread, even the bot that is open; the window
// getting focus clears every dot at once, whatever is open (Settings was). A reply that lands
// in a focused window marks nothing (traces/2026-11-09-long-answer.json: no rail change).
// A reply landing is a bot leaving `workingBots`. The live page keeps its own too (routes/index.tsx),
// so a bot's dot outlives a pick, which opens a fresh Shell.
export function useUnread(working: string[]) {
  const [unread, setUnread] = useState<string[]>([])
  const was = useRef<string[]>([])
  const key = working.join('\n')
  useEffect(() => {
    const now = key ? key.split('\n') : []
    const replied = was.current.filter((b) => !now.includes(b))
    was.current = now
    if (replied.length && !document.hasFocus()) setUnread((u) => [...new Set([...u, ...replied])])
  }, [key])
  useEffect(() => {
    const clear = () => setUnread([])
    window.addEventListener('focus', clear)
    return () => window.removeEventListener('focus', clear)
  }, [])
  return unread
}
