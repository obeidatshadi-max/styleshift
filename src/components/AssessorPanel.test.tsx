// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AssessorPanel from './AssessorPanel'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const ID = '11111111-1111-4111-8111-111111111111'
const turns = [{ index: 0, role: 'doctor', text: 'Why switch?' }, { index: 1, role: 'rep', text: 'It saves you time.' }]

function api(over: { rating?: unknown; caseStatus?: number } = {}) {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/validation/assessor/cases') return Response.json({ cases: [{ assignmentId: ID, scenarioType: 'B', ratingStatus: null }] })
    if (init?.method === 'PUT') return Response.json({ ratingId: 'r1', status: JSON.parse(String(init.body)).submit ? 'submitted' : 'draft' })
    if (over.caseStatus) return Response.json({ error: 'transcript_not_available' }, { status: over.caseStatus })
    return Response.json({ scenarioType: 'B', turns, rating: over.rating ?? null })
  })
}

describe('assessor panel', () => {
  it('lists cases without any rep identity, shows the conversation, and saves a draft with only the answered domains', async () => {
    const fetch = api()
    vi.stubGlobal('fetch', fetch)
    render(<AssessorPanel />)
    fireEvent.click(await screen.findByText(/Case 1 · scenario B · not started/))
    await screen.findByText('It saves you time.')

    const opening = screen.getByRole('group', { name: 'Opening and purpose' })
    fireEvent.change(opening.querySelector('select')!, { target: { value: '4' } })
    fireEvent.change(opening.querySelector('input[placeholder="e.g. 2, 5"]')!, { target: { value: '1' } })
    fireEvent.click(screen.getByText('Save draft'))

    await screen.findByText('Draft saved.')
    const put = fetch.mock.calls.find(c => c[1]?.method === 'PUT')!
    expect(put[0]).toBe(`/api/validation/assessor/cases/${ID}`)
    expect(JSON.parse(put[1].body)).toEqual({
      unscorable: false, submit: false,
      items: [{ domain: 'opening', observable: true, score: 4, turnRefs: [1], note: null, uncertain: false }],
    })
  })

  it('asks before submitting and sends nothing if the assessor declines', async () => {
    const fetch = api()
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('confirm', () => false)
    render(<AssessorPanel />)
    fireEvent.click(await screen.findByText(/Case 1/))
    await screen.findByText('It saves you time.')
    fireEvent.click(screen.getByText('Submit'))
    expect(fetch.mock.calls.some(c => c[1]?.method === 'PUT')).toBe(false)
  })

  it('locks a submitted rating: no form controls to change it, and no save buttons', async () => {
    vi.stubGlobal('fetch', api({ rating: { id: 'r1', status: 'submitted', unscorable: false, items: [{ domain: 'opening', observable: true, score: 3, turnRefs: [0], note: null, uncertain: false }] } }))
    render(<AssessorPanel />)
    fireEvent.click(await screen.findByText(/Case 1/))
    await screen.findByText(/submitted and cannot be changed/)
    expect(screen.queryByText('Save draft')).toBeNull()
    expect(screen.queryByText('Submit')).toBeNull()
    expect(screen.getByRole('group', { name: 'Opening and purpose' })).toHaveProperty('disabled', true)
  })

  it('says plainly when a case has no transcript yet, instead of showing an empty form', async () => {
    vi.stubGlobal('fetch', api({ caseStatus: 409 }))
    render(<AssessorPanel />)
    fireEvent.click(await screen.findByText(/Case 1/))
    await waitFor(() => expect(screen.getByText(/no transcript that can be shown here yet/)).toBeTruthy())
    expect(screen.queryByText('Your rating')).toBeNull()
  })
})
