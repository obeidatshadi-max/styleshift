// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { createElement } from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { SocialStyleCard } from './SocialStyleCard'
import { LanguageProvider } from '@/lib/i18n'
import type { SocialStyleSection } from '@/schemas/conversationReport'

afterEach(() => cleanup())

function section(overrides: Partial<SocialStyleSection> = {}): SocialStyleSection {
  return {
    customer: { subject: 'customer', strongestSignals: [], possibleStyle: null, mixedEvidenceNote: null, alternativeExplanation: null, savedProfile: null, profileDrift: false, isSimulationSetting: false },
    rep: { subject: 'rep', strongestSignals: [], possibleStyle: null, mixedEvidenceNote: null, alternativeExplanation: null, savedProfile: null, profileDrift: false, isSimulationSetting: false },
    adaptation: [], signalChanges: [], coachingCard: null,
    ...overrides,
  }
}

function renderCard(section: SocialStyleSection) {
  return render(createElement(LanguageProvider, null, createElement(SocialStyleCard, { section })))
}

describe('SocialStyleCard', () => {
  it('never renders a bare confidence percentage next to the style label', () => {
    const s = section({ customer: { subject: 'customer', strongestSignals: [{ text: 'x', evidence: { segmentIndex: 0, speakerRole: 'counterpart', quote: 'x' }, category: 'directness' }], possibleStyle: 'driver', mixedEvidenceNote: null, alternativeExplanation: null, savedProfile: null, profileDrift: false, isSimulationSetting: false } })
    renderCard(s)
    expect(screen.queryByText(/\d+%/)).toBeNull()
  })
  it('shows the drift banner when profileDrift is true', () => {
    const s = section({ customer: { subject: 'customer', strongestSignals: [], possibleStyle: 'expressive', mixedEvidenceNote: null, alternativeExplanation: null, savedProfile: 'analytical', profileDrift: true, isSimulationSetting: false } })
    renderCard(s)
    expect(screen.getByTestId('social-style-drift')).toBeTruthy()
  })
})
