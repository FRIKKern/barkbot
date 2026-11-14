// What waits in the composer to go with the next message, in a row above the words: pictures as
// square thumbnails (a remove button on hover), a file as a card with its name and size.
// Read on the oracle 1.0.3 (fixtures/states/oracle-pictures-waiting, -file-waiting); numbers in
// styles/composer.css.
import {FileName, PageMark} from './Cards'

/** A picture waiting: its name, its bytes as base64 for the send, and what draws its thumbnail. */
export type Picture = {name: string; data: string; src?: string}
/** A text file or PDF waiting, by name and size, and its bytes as base64 for the send (a gate scene's has none). */
export type WaitingFile = {name: string; size: string; data?: string}

function Cross() {
  return (
    <span className="attach-x-mark" aria-hidden="true">
      <svg className="icon" viewBox="0 0 16 16" width="12" height="12">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </span>
  )
}

export function Attachments({pictures, files, onRemovePicture, onRemoveFile}: {pictures: Picture[]; files: WaitingFile[]; onRemovePicture: (i: number) => void; onRemoveFile: (i: number) => void}) {
  return (
    <div className="composer-attachments" role="list" aria-label="Attachments">
      {files.map((f, i) => (
        <div className="attach-file" role="listitem" aria-label={f.name} key={`f-${f.name}-${i}`}>
          <section className="attach-file-box">
            <PageMark />
            <div className="file-text">
              <FileName name={f.name} />
              <p className="file-size">{f.size}</p>
            </div>
            <div className="attach-file-actions">
              <button className="attach-file-remove" aria-label={`Remove ${f.name}`} onMouseDown={(e) => e.preventDefault()} onClick={() => onRemoveFile(i)}>
                <span className="attach-file-x">
                  <svg className="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </span>
              </button>
            </div>
          </section>
        </div>
      ))}
      {pictures.map((p, i) => (
        <div className="attach-pic" role="listitem" aria-label={p.name} key={`p-${p.name}-${i}`}>
          <button className="attach-pic-open" aria-label="Open image full screen" onMouseDown={(e) => e.preventDefault()}>
            {p.src && <img src={p.src} alt="" />}
          </button>
          <button className="attach-pic-remove" aria-label={`Remove ${p.name}`} onMouseDown={(e) => e.preventDefault()} onClick={() => onRemovePicture(i)}>
            <Cross />
          </button>
        </div>
      ))}
    </div>
  )
}
