import { describe, expect, it } from 'vitest'
import { buildVisitBrief, openPromises, type BriefVisit } from './visit-brief'

const DAY = 86_400_000
const now = Date.parse('2026-10-10T12:00:00Z')
const ago = (d: number) => new Date(now - d * DAY).toISOString()
const visit = (over: Partial<BriefVisit>): BriefVisit => ({ id: 'v', source: 'manual', created_at: ago(1), objection_raised: null, promise_made: null, what_worked: null, ...over })

describe('openPromises', () => {
  it('lists unfinished promises, longest-waiting first, and skips done and blank ones', () => {
    const list = openPromises([
      visit({ id: 'new', promise_made: ' Call back ', created_at: ago(2) }),
      visit({ id: 'old', promise_made: 'Bring the study', created_at: ago(9) }),
      visit({ id: 'done', promise_made: 'Send samples', promise_done_at: ago(1) }),
      visit({ id: 'blank', promise_made: '  ' }),
      visit({ id: 'none' }),
    ], now)
    expect(list).toEqual([{ id: 'old', text: 'Bring the study', daysAgo: 9 }, { id: 'new', text: 'Call back', daysAgo: 2 }])
  })
})

describe('buildVisitBrief', () => {
  it('is empty for a doctor with nothing recorded', () => {
    expect(buildVisitBrief({}, [], [], now)).toMatchObject({ hasContent: false, promises: [], lastContactDaysAgo: null })
  })
  it('gathers the goal, promises and what happened last time', () => {
    const brief = buildVisitBrief(
      { plan_objective: ' Agree a trial ', plan_success_measure: 'Date agreed', hidden_concern: 'Worried about cost' },
      [visit({ id: 'a', created_at: ago(6), objection_raised: 'Price', what_worked: 'Patient story', promise_made: 'Bring the study' }),
       visit({ id: 'b', created_at: ago(3), objection_raised: 'Side effects' })],
      [{ created_at: ago(2), nextAction: ' Ask one question. ' }], now)
    expect(brief).toMatchObject({
      goal: 'Agree a trial', measure: 'Date agreed', hiddenConcern: 'Worried about cost',
      lastNextAction: 'Ask one question.', lastObjection: 'Side effects', whatWorked: 'Patient story',
      lastContactDaysAgo: 2, hasContent: true,
    })
    expect(brief.promises).toEqual([{ id: 'a', text: 'Bring the study', daysAgo: 6 }])
  })
  it('does not count a practice session as contact with the doctor', () => {
    const brief = buildVisitBrief({}, [visit({ source: 'voice_partner_live', created_at: ago(1), objection_raised: 'Price' })], [], now)
    expect(brief).toMatchObject({ lastContactDaysAgo: null, lastObjection: null, hasContent: false })
  })
})
