import { describe, it, expect } from 'vitest'
import {
  processAcousticData, classifySocialStyle, buildTurns, computeTalkRatio,
  computeRapidTurnSwitches, computeQuestionRatio, classifyQuestions, computeParaphraseScore,
  computeActiveListeningScore, repTranscript,
  scopeAcousticToSpeaker, buildRoleplayResult,
  type Utterance, type PitchSample, type SilencePeriod,
} from './roleplay-core'

describe('processAcousticData + classifySocialStyle (ported acoustic engine)', () => {
  it('reads a fast, low-pitch-range, low-hesitation voice as a driver style', () => {
    const pitchSamples: PitchSample[] = Array.from({ length: 20 }, (_, i) => ({ f0: 120 + (i % 2), vol: 40, t: i * 200 }))
    const metrics = processAcousticData({
      pitchSamples, silencePeriods: [],
      transcript: 'We need to close this deal today and move fast on the numbers right now',
      durationSec: 5,
    })
    expect(metrics).not.toBeNull()
    expect(metrics!.pitchLabel).toBe('deep')
    expect(metrics!.paceLabel).toBe('fast')
    const read = classifySocialStyle(metrics!, 0)
    expect(read.style).toBe('driver')
    expect(read.assertiveness).toBeGreaterThan(50)
  })

  it('returns null when fewer than 5 pitch samples were captured', () => {
    const metrics = processAcousticData({ pitchSamples: [{ f0: 150, vol: 30, t: 0 }], silencePeriods: [], transcript: 'hi', durationSec: 1 })
    expect(metrics).toBeNull()
  })
})

describe('turn-taking analysis', () => {
  const utterances: Utterance[] = [
    { speaker: 'A', text: 'Good morning doctor, thanks for the time today.', start: 0, end: 3000 },
    { speaker: 'B', text: 'Sure, what have you got?', start: 3200, end: 5000 },
    { speaker: 'A', text: 'This new formulation reduces dosing to once daily.', start: 5100, end: 9000 },
    { speaker: 'B', text: 'Does it interact with anticoagulants?', start: 9050, end: 11000 },
    { speaker: 'A', text: 'Good question — no significant interaction was found in trials.', start: 11500, end: 15000 },
  ]

  it('computes talk ratio favouring whichever speaker holds the floor longer', () => {
    const turns = buildTurns(utterances)
    const ratio = computeTalkRatio(turns, 'A')
    expect(ratio.repMs).toBe(3000 + 3900 + 3500)
    expect(ratio.partnerMs).toBe(1800 + 1950)
    expect(ratio.repRatio).toBeCloseTo(ratio.repMs / (ratio.repMs + ratio.partnerMs), 5)
  })

  it('counts rapid speaker switches under the gap threshold', () => {
    const turns = buildTurns(utterances)
    // gaps: 200, 100, 50, 500 — three are under the default 400ms threshold
    expect(computeRapidTurnSwitches(turns, 400)).toBe(3)
    expect(computeRapidTurnSwitches(turns, 50)).toBe(0)
  })

  it('scores question ratio from the rep-labelled turns only', () => {
    const turns = buildTurns(utterances)
    // rep (A) turns: "...today." / "...daily." / "...trials." -> 0 of 3 are questions
    expect(computeQuestionRatio(turns, 'A')).toBe(0)
    // partner (B) turns: "...got?" / "...anticoagulants?" -> 2 of 2 are questions
    expect(computeQuestionRatio(turns, 'B')).toBe(1)
  })

  it('joins only the given speaker\'s turn text for repTranscript', () => {
    const turns = buildTurns(utterances)
    const text = repTranscript(turns, 'A')
    expect(text).toContain('Good morning doctor')
    expect(text).not.toContain('anticoagulants')
  })

  it('scopes pitch samples and silence periods to a speaker\'s turn windows', () => {
    const turns = buildTurns(utterances)
    const pitchSamples: PitchSample[] = [
      { f0: 150, vol: 30, t: 1000 },  // inside A's first turn (0-3000)
      { f0: 150, vol: 30, t: 4000 },  // inside B's turn (3200-5000)
      { f0: 150, vol: 30, t: 6000 },  // inside A's second turn (5100-9000)
    ]
    const silencePeriods: SilencePeriod[] = [{ start: 2000, end: 2200 }, { start: 4100, end: 4300 }]
    const scoped = scopeAcousticToSpeaker(pitchSamples, silencePeriods, turns, 'A')
    expect(scoped.pitchSamples).toHaveLength(2)
    expect(scoped.pitchSamples.map(s => s.t)).toEqual([1000, 6000])
    expect(scoped.silencePeriods).toHaveLength(1)
    expect(scoped.silencePeriods[0].start).toBe(2000)
  })

  it('builds a full RoleplayResult from utterances plus acoustic samples', () => {
    const pitchSamples: PitchSample[] = Array.from({ length: 10 }, (_, i) => ({ f0: 130, vol: 30, t: i * 300 }))
    const result = buildRoleplayResult(utterances, 'A', pitchSamples, [])
    expect(result.talkRatio.repRatio).toBeGreaterThan(0.5)
    expect(result.rapidTurnSwitches).toBe(3)
    expect(result.questionRatio).toBe(0)
    expect(result.durationSec).toBeCloseTo(14, 0)
    expect(result.openQuestionRatio).toBe(0) // rep (A) asked no questions in this fixture
    expect(result.paraphraseScore).toBeGreaterThanOrEqual(0)
    expect(result.paraphraseScore).toBeLessThanOrEqual(1)
    expect(['developing', 'solid', 'excellent']).toContain(result.activeListening.label)
  })

  it('splits rep questions into open vs. closed', () => {
    const turns = buildTurns(utterances)
    // rep (A) turns: none are questions
    expect(classifyQuestions(turns, 'A')).toEqual({ total: 0, open: 0, closed: 0, openRatio: 0 })
    // partner (B): "Sure, what have you got?" -> contains "what" -> open
    //              "Does it interact with anticoagulants?" -> contains "does", no open marker -> closed
    const b = classifyQuestions(turns, 'B')
    expect(b.total).toBe(2)
    expect(b.open).toBe(1)
    expect(b.closed).toBe(1)
    expect(b.openRatio).toBeCloseTo(0.5, 5)
  })

  it('detects Arabic open-question markers correctly', () => {
    const arabicUtterances: Utterance[] = [
      { speaker: 'rep', text: 'ماذا تحتاج من هذا الدواء؟', start: 0, end: 2000 },   // "What do you need from this medicine?" - open
      { speaker: 'rep', text: 'هل هذا يناسبك؟', start: 2100, end: 4000 },           // "Does this suit you?" - closed
    ]
    const turns = buildTurns(arabicUtterances)
    const result = classifyQuestions(turns, 'rep')
    expect(result.total).toBe(2)
    expect(result.open).toBe(1)    // ماذا question is open
    expect(result.closed).toBe(1)  // هل question is closed (no open marker)
    expect(result.openRatio).toBeCloseTo(0.5, 5)
  })
})

