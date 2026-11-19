// Get Grok Bot for mobile (account menu > Get Grok Bot for mobile; fixtures/states/oracle-get-mobile.json):
// a 320 x 401 dialog centred over the scrim, a code to scan in a white frame, three lines, two
// pills. The oracle's code and the mark in its middle are its own art (O2): a plain white frame of
// the same size stands in, and the code opens nothing here. Open App Store opens nothing yet (0005).
import {Icon} from '../Composer'

export function GetMobile({onClose}: {onClose?: () => void}) {
  return (
    <>
      <div className="scrim" />
      <div role="dialog" tabIndex={-1} aria-modal="true" aria-label="Grok Bot on your phone" className="mobile">
        <button aria-label="Close dialog" className="mobile-close" onClick={onClose}>
          <span>
            <Icon d="M4 4l8 8M12 4l-8 8" />
          </span>
        </button>
        <div className="mobile-body">
          <div className="mobile-code" role="img" aria-label="QR code that opens Grok Bot in your phone's app store" />
          <h2>Grok Bot on your phone</h2>
          <p>Scan with your camera to get the app</p>
          <span className="mobile-note">Works on iPhone and Android</span>
        </div>
        <div className="mobile-foot">
          <button className="mobile-pill">
            <span>Open App Store</span>
          </button>
          <button className="mobile-pill primary" onClick={onClose}>
            <span>Done</span>
          </button>
        </div>
      </div>
    </>
  )
}
