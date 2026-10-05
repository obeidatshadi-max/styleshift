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
  it('reminds about a promise once it is two days old, ahead of a coach next step', () => {
    const p = { id: 'p1', doctor_id: 'a', text: ' Bring the study ', created_at: ago(3) }
    expect(buildNudge(doctors, [], now, {}, [{ ...p, created_at: ago(1) }])).toBeNull()
    expect(buildNudge(doctors, [debrief('b', 2)], now, {}, [p])).toMatchObject({ kind: 'open_promise', key: 'promise:p1', doctorName: 'Dr. A', text: 'Bring the study', days: 3 })
    expect(buildNudge(doctors, [], now, {}, [{ ...p, doctor_id: 'gone' }, { ...p, id: 'p2', text: ' ' }])).toBeNull()
  })
  it('picks the longest-waiting promise and honours a snooze on it', () => {
    const older = { id: 'old', doctor_id: 'a', text: 'Call back', created_at: ago(9) }
    const newer = { id: 'new', doctor_id: 'b', text: 'Send samples', created_at: ago(3) }
    expect(buildNudge(doctors, [], now, {}, [newer, older])).toMatchObject({ key: 'promise:old' })
    expect(buildNudge(doctors, [], now, { 'promise:old': now + DAY }, [newer, older])).toMatchObject({ key: 'promise:new' })
  })
  it('hides a snoozed nudge until the snooze ends, and brings back a changed plan', () => {
    const planned = [{ ...doctors[0], plan_objective: 'Agree a trial' }]
    const first = buildNudge(planned, [], now)!
    expect(buildNudge(planned, [], now, { [first.key]: now + DAY })).toBeNull()
    expect(buildNudge(planned, [], now + 2 * DAY, { [first.key]: now + DAY })).not.toBeNull()
    expect(buildNudge([{ ...doctors[0], plan_objective: 'New goal' }], [], now, { [first.key]: now + DAY })).not.toBeNull()
  })
})
