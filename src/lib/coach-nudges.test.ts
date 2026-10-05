import { describe, expect, it } from 'vitest'
import { buildNudge, type NudgeDebrief, type NudgeDoctor } from './coach-nudges'

const DAY = 86_400_000
const now = Date.parse('2026-10-10T12:00:00Z')
const ago = (days: number) => new Date(now - days * DAY).toISOString()
const doctors: NudgeDoctor[] = [{ id: 'a', name: 'Dr. A' }, { id: 'b', name: 'Dr. B' }]
const debrief = (doctor_id: string | null, days: number, nextAction: string | null = 'Ask one question.'): NudgeDebrief => ({ doctor_id, created_at: ago(days), nextAction })

describe('buildNudge', () => {
  it('returns nothing for a rep with no doctors or no history', () => {
    expect(buildNudge([], [], now)).toBeNull()
    expect(buildNudge(doctors, [], now)).toBeNull()
  })
  it('puts a planned visit first, ahead of an open coach action', () => {
    const n = buildNudge([{ ...doctors[0], plan_objective: ' Agree a trial ' }, doctors[1]], [debrief('b', 2)], now)
    expect(n).toMatchObject({ kind: 'planned_visit', doctorId: 'a', text: 'Agree a trial' })
  })
  it('surfaces the coach next step once it is a day old, for that doctor', () => {
    expect(buildNudge(doctors, [debrief('b', 0.2)], now)).toBeNull()
    expect(buildNudge(doctors, [debrief('b', 2)], now)).toMatchObject({ kind: 'open_action', doctorId: 'b', doctorName: 'Dr. B', text: 'Ask one question.' })
  })
  it('uses only the latest debrief per doctor and ignores old, empty or unlinked ones', () => {
    expect(buildNudge(doctors, [debrief('a', 2, ''), debrief('a', 9, 'Old step')], now)).toBeNull()
    expect(buildNudge(doctors, [debrief('a', 20, 'Ancient step')], now)).toMatchObject({ kind: 'quiet' })
    expect(buildNudge(doctors, [debrief(null, 2)], now)).toBeNull()
    expect(buildNudge(doctors, [debrief('gone', 2)], now)).toBeNull()
  })
  it('falls back to a quiet-streak nudge after three days without a debrief', () => {
    expect(buildNudge(doctors, [debrief('a', 2, null)], now)).toBeNull()
    expect(buildNudge(doctors, [debrief('a', 5, null)], now)).toMatchObject({ kind: 'quiet', days: 5 })
  })
  it('hides a snoozed nudge until the snooze ends, and brings back a changed plan', () => {
    const planned = [{ ...doctors[0], plan_objective: 'Agree a trial' }]
    const first = buildNudge(planned, [], now)!
    expect(buildNudge(planned, [], now, { [first.key]: now + DAY })).toBeNull()
    expect(buildNudge(planned, [], now + 2 * DAY, { [first.key]: now + DAY })).not.toBeNull()
    expect(buildNudge([{ ...doctors[0], plan_objective: 'New goal' }], [], now, { [first.key]: now + DAY })).not.toBeNull()
  })
})
