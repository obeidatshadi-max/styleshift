// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
vi.mock('@/lib/i18n', () => ({ useLang: () => ({ lang: 'en' }) }))
vi.mock('@/hooks/useDoctors', () => ({ useDoctors: () => ({ doctors: [{ id: 'doctor-1', name: 'Practice doctor' }] }) }))
const recorder = vi.hoisted(() => ({ previewUrl: null, start: vi.fn(), stop: vi.fn(), discard: vi.fn(), take: vi.fn(), abort: vi.fn() }))
vi.mock('@/hooks/useAudioRecorder', () => ({ useAudioRecorder: () => recorder }))
vi.mock('./TextSimulation', () => ({
  card: {}, primaryBtn: {}, ghostBtn: {},
  default: ({ initialPracticeFocus }: { initialPracticeFocus: string }) => React.createElement('div', null, `Practice focus: ${initialPracticeFocus}`),
}))
import AICoach from './AICoach'
const report = { summary: 'Based on your account, price was raised.', strength: 'You recalled the concern.', priority: 'Clarify first.', hypothesis: 'The comparison may matter.', betterResponse: 'Compared with what?', nextAction: 'Ask one question.', practiceFocus: 'Clarify the price comparison.' }
const fetchMock = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('React', React)
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation(async (_url, init) => init?.method === 'POST'
    ? Response.json({ result: { questions: ['What did they compare it with?'], report: null }, saved: false })
    : Response.json({ entries: [] }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('AI Coach journey', () => {
  it('reviews text, clarifies once, displays coaching and hands focus to AI Doctor', async () => {
    render(React.createElement(AICoach))
    fireEvent.change(screen.getByLabelText('What happened? Review or edit before coaching.'), { target: { value: 'The doctor said the price was high. I repeated the benefits.' } })
    fireEvent.click(screen.getByText('Get coaching'))
    await screen.findByText('A little more context')
    fireEvent.change(screen.getByLabelText('What did they compare it with?'), { target: { value: 'They did not explain.' } })
    fetchMock.mockImplementation(async (_url, init) => init?.method === 'POST' ? Response.json({ result: { questions: [], report }, saved: true }) : Response.json({ entries: [] }))
    fireEvent.click(screen.getByText('Coach me with these details'))
    await screen.findByText('Clarify first.')
    const posts = fetchMock.mock.calls.filter(c => c[1]?.method === 'POST')
    expect(JSON.parse(posts[1][1].body)).toMatchObject({ finish: true, answers: [{ answer: 'They did not explain.' }] })
    fireEvent.change(screen.getByLabelText('Choose a practice doctor'), { target: { value: 'doctor-1' } })
    fireEvent.click(screen.getByText('Practice this moment'))
    await screen.findByText('Practice focus: Clarify the price comparison.')
  })
  it('preserves the account when generation fails and cleans up the microphone on exit', async () => {
    fetchMock.mockImplementation(async (_url, init) => init?.method === 'POST' ? Response.json({}, { status: 502 }) : Response.json({ entries: [] }))
    const view = render(React.createElement(AICoach))
    const text = 'The doctor said the price was high. I repeated the benefits.'
    fireEvent.change(screen.getByLabelText('What happened? Review or edit before coaching.'), { target: { value: text } })
    fireEvent.click(screen.getByText('Get coaching'))
    await screen.findByRole('alert')
    expect((screen.getByLabelText('What happened? Review or edit before coaching.') as HTMLTextAreaElement).value).toBe(text)
    view.unmount()
    expect(recorder.abort).toHaveBeenCalled()
  })
  it('shows persistence failure without hiding useful coaching', async () => {
    fetchMock.mockImplementation(async (_url, init) => init?.method === 'POST' ? Response.json({ result: { questions: [], report }, saved: false }) : Response.json({ entries: [] }))
    render(React.createElement(AICoach))
    fireEvent.change(screen.getByLabelText('What happened? Review or edit before coaching.'), { target: { value: 'The doctor said the price was high. I repeated the benefits.' } })
    fireEvent.click(screen.getByText('Get coaching'))
    await screen.findByText('Clarify first.')
    await waitFor(() => expect(screen.getByText(/could not be saved/)).toBeTruthy())
  })
})
