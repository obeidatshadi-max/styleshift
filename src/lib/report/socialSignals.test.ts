// src/lib/report/socialSignals.test.ts
import { describe, it, expect } from 'vitest'
import { extractSocialSignals } from './socialSignals'
import type { TranscriptSegment } from '@/schemas/conversationReport'

function seg(i: number, role: 'rep' | 'counterpart', text: string): TranscriptSegment {
  return { segmentIndex: i, speakerRole: role, text, startMs: null, endMs: null, createdAt: null }
}

describe('extractSocialSignals', () => {
  it('detects a directness/brevity signal in English', () => {
    const segments = [seg(0, 'counterpart', 'Just give me the bottom line, I do not have time for details.')]
    const signals = extractSocialSignals(segments, 'counterpart')
    expect(signals.some(s => s.category === 'directness')).toBe(true)
  })
  it('detects a detail/evidence request in Iraqi Arabic', () => {
    const segments = [seg(0, 'counterpart', 'شنو الدليل او الدراسة الي تثبت هذا الكلام؟')]
    const signals = extractSocialSignals(segments, 'counterpart')
    expect(signals.some(s => s.category === 'detail_request')).toBe(true)
  })
  it('detects a relationship/acknowledgement signal in Iraqi Arabic', () => {
    const segments = [seg(0, 'counterpart', 'شلونك حبيبي، شخبار العائلة؟')]
    const signals = extractSocialSignals(segments, 'counterpart')
    expect(signals.some(s => s.category === 'relationship_language')).toBe(true)
  })
  it('returns evidence pointing at the real segment', () => {
    const segments = [seg(2, 'counterpart', 'Can we move faster on this decision?')]
    const signals = extractSocialSignals(segments, 'counterpart')
    expect(signals[0].evidence).toEqual({ segmentIndex: 2, speakerRole: 'counterpart', quote: 'Can we move faster on this decision?' })
  })
  it('only reads segments from the requested speaker', () => {
    const segments = [seg(0, 'rep', 'Just the bottom line for you.'), seg(1, 'counterpart', 'Take your time explaining.')]
    const signals = extractSocialSignals(segments, 'counterpart')
    expect(signals.every(s => s.evidence.segmentIndex === 1)).toBe(true)
  })
})
