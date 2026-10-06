// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { createElement } from 'react'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ConversationReport } from './ConversationReport'
import { LanguageProvider } from '@/lib/i18n'
import type { ConversationReport as Report } from '@/schemas/conversationReport'

afterEach(() => cleanup())

function minimalReport(overrides: Partial<Report> = {}): Report {
  return {
    reportSchemaVersion: 1, sessionType: 'human_partner', transcriptVersion: 1, scoringConfigVersion: null,
    generatedAt: '2026-09-24T09:00:00.000Z',
    visitSummary: { sessionType: 'human_partner', objective: null, summary: 'Short intro visit.', objectiveStatus: 'insufficient_evidence', objectiveStatusReason: 'No objective was supplied for this session.', evidence: [] },
    customerUnderstanding: { needs: [], concerns: [], decisionCriteria: [], openQuestions: [] },
    performance: [], criticalMoments: [], voiceMeasurements: [], commitments: [],
    coachingPriority: { behavior: 'Ask before pitching', evidence: [{ segmentIndex: 0, speakerRole: 'rep', quote: 'Let me tell you about our product.' }], betterPhrase: 'What matters most to you today?', practiceExercise: 'Practice one open question.', successLooksLike: 'Customer answers with a need.' },
    strength: { behavior: 'Stayed on time', evidence: [] },
    socialStyle: { customer: { subject: 'customer', strongestSignals: [], possibleStyle: null, mixedEvidenceNote: null, alternativeExplanation: null, savedProfile: null, profileDrift: false, isSimulationSetting: false }, rep: { subject: 'rep', strongestSignals: [], possibleStyle: null, mixedEvidenceNote: null, alternativeExplanation: null, savedProfile: null, profileDrift: false, isSimulationSetting: false }, adaptation: [], signalChanges: [], coachingCard: null },
    qualityFlags: [],
    ...overrides,
  }
}

function renderReport(props: { report: Report; outdated: boolean; audioAvailable?: boolean }) {
  return render(createElement(LanguageProvider, null, createElement(ConversationReport, props)))
}

describe('ConversationReport', () => {
  it('shows the contextual question and uncertainty without inventing a response', () => {
    renderReport({ outdated: false, report: minimalReport({ momentUnderstanding: {
      evidence: { segmentIndex: 0, speakerRole: 'counterpart', quote: 'It is the same as the others.' },
      possibleMeanings: ['A meaningful difference may be unclear.'], missingContext: 'The comparison criteria are unknown.',
      clarifyingQuestion: 'Which difference matters most?', subsequentResponse: null,
    } }) })
    expect(screen.getByRole('region', { name: 'Understand this moment' })).toBeTruthy()
    expect(screen.getByText('Which difference matters most?')).toBeTruthy()
    expect(screen.getByText('The comparison criteria are unknown.')).toBeTruthy()
    expect(screen.getByText('No subsequent doctor response was recorded.')).toBeTruthy()
  })
  it('keeps older saved reports readable without the optional card', () => {
    renderReport({ report: minimalReport(), outdated: false })
    expect(screen.queryByRole('region', { name: 'Understand this moment' })).toBeNull()
  })
  it('renders the visit summary without inventing an objective when none was supplied', () => {
    renderReport({ report: minimalReport(), outdated: false })
    expect(screen.getByText('Short intro visit.')).toBeTruthy()
    expect(screen.queryByText(/objective:/i)?.textContent).not.toMatch(/undefined|null/i)
  })
  it('shows an outdated banner when outdated=true', () => {
    renderReport({ report: minimalReport(), outdated: true })
    expect(screen.getByTestId('report-outdated-banner')).toBeTruthy()
  })
  it('never renders a playback control for a segment with no startMs', () => {
    const report = minimalReport({
      coachingPriority: { behavior: 'x', evidence: [{ segmentIndex: 0, speakerRole: 'rep', quote: 'no audio here' }], betterPhrase: 'y', practiceExercise: 'z', successLooksLike: 'w' },
    })
    renderReport({ report, outdated: false, audioAvailable: false })
    expect(screen.queryByRole('button', { name: /play/i })).toBeNull()
  })
  it('renders only voice measurements marked available', () => {
    const report = minimalReport({
      voiceMeasurements: [
        { metric: 'speaking_rate', value: 132, unit: 'wpm', explanation: 'Visible measurement.', available: true },
        { metric: 'pauses', value: 4, unit: 'count', explanation: 'Hidden measurement.', available: false },
      ],
    })
    renderReport({ report, outdated: false })
    // Voice measurements render inside a collapsed-by-default accordion —
    // open it first, same as a rep would tap it in the real UI.
    fireEvent.click(screen.getByText('Voice measurements'))
    expect(screen.getByText('Visible measurement.')).toBeTruthy()
    expect(screen.queryByText('Hidden measurement.')).toBeNull()
  })
})
