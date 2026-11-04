import { describe, expect, it } from 'vitest'
import {
  canAcknowledge, canAssign, canClose, canViewFollowup, canWriteFieldCheck,
  parseFieldCheckRequest, parseFollowupRequest, type Actor, type FollowupOwner,
} from './permissions'

const mgrA: Actor = { id: 'mgr-a', role: 'manager', companyId: 'co-a' }
const mgrB: Actor = { id: 'mgr-b', role: 'manager', companyId: 'co-b' }
const repA: Actor = { id: 'rep-a', role: 'rep', companyId: 'co-a' }
const repA2: Actor = { id: 'rep-a2', role: 'rep', companyId: 'co-a' }
const repB: Actor = { id: 'rep-b', role: 'rep', companyId: 'co-b' }
const loner: Actor = { id: 'x', role: 'rep', companyId: null }
const fu: FollowupOwner = { repId: 'rep-a', companyId: 'co-a', closedAt: null }
const closed: FollowupOwner = { ...fu, closedAt: '2026-10-10T00:00:00Z' }

describe('assignment permissions (company isolation)', () => {
  it('lets a manager assign only to a rep of their own company', () => {
    expect(canAssign(mgrA, repA)).toBe(true)
    expect(canAssign(mgrA, repB)).toBe(false)
    expect(canAssign(mgrB, repA)).toBe(false)
  })
  it('blocks reps, companyless users, managers as targets and self-assignment', () => {
    expect(canAssign(repA, repA2)).toBe(false)
    expect(canAssign({ ...mgrA, companyId: null }, loner)).toBe(false)
    expect(canAssign(mgrA, { id: 'm2', role: 'manager', companyId: 'co-a' })).toBe(false)
    expect(canAssign(mgrA, { ...mgrA, role: 'rep' })).toBe(false)
  })
  it('limits who can see a follow-up to the rep and managers of that company', () => {
    expect(canViewFollowup(repA, fu)).toBe(true)
    expect(canViewFollowup(mgrA, fu)).toBe(true)
    expect(canViewFollowup(repA2, fu)).toBe(false)
    expect(canViewFollowup(mgrB, fu)).toBe(false)
    expect(canViewFollowup(repB, fu)).toBe(false)
  })
  it('lets only the rep acknowledge and only a same-company manager close, and only while open', () => {
    expect(canAcknowledge(repA, fu)).toBe(true)
    expect(canAcknowledge(mgrA, fu)).toBe(false)
    expect(canAcknowledge(repA, closed)).toBe(false)
    expect(canClose(mgrA, fu)).toBe(true)
    expect(canClose(mgrB, fu)).toBe(false)
    expect(canClose(repA, fu)).toBe(false)
    expect(canClose(mgrA, closed)).toBe(false)
  })
})

describe('field evidence permissions (self-reported vs verified)', () => {
  it('lets only the rep write a self-report', () => {
    expect(canWriteFieldCheck(repA, fu, 'self_reported')).toBe(true)
    expect(canWriteFieldCheck(mgrA, fu, 'self_reported')).toBe(false)
    expect(canWriteFieldCheck(repA2, fu, 'self_reported')).toBe(false)
  })
  it('lets only a same-company manager write a verification, never the rep themself', () => {
    expect(canWriteFieldCheck(mgrA, fu, 'verified')).toBe(true)
    expect(canWriteFieldCheck(repA, fu, 'verified')).toBe(false)
    expect(canWriteFieldCheck(repA2, fu, 'verified')).toBe(false)
    expect(canWriteFieldCheck(mgrB, fu, 'verified')).toBe(false)
  })
  it('blocks a manager who is also the rep of the follow-up from verifying themselves', () => {
    expect(canWriteFieldCheck({ id: 'rep-a', role: 'manager', companyId: 'co-a' }, fu, 'verified')).toBe(false)
  })
  it('blocks any new evidence on a closed follow-up', () => {
    expect(canWriteFieldCheck(repA, closed, 'self_reported')).toBe(false)
    expect(canWriteFieldCheck(mgrA, closed, 'verified')).toBe(false)
  })
})

describe('request parsing', () => {
  const ok = {
    repId: '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b', drillKind: 'precision_drill', metricKey: 'open_question_ratio',
    source: 'ai_doctor', objectionType: 'doubt', clearStep: 'clarify', note: '  Practise before Sunday  ', dueDate: '2026-11-20',
  }
  it('accepts a complete request and trims the note', () => {
    expect(parseFollowupRequest(ok)).toMatchObject({ metricKey: 'open_question_ratio', note: 'Practise before Sunday', dueDate: '2026-11-20' })
  })
  it('accepts a request with only the required fields', () => {
    expect(parseFollowupRequest({ repId: ok.repId, drillKind: 'micro_practice' }))
      .toMatchObject({ metricKey: null, source: null, objectionType: null, clearStep: null, note: null, dueDate: null })
  })
  it('rejects bad ids, unknown values, long notes and bad dates', () => {
    for (const bad of [
      null, 'x', {}, { ...ok, repId: 'not-a-uuid' }, { ...ok, drillKind: 'free_text' }, { ...ok, metricKey: 'win_rate' },
      { ...ok, source: 'phone' }, { ...ok, objectionType: 'price' }, { ...ok, clearStep: 'close' },
      { ...ok, note: 'x'.repeat(301) }, { ...ok, note: 5 }, { ...ok, dueDate: '20/11/2026' }, { ...ok, dueDate: '2026-13-45' },
    ]) expect(parseFollowupRequest(bad)).toBeNull()
  })
  it('parses field checks strictly', () => {
    const id = ok.repId
    expect(parseFieldCheckRequest({ followupId: id, kind: 'verified', observed: 'seen' })).toEqual({ followupId: id, kind: 'verified', observed: 'seen', note: null })
    for (const bad of [null, {}, { followupId: 'x', kind: 'verified', observed: 'seen' },
      { followupId: id, kind: 'trusted', observed: 'seen' }, { followupId: id, kind: 'verified', observed: 'yes' },
      { followupId: id, kind: 'verified', observed: 'seen', note: 'y'.repeat(301) }]) expect(parseFieldCheckRequest(bad)).toBeNull()
  })
})
