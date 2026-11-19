import type {SceneRow} from '../../components/Transcript'

// A conversation that started today at a captured clock time. The send-made states read
// "Today 8:21 PM" (1.2.3, fixtures/states/oracle-file-sent, -pictures-sent, -pictures-waiting:
// captured the day of the sends). A fixed date would read "Nov 19 8:21 PM" on every later day, so
// the scene's time is today, wherever and whenever the gate runs.
export function todayAt(hours: number, minutes: number) {
  const d = new Date()
  d.setHours(hours, minutes, 0, 0)
  return d.toISOString()
}

/** The rows with a time row put in above row `at` (a day's first message after an earlier day's). */
export const timeAbove = (rows: SceneRow[], at: number, time: string): SceneRow[] => [...rows.slice(0, at), {time}, ...rows.slice(at)]
