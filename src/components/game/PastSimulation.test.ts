// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'
import PastSimulation from './PastSimulation'

const saved = vi.hoisted(() => ({ state: { status: 'loading' } as Record<string, unknown> }))
vi.mock('@/hooks/useSavedReport', () => ({ useSavedReport: () => saved.state }))
vi.mock('@/components/report/ConversationReport', () => ({
  ConversationReport: ({ report }: { report: { label: string } }) => createElement('div', null, `Report: ${report.label}`),
}))
vi.mock('./PracticeReport', () => ({
  default: ({ sessionId, sessionType }: { sessionId: string; sessionType: string }) => createElement('div', null, `Generating ${sessionType} ${sessionId}`),
}))
afterEach(() => { cleanup(); localStorage.clear() })
const view = (onBack = vi.fn()) =>
  render(createElement(LanguageProvider, null, createElement(PastSimulation, { sessionId: 'sim-1', onBack })))

describe('PastSimulation', () => {
  it('shows a loading state while the saved report is fetched', () => {
    saved.state = { status: 'loading' }
    view()
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByText(/Generating/)).toBeNull()
  })

  it('shows the saved report without generating a new one', () => {
    saved.state = { status: 'found', report: { label: 'Saved coaching' } }
    view()
    expect(screen.getByText('Report: Saved coaching')).toBeTruthy()
    expect(screen.queryByText(/Generating/)).toBeNull()
  })

  it('generates a report, with a note, when none was saved for the simulation', () => {
    saved.state = { status: 'missing' }
    view()
    expect(screen.getByText(/No saved report for this simulation/)).toBeTruthy()
    expect(screen.getByText('Generating ai_doctor_text sim-1')).toBeTruthy()
  })

  it('falls back to generating when the lookup itself failed', () => {
    saved.state = { status: 'error' }
    view()
    expect(screen.getByText('Generating ai_doctor_text sim-1')).toBeTruthy()
  })

  it('goes back to the history list', () => {
    saved.state = { status: 'found', report: { label: 'x' } }
    const onBack = vi.fn()
    view(onBack)
    fireEvent.click(screen.getByText('← Back to history'))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