describe('paraphrase score', () => {
  it('scores how much of the partner\'s content words the rep echoes back in the next turn', () => {
    const utterances: Utterance[] = [
      { speaker: 'B', text: 'The main worry is dosing frequency and patient compliance.', start: 0, end: 3000 },
      { speaker: 'A', text: 'So dosing frequency and compliance are your main worry, got it.', start: 3100, end: 6000 },
      { speaker: 'B', text: 'Also cost is a factor for our patients.', start: 6100, end: 8000 },
      { speaker: 'A', text: 'Understood, thanks for sharing that.', start: 8100, end: 10000 },
    ]
    const turns = buildTurns(utterances)
    // pair 1: rep echoes 5 of partner's 6 content words -> 5/6
    // pair 2: rep echoes 0 of partner's 5 content words -> 0/5
    // average: (5/6 + 0) / 2
    expect(computeParaphraseScore(turns, 'A')).toBeCloseTo((5 / 6 + 0) / 2, 3)
  })

  it('returns 0 when no rep turn follows a partner turn', () => {
    const turns = buildTurns([{ speaker: 'A', text: 'hello there', start: 0, end: 500 }])
    expect(computeParaphraseScore(turns, 'A')).toBe(0)
  })
})

describe('active listening score', () => {
  it('scores a balanced, non-interrupting, paraphrasing rep as excellent', () => {
    const talkRatio = { repMs: 4000, partnerMs: 6000, totalMs: 10000, repRatio: 0.4 }
    const result = computeActiveListeningScore(talkRatio, 0, 0.8)
    expect(result.score).toBe(82)
    expect(result.label).toBe('excellent')
  })

  it('scores a dominating, interrupting, non-paraphrasing rep as developing', () => {
    const talkRatio = { repMs: 270000, partnerMs: 30000, totalMs: 300000, repRatio: 0.9 }
    const result = computeActiveListeningScore(talkRatio, 20, 0)
    expect(result.score).toBe(15)
    expect(result.label).toBe('developing')
  })
})
