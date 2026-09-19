// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'
import type { Doctor } from '@/types/game'
import type { Competency, Observation } from '@/schemas/observation'
import type { SessionReport } from '@/schemas/report'
import { scoreSession } from '@/scoring/engine'
import TextSimulation from './TextSimulation'
import TextSimulationReport from './TextSimulationReport'

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

const doctor = { id: '11111111-1111-4111-8111-111111111111', name: 'Dr. Salim', style: 'analytical' } as unknown as Doctor

function obs(competency: Competency, behavior: string, direction: 'positive' | 'negative', turnIndex: number, quote: string): Observation {
  return { competency, behavior, observation: `Observed ${behavior}.`, evidence: [{ turnIndex, role: 'rep', quote }], timestamp: null, direction, confidence: 1 }
}

function makeReport(): SessionReport {
  const observations = [
    obs('active_listening', 'paraphrasing', 'positive', 3, 'So you are worried about older patients'),
    obs('discovery', 'premature_pitch', 'negative', 1, 'Our product works for everyone'),
  ]
  return {
    sessionId: 's', generatedAt: '', lang: 'en',
    header: { repName: 'Rana', physicianName: 'Dr. Salim', specialty: null, difficulty: 'realistic', outcome: 'abandoned', repTurns: 2, startedAt: null, endedAt: null },
    transcript: [{ turnIndex: 0, role: 'doctor', text: 'Not sure about this.', createdAt: null }, { turnIndex: 1, role: 'rep', text: 'Our product works for everyone', createdAt: null }],
    observationsByCompetency: { active_listening: [observations[0]], discovery: [observations[1]] },
    scores: scoreSession(observations, 'realistic'),
    coaching: [{
      id: 'c1', priority: 1, kind: 'improve', competency: 'discovery', behavior: 'premature_pitch',
      whatHappened: 'You pitched before asking anything.', evidence: observations[1].evidence,
      whyItMattered: 'The doctor gave a flat reply.', whatToDoDifferently: 'Ask about their patients first.',
      betterResponseExample: 'Which patients concern you most?', practiceAction: 'Ask two open questions before any pitch.', objectiveId: null,
    }],
    coachingStatus: 'ready', warnings: [],
  }
}

const wrap = (el: React.ReactElement) => createElement(LanguageProvider, null, el)

describe('TextSimulationReport', () => {
  it('shows every section the brief asks for, in English', () => {
    render(wrap(createElement(TextSimulationReport, { report: makeReport(), onTryAgain: vi.fn(), onBack: vi.fn(), onRetryCoaching: vi.fn() })))
    for (const text of [
      'Overall', 'Competency scores', 'Strongest behavior', 'Biggest development opportunity', 'Behavioral observations',
      'Coaching recommendation', 'Better example response', 'Practice action', 'Try Again',
      'Paraphrasing the doctor', 'Pitching too early', 'Not enough evidence',
    ]) expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Which patients concern you most\?/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/So you are worried about older patients/).length).toBeGreaterThan(0) // transcript evidence
    expect(screen.queryByText(/^sim\./)).toBeNull() // no raw i18n keys leaked
  })

  it('renders Arabic labels with no raw keys, and wires Try Again', async () => {
    localStorage.setItem('styleshift_lang', 'ar')
    const onTryAgain = vi.fn()
    render(wrap(createElement(TextSimulationReport, { report: makeReport(), onTryAgain, onBack: vi.fn(), onRetryCoaching: vi.fn() })))
    await waitFor(() => expect(screen.getAllByText('تقرير المحاكاة').length).toBeGreaterThan(0))
    expect(screen.getAllByText('أقوى سلوك').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/sim\.[a-z]/)
    fireEvent.click(screen.getByText('حاول مرة أخرى'))
    expect(onTryAgain).toHaveBeenCalledTimes(1)
  })

  it('offers a coaching retry (and never blanks the report) when coaching was unavailable', () => {
    const r = { ...makeReport(), coaching: [], coachingStatus: 'unavailable' as const, warnings: ['coaching_unavailable:upstream'] }
    const onRetryCoaching = vi.fn()
    render(wrap(createElement(TextSimulationReport, { report: r, onTryAgain: vi.fn(), onBack: vi.fn(), onRetryCoaching, error: 'The AI service didn’t respond. Try again.' })))
    expect(screen.getByText(/Coaching couldn’t be generated/)).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toMatch(/didn’t respond/)
    fireEvent.click(screen.getByText('Retry coaching'))
    expect(onRetryCoaching).toHaveBeenCalled()
    expect(screen.getAllByText('Pitching too early').length).toBeGreaterThan(0) // observations still shown
  })
})

describe('TextSimulation flow', () => {
  function mockApi(handlers: Record<string, () => { status?: number; body: unknown }>) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const h = handlers[String(input)]
      const { status = 200, body } = h ? h() : { status: 404, body: { error: 'nope' } }
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    })
  }

  it('opens with the doctor, sends a reply, ends, and shows the report; Try Again starts a new session', async () => {
    const fetchMock = mockApi({
      '/api/simulation/start': () => ({ body: { sessionId: 's-1', doctorText: 'I am not sure about your product.' } }),
      '/api/simulation/message': () => ({ body: { doctorText: 'Go on, I am listening.', repTurns: 1 } }),
      '/api/simulation/end': () => ({ body: { report: makeReport(), phase: 'reported' } }),
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

    await act(async () => { fireEvent.click(screen.getByText('Try Again')) })
    await waitFor(() => expect(fetchMock.mock.calls.filter(c => String(c[0]) === '/api/simulation/start')).toHaveLength(2))
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
      '/api/simulation/end': () => (ok ? { body: { report: makeReport(), phase: 'reported' } } : { status: 502, body: { error: 'analysis_failed' } }),
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
