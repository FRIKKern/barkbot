// "13 minutes ago", "2 hours ago", "3 days ago": how long since an ISO time, for Settings >
// Computer's "Last opened" (the host's last_seen_at). Grok 1.2.3 shows "Last opened 13 minutes ago"
// (oracle-settings-computer); other units follow Intl's English wording. Null when there is no time
// or it cannot be read, so the page shows a placeholder, never a made-up time.
const rel = new Intl.RelativeTimeFormat('en', {numeric: 'always'})

export function ago(iso: string | null | undefined, now = Date.now()): string | null {
  const t = iso ? Date.parse(iso) : NaN
  if (Number.isNaN(t)) return null
  const min = Math.max(1, Math.floor((now - t) / 60_000))
  if (min < 60) return rel.format(-min, 'minute')
  const h = Math.floor(min / 60)
  if (h < 24) return rel.format(-h, 'hour')
  return rel.format(-Math.floor(h / 24), 'day')
}
