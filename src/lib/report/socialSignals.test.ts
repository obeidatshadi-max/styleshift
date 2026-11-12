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
  it('tags an evidence request in Iraqi Arabic as evidence_request, not as a style cue', () => {
    const segments = [seg(0, 'counterpart', 'شنو الدليل او الدراسة الي تثبت هذا الكلام؟')]
    const signals = extractSocialSignals(segments, 'counterpart')
    expect(signals.map(s => s.category)).toEqual(['evidence_request'])
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
  it('detects a reassurance-request signal in Iraqi Arabic (hamza-on-alef form)', () => {
    // Uses the hamza-on-alef spelling (متأكد) a real transcript would contain,
    // not the bare-alef form the pattern is written with — this exercises the
    // normalizeForMatch() hamza-folding path, not just a literal string match.
    const segments = [seg(0, 'counterpart', 'متأكد هذا الدواء ما يعطي اثار جانبية؟')]
    const signals = extractSocialSignals(segments, 'counterpart')
    expect(signals.some(s => s.category === 'reassurance_request')).toBe(true)
  })
  it('only reads segments from the requested speaker', () => {
    const segments = [seg(0, 'rep', 'Just the bottom line for you.'), seg(1, 'counterpart', 'Take your time explaining.')]
    const signals = extractSocialSignals(segments, 'counterpart')
    expect(signals.every(s => s.evidence.segmentIndex === 1)).toBe(true)
  })

  // Validation audit 2026-11-12, W4: each line below fired a false style signal before.
  const cats = (text: string) => extractSocialSignals([seg(0, 'counterpart', text)], 'counterpart').map(s => s.category)
  describe('negation', () => {
    it('"مو مستعجل" (not in a hurry) is not a time limit', () => expect(cats('لا دكتور، مو مستعجل، خذ راحتك')).not.toContain('time_limit'))
    it('"ما أريد دراسة" (I do not want a study) is not an evidence request', () => expect(cats('ما أريد دراسة، احجيلي عن المرضى')).not.toContain('evidence_request'))
    it('"no need for data" is not an evidence request', () => expect(cats('There is no need for data, I know this drug.')).not.toContain('evidence_request'))
    it('"I am not in a hurry" is not a time limit', () => expect(cats('I am not in a hurry today.')).not.toContain('time_limit'))
    it('still fires when the pattern itself is the negation', () => {
      expect(cats('لا، ما عندي وقت')).toContain('directness')
      expect(cats('I am not ready to switch.')).toContain('pace_preference')
    })
    it('an unnegated mention later in the same line still counts', () => expect(cats('Not now, but send me the study.')).toContain('evidence_request'))
  })
  describe('Arabic word edges', () => {
    it('"قرار" inside "استقرار" (stability) is not a results focus', () => expect(cats('المريض وصل لحالة استقرار')).not.toContain('results_focus'))
    it('"قرار" with an attached prefix still counts', () => expect(cats('نحتاج القرار هسه')).toContain('results_focus'))
    it('"خلص" (fine, done) is not directness', () => expect(cats('خلص، تمام')).not.toContain('directness'))
    it('evidence words still match with attached prefixes and suffixes', () => {
      expect(cats('وبالدراسة شنو طلع؟')).toContain('evidence_request')
      expect(cats('دراستكم وين منشورة؟')).toContain('evidence_request')
    })
  })
  describe('clinical evidence is not a style cue', () => {
    it('"study", "data", "evidence" are evidence_request only', () => {
      for (const t of ['Do you have a study on this?', 'Show me the data.', 'What is the evidence?']) expect(cats(t)).toEqual(['evidence_request'])
    })
    it('"نتائج الدراسة" (study results) fires one neutral signal, not a results-focused style', () => expect(cats('شنو نتائج الدراسة؟')).toEqual(['evidence_request']))
    it('"results of the trial" is not a results focus', () => expect(cats('What were the results of the trial?')).toEqual(['evidence_request']))
    it('a plain ask for results is still results_focus', () => expect(cats('I want results, not talk.')).toContain('results_focus'))
    it('a non-clinical ask for detail is still detail_request', () => expect(cats('Walk me through it step by step.')).toContain('detail_request'))
  })
})
