import { describe, it, expect, vi } from 'vitest'
import { listCases, getCase, saveRating, type AssessorStore, type SavedRating, type Turn } from './assessor-service'
import { RUBRIC_DOMAINS } from './rubric'

const TURNS: Turn[] = [{ index: 0, role: 'doctor', text: 'Why?' }, { index: 1, role: 'rep', text: 'Because.' }]
const complete = () => ({ unscorable: false, items: RUBRIC_DOMAINS.map(domain => ({ domain, observable: true, score: 4, turnRefs: [1] })) })

function store(over: Partial<AssessorStore> = {}): AssessorStore & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    assignedCases: async () => [{ assignmentId: 'a1', scenarioType: 'B' }, { assignmentId: 'a2', scenarioType: 'C' }],
    myRatings: async () => [{ assignmentId: 'a2', status: 'submitted' }],
    turns: async () => TURNS,
    myRating: async () => null,
    saveDraft: async () => { calls.push('saveDraft'); return { ratingId: 'r1' } },
    submit: async () => { calls.push('submit'); return true },
    ...over,
  }
}

describe('listCases', () => {
  it('lists the assigned cases with this assessor\'s own status and nothing that identifies a rep', async () => {
    const r = await listCases(store())
    expect(r.body).toEqual({ cases: [
      { assignmentId: 'a1', scenarioType: 'B', ratingStatus: null },
      { assignmentId: 'a2', scenarioType: 'C', ratingStatus: 'submitted' },
    ] })
  })
})

describe('getCase', () => {
  it('returns the turns and the assessor\'s own saved rating', async () => {
    const saved: SavedRating = { id: 'r1', status: 'draft', unscorable: false, items: [] }
    const r = await getCase(store({ myRating: async () => saved }), 'a1')
    expect(r).toEqual({ status: 200, body: { scenarioType: 'B', turns: TURNS, rating: saved } })
  })
  it('is 404 for a case the assessor is not assigned, without reading its transcript', async () => {
    const turns = vi.fn(async () => TURNS)
    const r = await getCase(store({ turns }), 'someone-elses')
    expect(r.status).toBe(404)
    expect(turns).not.toHaveBeenCalled()
  })
  it('says so when the case has no transcript this tool can show', async () => {
    expect((await getCase(store({ turns: async () => null }), 'a1')).status).toBe(409)
  })
})

describe('saveRating', () => {
  it('saves a draft without submitting it', async () => {
    const s = store()
    const r = await saveRating(s, 'a1', { items: [{ domain: 'opening', observable: true, score: 3, turnRefs: [0] }] }, false)
    expect(r).toEqual({ status: 200, body: { ratingId: 'r1', status: 'draft' } })
    expect(s.calls).toEqual(['saveDraft'])
  })

  it('saves then submits a complete rating', async () => {
    const s = store()
    const r = await saveRating(s, 'a1', complete(), true)
    expect(r).toEqual({ status: 200, body: { ratingId: 'r1', status: 'submitted' } })
    expect(s.calls).toEqual(['saveDraft', 'submit'])
  })

  it('refuses to submit an incomplete rating and writes nothing', async () => {
    const s = store()
    const r = await saveRating(s, 'a1', { items: [{ domain: 'opening', observable: true, score: 3, turnRefs: [0] }] }, true)
    expect(r.status).toBe(400)
    expect(s.calls).toEqual([])
  })

  it('refuses a turn reference that is not in the case', async () => {
    const s = store()
    const r = await saveRating(s, 'a1', { items: [{ domain: 'opening', observable: true, score: 3, turnRefs: [9] }] }, false)
    expect(r.status).toBe(400)
    expect(s.calls).toEqual([])
  })

  it('refuses a case the assessor is not assigned', async () => {
    const s = store()
    expect((await saveRating(s, 'nope', complete(), true)).status).toBe(404)
    expect(s.calls).toEqual([])
  })

  it('never changes a rating that is already submitted', async () => {
    const s = store({ myRating: async () => ({ id: 'r1', status: 'submitted', unscorable: false, items: [] }) })
    expect((await saveRating(s, 'a1', complete(), true)).status).toBe(409)
    expect(s.calls).toEqual([])
  })

  it('reports a lost race: the draft was submitted between the check and the submit', async () => {
    const s = store({ submit: async () => false })
    expect((await saveRating(s, 'a1', complete(), true)).status).toBe(409)
  })
})
