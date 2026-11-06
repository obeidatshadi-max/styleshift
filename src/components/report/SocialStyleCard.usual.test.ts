// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { createElement } from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { SocialStyleCard } from './SocialStyleCard'
import { LanguageProvider } from '@/lib/i18n'
import type { SocialStyleSection, UsualVsToday } from '@/schemas/conversationReport'

afterEach(() => { cleanup(); localStorage.clear(); document.documentElement.removeAttribute('dir') })
beforeEach(() => localStorage.clear())

const read = (subject: 'customer' | 'rep') => ({ subject, strongestSignals: [], possibleStyle: null, mixedEvidenceNote: null, alternativeExplanation: null, savedProfile: null, profileDrift: false, isSimulationSetting: false })
const section = (usualVsToday?: UsualVsToday | null, over: Partial<SocialStyleSection> = {}): SocialStyleSection =>
  ({ customer: read('customer'), rep: read('rep'), adaptation: [], signalChanges: [], coachingCard: null, ...(usualVsToday === undefined ? {} : { usualVsToday }), ...over })
const render_ = (s: SocialStyleSection) => render(createElement(LanguageProvider, null, createElement(SocialStyleCard, { section: s })))

const QUOTE = 'I have one minute, but leave the study.'
const full: UsualVsToday = {
  usual: { style: 'analytical', source: 'rep_recorded' },
  observations: [{ category: 'time_limit', evidence: { segmentIndex: 0, speakerRole: 'counterpart', quote: QUOTE } }],
  differsFromUsual: true, limited: false,
  uncertainty: 'The reason for the short visit is unclear.',
  adjustment: 'Give a short summary and offer the approved evidence for later.',
  examplePhrase: 'Would you prefer the main point now and the full study later?',
}

describe('usual pattern / this conversation / helpful adjustment, in English', () => {
  it('shows the four parts, labelled, with the real quote', () => {
    render_(section(full))
    expect(screen.getByText('Usual pattern')).toBeTruthy()
    expect(screen.getByTestId('usual-pattern').textContent).toContain('Your saved profile: Detail-focused and cautious')
    expect(screen.getByTestId('usual-pattern').textContent).toContain('A tendency you recorded')
    expect(screen.getByTestId('usual-today').textContent).toContain('Mentioned limited time')
    expect(screen.getByTestId('usual-today').textContent).toContain(QUOTE)
    expect(screen.getByText('What remains uncertain')).toBeTruthy()
    expect(screen.getByTestId('usual-adjust').textContent).toContain('Give a short summary')
    expect(screen.getByTestId('usual-adjust').textContent).toContain('You could say')
  })
  it('shows one quote when two observations come from the same line', () => {
    render_(section({ ...full, observations: [
      { category: 'time_limit', evidence: { segmentIndex: 0, speakerRole: 'counterpart', quote: QUOTE } },
      { category: 'detail_request', evidence: { segmentIndex: 0, speakerRole: 'counterpart', quote: QUOTE } },
    ] }))
    const text = screen.getByTestId('usual-today').textContent ?? ''
    expect(text).toContain('Mentioned limited time')
    expect(text).toContain('Mentioned evidence, data or a comparison')
    expect(text.split(QUOTE)).toHaveLength(2)
  })
  it('words a difference from the profile neutrally', () => {
    render_(section(full))
    const text = screen.getByTestId('usual-differs').textContent ?? ''
    expect(text).toContain('This conversation differs from your saved profile.')
    expect(text).toContain('does not show that the doctor has changed')
    expect(text).not.toMatch(/drift|changed personality/i)
  })
  it('shows "No usual pattern recorded." and no invented baseline', () => {
    render_(section({ ...full, usual: { style: null, source: 'none' }, differsFromUsual: false }))
    expect(screen.getByTestId('usual-pattern').textContent).toBe('Usual patternNo usual pattern recorded.')
  })
  it('labels a simulation as a configured practice tendency, not a real doctor', () => {
    render_(section({ ...full, usual: { style: 'driver', source: 'practice_setting' }, differsFromUsual: false }))
    const text = screen.getByTestId('usual-pattern').textContent ?? ''
    expect(text).toContain('Practice setting')
    expect(text).toContain('not a trait of a real doctor')
    expect(text).not.toContain('Your saved profile')
  })
  it('says so when there is nothing clear to describe, and leaves out empty parts', () => {
    render_(section({ usual: { style: 'amiable', source: 'rep_recorded' }, observations: [], differsFromUsual: false, limited: false, uncertainty: null, adjustment: null, examplePhrase: null }))
    expect(screen.getByTestId('usual-today').textContent).toContain('not enough clear evidence')
    expect(screen.queryByTestId('usual-uncertain')).toBeNull()
    expect(screen.queryByTestId('usual-adjust')).toBeNull()
  })
  it('keeps the reason for short replies open', () => {
    render_(section({ usual: { style: 'amiable', source: 'rep_recorded' }, observations: [{ category: 'brief_replies', evidence: { segmentIndex: 1, speakerRole: 'counterpart', quote: 'Fine.' } }], differsFromUsual: false, limited: false, uncertainty: null, adjustment: null, examplePhrase: null }))
    expect(screen.getByTestId('usual-today').textContent).toContain('Gave short replies')
    expect(screen.getByTestId('usual-uncertain').textContent).toContain('The reason for the short replies is not clear')
  })
  it('shows the limited-reading note for a short conversation', () => {
    render_(section({ ...full, differsFromUsual: false, limited: true }))
    expect(screen.getByTestId('usual-uncertain').textContent).toContain('limited reading')
  })
  it('does not repeat the old coaching card next to the new view', () => {
    const card = { observedSignals: 'a', possiblePreference: 'b', evidenceAndAlternative: 'c', repResponse: 'd', mostUsefulAdjustment: 'e', suggestedWordingNextVisit: 'f' }
    render_(section(full, { coachingCard: card }))
    expect(screen.queryByText('Best change to make:')).toBeNull()
  })
})

