// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
vi.mock('@/lib/i18n', () => ({ useLang: () => ({ lang: 'en' }) }))
vi.mock('@/hooks/useDoctors', () => ({ useDoctors: () => ({ doctors: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Dr. Practice' }] }) }))
const recorder = vi.hoisted(() => ({ previewUrl: null, start: vi.fn(), stop: vi.fn(), discard: vi.fn(), take: vi.fn(), abort: vi.fn() }))
vi.mock('@/hooks/useAudioRecorder', () => ({ useAudioRecorder: () => recorder }))
vi.mock('./TextSimulation', () => ({
  card: {}, primaryBtn: {}, ghostBtn: {},
  default: ({ initialPracticeFocus }: { initialPracticeFocus: string }) => React.createElement('div', null, `Practice focus: ${initialPracticeFocus}`),
}))
import AICoach from './AICoach'
const report = { summary: 'Based on your account, price was raised.', strength: 'You listened.', priority: 'Clarify first.', hypothesis: 'The comparison may matter.', betterResponse: 'Compared with what?', objectiveReview: 'No date was agreed.', nextAction: 'Ask one question.', practiceFocus: 'Clarify the price comparison.' }
const fetchMock = vi.fn()
const answers = {
  'Which doctor was the call with?': '00000000-0000-4000-8000-000000000001',
  'What was your call objective?': 'Agree a follow-up visit',
  'How would you measure success?': 'A date is agreed',
  'What happened? Review or edit before coaching.': 'The doctor said the price was high. I repeated the benefits.',
  '1. What good things did you do?': 'I listened before responding.',
  '2. What would you change or what did you miss?': 'I would ask what the comparison was.',
  '3. Did you achieve your call objective? What evidence shows it?': 'No. We did not agree on a date.',
}
function fillForm() { for (const [label, value] of Object.entries(answers)) fireEvent.change(screen.getByLabelText(label), { target: { value } }) }

beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('React', React); vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation(async (_url, init) => init?.method === 'POST'
    ? Response.json({ result: { questions: [], report }, saved: true, id: 'saved' })
    : Response.json({ entries: [] }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('AI Coach doctor-linked reflection flow', () => {
  it('submits the selected doctor, objective, measure and all three guided reflections, then launches practice', async () => {
    render(React.createElement(AICoach))
    fillForm()
    fireEvent.click(screen.getByText('Get coaching'))
    await screen.findByText('Clarify first.')
    const payload = JSON.parse(fetchMock.mock.calls.find(c => c[1]?.method === 'POST')![1].body)
    expect(payload).toMatchObject({
      doctorId: answers['Which doctor was the call with?'],
      objective: answers['What was your call objective?'], successMeasure: answers['How would you measure success?'],
      reflections: { wentWell: answers['1. What good things did you do?'], changeNextTime: answers['2. What would you change or what did you miss?'], objectiveReview: answers['3. Did you achieve your call objective? What evidence shows it?'] },
    })
    expect(screen.getByText('Objective and evidence')).toBeTruthy()
    fireEvent.click(screen.getByText('Practice this moment'))
    await screen.findByText('Practice focus: Clarify the price comparison.')
  })
  it('preserves the recollection after generation fails and stops the microphone on exit', async () => {
    fetchMock.mockImplementation(async (_url, init) => init?.method === 'POST' ? Response.json({}, { status: 502 }) : Response.json({ entries: [] }))
    const view = render(React.createElement(AICoach))
    fillForm(); fireEvent.click(screen.getByText('Get coaching'))
    await screen.findByRole('alert')
    expect((screen.getByLabelText('What happened? Review or edit before coaching.') as HTMLTextAreaElement).value).toBe(answers['What happened? Review or edit before coaching.'])
    view.unmount(); expect(recorder.abort).toHaveBeenCalled()
  })
  it('records a spoken answer for one reflection question and transcribes it into that field only', async () => {
    recorder.start.mockResolvedValue(true); recorder.stop.mockResolvedValue(undefined)
    recorder.take.mockReturnValue({ blob: new Blob(['x']), durationSec: 5 })
    fetchMock.mockImplementation(async (url, init) => url === '/api/transcribe' ? Response.json({ text: 'I asked open questions.' }) : init?.method === 'POST' ? Response.json({}) : Response.json({ entries: [] }))
    render(React.createElement(AICoach))
    const label = '1. What good things did you do?'
    fireEvent.change(screen.getByLabelText(label), { target: { value: 'Opened well.' } })
    fireEvent.click(screen.getByTestId('mic-wentWell'))
    await screen.findByText(/Stop and transcribe/)
    expect((screen.getByTestId('mic-changeNextTime') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByTestId('mic-wentWell'))
    await waitFor(() => expect((screen.getByLabelText(label) as HTMLTextAreaElement).value).toBe('Opened well.\nI asked open questions.'))
    expect((screen.getByLabelText('2. What would you change or what did you miss?') as HTMLTextAreaElement).value).toBe('')
  })
  it('asks about the last planned action for this doctor and sends the answer', async () => {
    const docId = '00000000-0000-4000-8000-000000000001'
    const past = { id: 'old', created_at: '2026-10-01T00:00:00Z', doctor_id: docId, doctor_name: 'Dr. Practice', input: { account: 'Earlier call account text.', objective: 'Earlier objective' }, result: { questions: [], report: { ...report, nextAction: 'Ask what they compare us with.' } } }
    fetchMock.mockImplementation(async (_url, init) => init?.method === 'POST'
      ? Response.json({ result: { questions: [], report }, saved: true, id: 'saved' }) : Response.json({ entries: [past] }))
    render(React.createElement(AICoach))
    fillForm()
    await screen.findByText('Ask what they compare us with.')
    fireEvent.click(screen.getByText('Partly'))
    fireEvent.click(screen.getByText('Get coaching'))
    await screen.findByText('Clarify first.')
    const payload = JSON.parse(fetchMock.mock.calls.find(c => c[1]?.method === 'POST')![1].body)
    expect(payload.previousAction).toEqual({ text: 'Ask what they compare us with.', status: 'partly' })
  })
  it('shows persistence failure without hiding useful coaching', async () => {
    fetchMock.mockImplementation(async (_url, init) => init?.method === 'POST' ? Response.json({ result: { questions: [], report }, saved: false }) : Response.json({ entries: [] }))
    render(React.createElement(AICoach)); fillForm(); fireEvent.click(screen.getByText('Get coaching'))
    await screen.findByText('Clarify first.')
    await waitFor(() => expect(screen.getByText(/could not be saved/)).toBeTruthy())
  })
})
