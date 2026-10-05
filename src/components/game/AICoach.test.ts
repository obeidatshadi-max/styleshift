// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
vi.mock('@/lib/i18n', () => ({ useLang: () => ({ lang: 'en' }) }))
const doctorsState = vi.hoisted(() => ({ doctors: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Dr. Practice' }] as Record<string, unknown>[], savePlan: vi.fn() }))
vi.mock('@/hooks/useDoctors', () => ({ useDoctors: () => doctorsState }))
const recorder = vi.hoisted(() => ({ previewUrl: null, start: vi.fn(), stop: vi.fn(), discard: vi.fn(), take: vi.fn(), abort: vi.fn() }))
vi.mock('@/lib/promises', () => ({ addPromise: vi.fn(async () => true) }))
vi.mock('@/hooks/useAudioRecorder', () => ({ useAudioRecorder: () => recorder }))
vi.mock('./TextSimulation', () => ({
  card: {}, primaryBtn: {}, ghostBtn: {},
  default: ({ initialPracticeFocus }: { initialPracticeFocus: string }) => React.createElement('div', null, `Practice focus: ${initialPracticeFocus}`),
}))
import { addPromise } from '@/lib/promises'
import AICoach from './AICoach'
const report = { summary: 'Based on your account, price was raised.', strength: 'You listened.', priority: 'Clarify first.', hypothesis: 'The comparison may matter.', betterResponse: 'Compared with what?', objectiveReview: 'No date was agreed.', nextAction: 'Ask one question.', practiceFocus: 'Clarify the price comparison.' }
const fetchMock = vi.fn()
const answers = {
  'Which doctor was the call with?': '00000000-0000-4000-8000-000000000001',
  'What was your call objective? (optional)': 'Agree a follow-up visit',
  'How would you measure success? (optional)': 'A date is agreed',
  'What happened? Review or edit before coaching.': 'The doctor said the price was high. I repeated the benefits.',
  '1. What good things did you do? (optional)': 'I listened before responding.',
  '2. What would you change or what did you miss? (optional)': 'I would ask what the comparison was.',
  '3. Did you achieve your call objective? What evidence shows it? (optional)': 'No. We did not agree on a date.',
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
      objective: answers['What was your call objective? (optional)'], successMeasure: answers['How would you measure success? (optional)'],
      reflections: { wentWell: answers['1. What good things did you do? (optional)'], changeNextTime: answers['2. What would you change or what did you miss? (optional)'], objectiveReview: answers['3. Did you achieve your call objective? What evidence shows it? (optional)'] },
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
    const label = '1. What good things did you do? (optional)'
    fireEvent.change(screen.getByLabelText(label), { target: { value: 'Opened well.' } })
    fireEvent.click(screen.getByTestId('mic-wentWell'))
    await screen.findByText(/Stop and transcribe/)
    expect((screen.getByTestId('mic-changeNextTime') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByTestId('mic-wentWell'))
    await waitFor(() => expect((screen.getByLabelText(label) as HTMLTextAreaElement).value).toBe('Opened well.\nI asked open questions.'))
    expect((screen.getByLabelText('2. What would you change or what did you miss? (optional)') as HTMLTextAreaElement).value).toBe('')
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
  it('coaches from just a doctor and an account when everything else is left empty', async () => {
    render(React.createElement(AICoach))
    const button = screen.getByText('Get coaching') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Which doctor was the call with?'), { target: { value: answers['Which doctor was the call with?'] } })
    fireEvent.change(screen.getByLabelText('What happened? Review or edit before coaching.'), { target: { value: answers['What happened? Review or edit before coaching.'] } })
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    await screen.findByText('Clarify first.')
    const payload = JSON.parse(fetchMock.mock.calls.find(c => c[1]?.method === 'POST')![1].body)
    expect(payload).toMatchObject({ objective: '', successMeasure: '', reflections: { wentWell: '', changeNextTime: '', objectiveReview: '' } })
  })
  it('pre-fills the objective and measure from the Visit Prep plan, and clears the plan once debriefed', async () => {
    const id = '00000000-0000-4000-8000-000000000001'
    doctorsState.doctors = [{ id, name: 'Dr. Practice', plan_objective: 'Agree a trial on 2 patients', plan_success_measure: 'Patient type and date agreed' }]
    try {
      render(React.createElement(AICoach))
      fireEvent.change(screen.getByLabelText('Which doctor was the call with?'), { target: { value: id } })
      expect((screen.getByLabelText('What was your call objective? (optional)') as HTMLInputElement).value).toBe('Agree a trial on 2 patients')
      expect((screen.getByLabelText('How would you measure success? (optional)') as HTMLInputElement).value).toBe('Patient type and date agreed')
      fireEvent.change(screen.getByLabelText('What happened? Review or edit before coaching.'), { target: { value: answers['What happened? Review or edit before coaching.'] } })
      fireEvent.click(screen.getByText('Get coaching'))
      await screen.findByText('Clarify first.')
      expect(doctorsState.savePlan).toHaveBeenCalledWith(id, null)
    } finally { doctorsState.doctors = [{ id: '00000000-0000-4000-8000-000000000001', name: 'Dr. Practice' }] }
  })
  it('keeps the plan when the rep wrote a different objective', async () => {
    const id = '00000000-0000-4000-8000-000000000001'
    doctorsState.doctors = [{ id, name: 'Dr. Practice', plan_objective: 'Agree a trial on 2 patients' }]
    try {
      render(React.createElement(AICoach))
      fillForm()
      fireEvent.click(screen.getByText('Get coaching'))
      await screen.findByText('Clarify first.')
      expect(doctorsState.savePlan).not.toHaveBeenCalled()
    } finally { doctorsState.doctors = [{ id, name: 'Dr. Practice' }] }
  })
  it('opens on the doctor a Home nudge pointed at', async () => {
    const id = '00000000-0000-4000-8000-000000000001'
    render(React.createElement(AICoach as React.ComponentType<{ initialDoctorId?: string }>, { initialDoctorId: id }))
    await waitFor(() => expect((screen.getByLabelText('Which doctor was the call with?') as HTMLSelectElement).value).toBe(id))
  })
  it('lets the rep approve a promise the coach spotted into the tracker', async () => {
    fetchMock.mockImplementation(async (_url, init) => init?.method === 'POST'
      ? Response.json({ result: { questions: [], promises: ['Bring the study next week'], report }, saved: true, id: 'saved' }) : Response.json({ entries: [] }))
    render(React.createElement(AICoach))
    fillForm(); fireEvent.click(screen.getByText('Get coaching'))
    await screen.findByText('Bring the study next week')
    fireEvent.click(screen.getByText('Add to my promises'))
    await screen.findByText('Added')
    expect(addPromise).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'Bring the study next week')
  })
  it('shows persistence failure without hiding useful coaching', async () => {
    fetchMock.mockImplementation(async (_url, init) => init?.method === 'POST' ? Response.json({ result: { questions: [], report }, saved: false }) : Response.json({ entries: [] }))
    render(React.createElement(AICoach)); fillForm(); fireEvent.click(screen.getByText('Get coaching'))
    await screen.findByText('Clarify first.')
    await waitFor(() => expect(screen.getByText(/could not be saved/)).toBeTruthy())
  })
})
