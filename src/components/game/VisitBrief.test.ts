// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
vi.mock('@/lib/i18n', () => ({ useT: () => (key: string, p?: Record<string, string | number>) => p ? `${key}|${Object.values(p).join('|')}` : key }))
const state = vi.hoisted(() => ({
  visits: [] as unknown[], debriefs: [] as unknown[], loading: false,
  completePromise: vi.fn(async () => true),
}))
vi.mock('@/hooks/useDoctorVisits', () => ({ useDoctorVisits: () => ({ visits: state.visits, loading: state.loading, completePromise: state.completePromise }) }))
vi.mock('@/hooks/useDoctorCoachDebriefs', () => ({ useDoctorCoachDebriefs: () => ({ debriefs: state.debriefs, loading: false }) }))
import VisitBrief from './VisitBrief'

const doctor = { id: 'd1', name: 'Dr. X' } as never
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
beforeEach(() => { vi.stubGlobal('React', React); state.visits = []; state.debriefs = []; state.loading = false; state.completePromise.mockClear(); state.completePromise.mockResolvedValue(true) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('VisitBrief', () => {
  it('shows nothing for a doctor with no history, plan or concern', () => {
    const { container } = render(React.createElement(VisitBrief, { doctor }))
    expect(container.innerHTML).toBe('')
  })
  it('shows the goal, the promise owed and last time, and ticks a promise off', async () => {
    state.visits = [{ id: 'v1', source: 'manual', created_at: ago(5), objection_raised: 'Price', promise_made: 'Bring the study', what_worked: null }]
    state.debriefs = [{ created_at: ago(4), nextAction: 'Ask one question.' }]
    render(React.createElement(VisitBrief, { doctor: { ...(doctor as object), plan_objective: 'Agree a trial' } as never }))
    expect(screen.getByText('Agree a trial')).toBeTruthy()
    expect(screen.getByText('Bring the study')).toBeTruthy()
    expect(screen.getByText('Ask one question.')).toBeTruthy()
    expect(screen.getByText('Price')).toBeTruthy()
    fireEvent.click(screen.getByText(/brief.kept/))
    await waitFor(() => expect(state.completePromise).toHaveBeenCalledWith('v1'))
  })
  it('shows an error line when a promise could not be saved', async () => {
    state.visits = [{ id: 'v1', source: 'manual', created_at: ago(5), objection_raised: null, promise_made: 'Bring the study', what_worked: null }]
    state.completePromise.mockResolvedValue(false)
    render(React.createElement(VisitBrief, { doctor }))
    fireEvent.click(screen.getByText(/brief.kept/))
    await screen.findByText('brief.promiseError')
  })
  it('renders nothing while the history is still loading', () => {
    state.loading = true
    state.visits = [{ id: 'v1', source: 'manual', created_at: ago(5), objection_raised: null, promise_made: 'Bring the study', what_worked: null }]
    const { container } = render(React.createElement(VisitBrief, { doctor }))
    expect(container.innerHTML).toBe('')
  })
})
