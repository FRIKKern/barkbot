// A conversation that started today at a captured clock time. The 1.0.3 card states read
// "Today 10:01 AM" (fixtures/states/oracle-ask-choice, -choice-answered): captured the day the
// conversation began. A fixed date would read "Nov 14 10:01 AM" on every later day, so the scene
// starts today, wherever and whenever the gate runs.
export function todayAt(hours: number, minutes: number) {
  const d = new Date()
  d.setHours(hours, minutes, 0, 0)
  return d.toISOString()
}
