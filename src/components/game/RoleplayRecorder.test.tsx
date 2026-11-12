// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'
import type { RoleplayResult } from '@/lib/roleplay-core'
import RoleplayRecorder from './RoleplayRecorder'

const m = vi.hoisted(() => ({ hook: vi.fn() }))
vi.mock('@/hooks/useRoleplayRecorder', () => ({ useRoleplayRecorder: m.hook }))
vi.mock('./RecordedConversationAnalysis', () => ({ default: () => null }))

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

const read = (style: 'driver' | 'analytical') => ({
  style, confidence: 73, assertiveness: 80, responsiveness: 20,
  proof: { paceLabel: 'fast', rangeLabel: 'narrow', hesitationLabel: 'low', wpm: 182, pitchRange: 40, totalHesitations: 3 },
})

const result: RoleplayResult = {
  talkRatio: { repMs: 5000, partnerMs: 5000, totalMs: 10000, repRatio: 0.5 },
  rapidTurnSwitches: 0, turnCount: 12, questionRatio: 0.3, questionCount: 3, openQuestionRatio: 0.5,
  paraphraseScore: 0.4, termOverlap: 0.2, activeListening: { score: 80, label: 'excellent' },
  // The acoustic reads are present (they are still computed and stored)...
  repRead: read('driver'), partnerRead: read('analytical'), adaptationScore: { score: 12, label: 'mismatched' },
  durationSec: 60, warmth: 0, predicates: { visual: 0, auditory: 0, kinesthetic: 0, dominant: null },
}

describe('colleague roleplay results', () => {
  it('shows raw delivery measures but never a social style or style match read from audio', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(null)))
    m.hook.mockReturnValue({
      phase: 'done', error: null, previewUrl: null, saveError: false, autoStopped: false, retryAnalysis: vi.fn(),
      elapsedSec: 60, speakerPreviews: [], result, sessionId: null,
      start: vi.fn(), stop: vi.fn(), pickSpeaker: vi.fn(), backToPickSpeaker: vi.fn(), reset: vi.fn(),
    })
    const { container } = render(<LanguageProvider><RoleplayRecorder doctorId={null} colleagueId="c1" onDone={() => {}} /></LanguageProvider>)
    const text = container.textContent ?? ''
    // ...but the screen names no style, no "confidence" percentage, no match score.
    expect(text).not.toMatch(/driver|analytical|amiable|expressive/i)
    expect(text).not.toContain('73%')
    expect(text).not.toContain('12%')
    // The measurement itself is still shown, with its unit.
    expect(screen.getByText(/182/)).toBeTruthy()
  })
})
