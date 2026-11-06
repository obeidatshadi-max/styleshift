import { describe, it, expect } from 'vitest'
import { buildCallGroups, MAX_CALLS_PER_DOCTOR, type CallReportRow, type CallSession } from './callsSideBySide'

const session = (id: string, day: number, doctor_id: string | null = 'doc-1'): CallSession =>
  ({ id, created_at: `2026-11-${String(day).padStart(2, '0')}T09:00:00Z`, doctor_id })

const usual = (quotes: string[], extra: Record<string, unknown> = {}) => ({
  usual: { style: 'analytical', source: 'practice_setting' },
  observations: quotes.map(quote => ({ category: 'time_limit', evidence: { segmentIndex: 0, speakerRole: 'counterpart', quote } })),
  differsFromUsual: false, limited: false, ...extra,
})
const report = (session_id: string, day: number, u: unknown, superseded_by: string | null = null): CallReportRow =>
  ({ session_id, created_at: `2026-11-${String(day).padStart(2, '0')}T10:00:00Z`, superseded_by, usual: u })

describe('buildCallGroups', () => {
  it('lays each call out with its own quotes, oldest to newest, so the row reads as a sequence', () => {
    const groups = buildCallGroups(
      [session('c3', 12), session('c1', 3), session('c2', 8)],
      [report('c1', 3, usual(['I have one minute.'])), report('c2', 8, usual(['Take your time.'])), report('c3', 12, usual([]))],
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].calls.map(c => c.sessionId)).toEqual(['c1', 'c2', 'c3'])
    expect(groups[0].calls.map(c => c.observations.map(o => o.quote))).toEqual([['I have one minute.'], ['Take your time.'], []])
    expect(groups[0].calls.every(c => c.status === 'ready')).toBe(true)
  })

  it('separates calls by the doctor the colleague played, most recent doctor first', () => {
    const groups = buildCallGroups(
      [session('a', 2, 'doc-1'), session('b', 9, 'doc-2'), session('c', 5, null)],
      [],
    )
    expect(groups.map(g => g.doctorId)).toEqual(['doc-2', null, 'doc-1'])
  })

  it('says when a call has no report, or only a report from before this view existed', () => {
    const groups = buildCallGroups(
      [session('new', 9), session('old', 5), session('none', 2)],
      [report('new', 9, usual(['Quickly please.'])), report('old', 5, null)],
    )
    const by = Object.fromEntries(groups[0].calls.map(c => [c.sessionId, c.status]))
    expect(by).toEqual({ new: 'ready', old: 'older_report', none: 'no_report' })
  })

  it('uses the newest report of a call and ignores one replaced by a corrected transcript', () => {
    const groups = buildCallGroups(
      [session('c1', 3)],
      [report('c1', 3, usual(['Replaced.']), 'newer-id'), report('c1', 4, usual(['Current.']))],
    )
    expect(groups[0].calls[0].observations.map(o => o.quote)).toEqual(['Current.'])
  })

  it('keeps only the latest calls per doctor', () => {
    const many = Array.from({ length: MAX_CALLS_PER_DOCTOR + 3 }, (_, i) => session(`c${i}`, i + 1))
    const groups = buildCallGroups(many, [])
    expect(groups[0].calls).toHaveLength(MAX_CALLS_PER_DOCTOR)
    expect(groups[0].calls[groups[0].calls.length - 1].sessionId).toBe(`c${MAX_CALLS_PER_DOCTOR + 2}`)
  })

  it('carries the practice setting and the short-call note, and drops malformed stored data', () => {
    const groups = buildCallGroups(
      [session('c1', 3)],
      [report('c1', 3, {
        usual: { style: 'amiable', source: 'practice_setting' }, limited: true,
        observations: [
          { category: 'time_limit', evidence: { quote: 'Real quote.' } },
          { category: 'made_up_category', evidence: { quote: 'Not a category.' } },
          { category: 'detail_request', evidence: { quote: '   ' } },
          { category: 'detail_request' },
          'junk',
        ],
      })],
    )
    const call = groups[0].calls[0]
    expect(call.practice).toEqual({ style: 'amiable', source: 'practice_setting' })
    expect(call.limited).toBe(true)
    expect(call.observations).toEqual([{ category: 'time_limit', quote: 'Real quote.' }])
  })

  it('shows no practice setting when the report recorded none', () => {
    const groups = buildCallGroups([session('c1', 3)], [report('c1', 3, usual(['x'], { usual: { style: null, source: 'none' } }))])
    expect(groups[0].calls[0].practice).toBeNull()
  })

  it('reaches no conclusion across calls: nothing is counted, ranked, averaged or scored', () => {
    const groups = buildCallGroups(
      [session('c1', 3), session('c2', 8)],
      [report('c1', 3, usual(['One minute.'])), report('c2', 8, usual(['One minute.']))],
    )
    const json = JSON.stringify(groups)
    expect(json).not.toMatch(/count|total|average|mean|trend|score|trait|frequent|probab|%/i)
    expect(Object.keys(groups[0])).toEqual(['doctorId', 'calls'])
  })
})
