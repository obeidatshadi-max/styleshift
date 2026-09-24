// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'
import type { Doctor } from '@/types/game'
import type { ConversationReport } from '@/schemas/conversationReport'
import TextSimulation from './TextSimulation'

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

const doctor = { id: '11111111-1111-4111-8111-111111111111', name: 'Dr. Salim', style: 'analytical' } as unknown as Doctor

// Minimal fixture for the shared ConversationReport pipeline (same shape as
// src/components/report/ConversationReport.test.ts's minimalReport).
function makeConversationReport(overrides: Partial<ConversationReport> = {}): ConversationReport {
  return {
    reportSchemaVersion: 1, sessionType: 'ai_doctor_text', transcriptVersion: 1, scoringConfigVersion: null,
    generatedAt: '2026-09-24T09:00:00.000Z',
    visitSummary: { sessionType: 'ai_doctor_text', objective: null, summary: 'Short intro visit.', objectiveStatus: 'insufficient_evidence', objectiveStatusReason: 'No objective was supplied for this session.', evidence: [] },
    customerUnderstanding: { needs: [], concerns: [], decisionCriteria: [], openQuestions: [] },
    performance: [], criticalMoments: [], voiceMeasurements: [], commitments: [],
    coachingPriority: { behavior: 'Ask before pitching', evidence: [{ segmentIndex: 0, speakerRole: 'rep', quote: 'Let me tell you about our product.' }], betterPhrase: 'What matters most to you today?', practiceExercise: 'Practice one open question.', successLooksLike: 'Customer answers with a need.' },
    strength: { behavior: 'Stayed on time', evidence: [] },
    socialStyle: { customer: { subject: 'customer', strongestSignals: [], possibleStyle: null, mixedEvidenceNote: null, alternativeExplanation: null, savedProfile: null, profileDrift: false, isSimulationSetting: false }, rep: { subject: 'rep', strongestSignals: [], possibleStyle: null, mixedEvidenceNote: null, alternativeExplanation: null, savedProfile: null, profileDrift: false, isSimulationSetting: false }, adaptation: [], signalChanges: [], coachingCard: null },
    qualityFlags: [],
    ...overrides,
  }
}

const wrap = (el: React.ReactElement) => createElement(LanguageProvider, null, el)

describe('TextSimulation flow', () => {
  function mockApi(handlers: Record<string, () => { status?: number; body: unknown }>) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const h = handlers[String(input)]
      const { status = 200, body } = h ? h() : { status: 404, body: { error: 'nope' } }
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    })
  }

  it('opens with the doctor, sends a reply, ends, and renders the shared ConversationReport; Try Again starts a new session', async () => {
    const fetchMock = mockApi({
      '/api/simulation/start': () => ({ body: { sessionId: 's-1', doctorText: 'I am not sure about your product.' } }),
      '/api/simulation/message': () => ({ body: { doctorText: 'Go on, I am listening.', repTurns: 1 } }),
      '/api/simulation/end': () => ({ body: { phase: 'reported' } }),
      '/api/reports/generate': () => ({ body: { reportId: 'r-1', report: makeConversationReport() } }),
    })
    render(wrap(createElement(TextSimulation, { doctor, onDone: vi.fn() })))

    await screen.findByText('I am not sure about your product.')
    expect(screen.getByText('Send')).toBeTruthy()
    expect(screen.getByText('End Simulation')).toBeTruthy()
    expect((screen.getByText('Send') as HTMLButtonElement).disabled).toBe(true) // nothing typed yet

    fireEvent.change(screen.getByLabelText('Your reply'), { target: { value: 'What matters most to you?' } })
    await act(async () => { fireEvent.click(screen.getByText('Send')) })
    await screen.findByText('Go on, I am listening.')
    expect(screen.getByText('What matters most to you?')).toBeTruthy()

    await act(async () => { fireEvent.click(screen.getByText('End Simulation')) })
    await screen.findByText('Simulation Report')
    // The shared ConversationReport component rendered with the generated report's data.
    await screen.findByText('Short intro visit.')

    await act(async () => { fireEvent.click(screen.getByText('Try Again')) })
    await waitFor(() => expect(fetchMock.mock.calls.filter(c => String(c[0]) === '/api/simulation/start')).toHaveLength(2))
  })

  it('shows a retry when report generation fails, and Retry re-fetches it', async () => {
    let reportOk = false
    mockApi({
      '/api/simulation/start': () => ({ body: { sessionId: 's-1', doctorText: 'Hello.' } }),
      '/api/simulation/end': () => ({ body: { phase: 'reported' } }),
      '/api/reports/generate': () => (reportOk ? { body: { reportId: 'r-1', report: makeConversationReport() } } : { status: 502, body: { error: 'Report generation failed. Please try again.' } }),
    })
    render(wrap(createElement(TextSimulation, { doctor, onDone: vi.fn() })))
    await screen.findByText('Hello.')
    await act(async () => { fireEvent.click(screen.getByText('End Simulation')) })
    await screen.findByText('Simulation Report')
    await screen.findByText('Something went wrong. Try again.')

    reportOk = true
    await act(async () => { fireEvent.click(screen.getByText('Try again')) })
    await screen.findByText('Short intro visit.')
  })

  it('keeps the typed text and the conversation when a send fails', async () => {
    mockApi({
      '/api/simulation/start': () => ({ body: { sessionId: 's-1', doctorText: 'Hello.' } }),
      '/api/simulation/message': () => ({ status: 502, body: { error: 'doctor_unavailable' } }),
    })
    render(wrap(createElement(TextSimulation, { doctor, onDone: vi.fn() })))
    await screen.findByText('Hello.')
    const box = screen.getByLabelText('Your reply') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'My answer' } })
    await act(async () => { fireEvent.click(screen.getByText('Send')) })
    await screen.findByText('The AI service didn’t respond. Try again.')
    expect(box.value).toBe('My answer')
    expect(screen.getByText('Hello.')).toBeTruthy()
  })

  it('shows a clear message when the feature is not configured', async () => {
    mockApi({ '/api/simulation/start': () => ({ status: 503, body: { error: 'not_configured' } }) })
    render(wrap(createElement(TextSimulation, { doctor, onDone: vi.fn() })))
    await screen.findByText('Text simulation isn’t available right now.')
  })

  it('a failed End keeps the conversation and can be pressed again', async () => {
    let ok = false
    mockApi({
      '/api/simulation/start': () => ({ body: { sessionId: 's-1', doctorText: 'Hello.' } }),
      '/api/simulation/end': () => (ok ? { body: { phase: 'reported' } } : { status: 502, body: { error: 'analysis_failed' } }),
    })
    render(wrap(createElement(TextSimulation, { doctor, onDone: vi.fn() })))
    await screen.findByText('Hello.')
    await act(async () => { fireEvent.click(screen.getByText('End Simulation')) })
    await screen.findByText('The AI service didn’t respond. Try again.')
    ok = true
    await act(async () => { fireEvent.click(screen.getByText('End Simulation')) })
    await screen.findByText('Simulation Report')
  })
})