describe('an older saved report, without the new field', () => {
  it('renders as before and does not show the new section', () => {
    const card = { observedSignals: 'a', possiblePreference: 'b', evidenceAndAlternative: 'c', repResponse: 'd', mostUsefulAdjustment: 'Old advice', suggestedWordingNextVisit: 'f' }
    render_(section(undefined, { coachingCard: card, customer: { ...read('customer'), possibleStyle: 'driver' } }))
    expect(screen.queryByTestId('usual-vs-today')).toBeNull()
    expect(screen.getByText('Direct and results-focused')).toBeTruthy()
    expect(screen.getByText(/Old advice/)).toBeTruthy()
  })
  it('an old difference flag now reads neutrally', () => {
    render_(section(undefined, { customer: { ...read('customer'), possibleStyle: 'expressive', savedProfile: 'analytical', profileDrift: true } }))
    const text = screen.getByTestId('social-style-drift').textContent ?? ''
    expect(text).toContain('This conversation differs from your saved profile')
    expect(text).not.toMatch(/second look/)
  })
})

describe('in Arabic', () => {
  it('shows every new label in Arabic, right to left, with the quote unchanged', async () => {
    localStorage.setItem('styleshift_lang', 'ar')
    render_(section(full))
    expect(await screen.findByText('النمط المعتاد')).toBeTruthy()
    expect(document.documentElement.dir).toBe('rtl')
    expect(screen.getByText('هذه المحادثة')).toBeTruthy()
    expect(screen.getByText('ما الذي ما زال غير واضح')).toBeTruthy()
    expect(screen.getByText('تعديل مفيد')).toBeTruthy()
    expect(screen.getByTestId('usual-pattern').textContent).toContain('ملفك المحفوظ')
    expect(screen.getByTestId('usual-today').textContent).toContain('ذكر أن وقته محدود')
    expect(screen.getByTestId('usual-today').textContent).toContain(QUOTE)
    expect(screen.getByTestId('usual-differs').textContent).toContain('هذه المحادثة تختلف عن ملفك المحفوظ')
    expect(screen.getByTestId('usual-adjust').textContent).toContain('يمكنك أن تقول')
    // No English fallback leaked into the new labels.
    expect(screen.getByTestId('usual-pattern').textContent).not.toMatch(/Usual pattern|saved profile/)
  })
})
