// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { createElement } from 'react'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
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
  describe('self-check on the rep style', () => {
    const repRead = (possibleStyle: 'driver' | 'amiable' | null) =>
      ({ subject: 'rep' as const, strongestSignals: [], possibleStyle, mixedEvidenceNote: null, alternativeExplanation: null, savedProfile: null, profileDrift: false, isSimulationSetting: false })

    it('hides the observed rep style until the rep picks one, then shows it with a match note', () => {
      renderCard(section({ rep: repRead('driver') }))
      expect(screen.getByTestId('self-check-prompt')).toBeTruthy()
      expect(screen.queryByText('Direct and results-focused', { selector: 'p' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Direct and results-focused' }))
      expect(screen.getByTestId('self-check-result').textContent).toContain('matches')
      expect(screen.getByText('Direct and results-focused', { selector: 'p' })).toBeTruthy()
    })

    it('says the styles differ without calling it wrong', () => {
      renderCard(section({ rep: repRead('driver') }))
      fireEvent.click(screen.getByRole('button', { name: 'Relationship-focused and steady' }))
      const text = screen.getByTestId('self-check-result').textContent ?? ''
      expect(text).toContain('Relationship-focused and steady')
      expect(text).toContain('Direct and results-focused')
      expect(text).toContain('not a verdict')
    })

    it('skip reveals the read with no comparison', () => {
      renderCard(section({ rep: repRead('driver') }))
      fireEvent.click(screen.getByText('Skip, just show me'))
      expect(screen.getByText('Direct and results-focused', { selector: 'p' })).toBeTruthy()
      expect(screen.queryByTestId('self-check-result')).toBeNull()
    })

    it('shows no prompt when the report found no rep style', () => {
      renderCard(section({ rep: repRead(null) }))
      expect(screen.queryByTestId('self-check-prompt')).toBeNull()
    })
  })

  it('renders all six coaching-card fields when coachingCard is present', () => {
    const s = section({
      coachingCard: {
        observedSignals: 'Spoke quickly and interrupted twice.',
        possiblePreference: 'Possibly driver-leaning.',
        evidenceAndAlternative: 'Could also be time pressure.',
        repResponse: 'Rep slowed down and asked an open question.',
        mostUsefulAdjustment: 'Lead with the bottom line first.',
        suggestedWordingNextVisit: "Here's the headline first — then I'll walk through why.",
      },
    })
    renderCard(s)
    expect(screen.getByText('Spoke quickly and interrupted twice.')).toBeTruthy()
    expect(screen.getByText('Possibly driver-leaning.')).toBeTruthy()
    expect(screen.getByText('Could also be time pressure.')).toBeTruthy()
    expect(screen.getByText('Rep slowed down and asked an open question.')).toBeTruthy()
    expect(screen.getByText('Lead with the bottom line first.')).toBeTruthy()
    expect(screen.getByText("Here's the headline first — then I'll walk through why.")).toBeTruthy()
  })
})
