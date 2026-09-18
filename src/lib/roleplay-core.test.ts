import { describe, it, expect } from 'vitest'
import {
  processAcousticData, classifySocialStyle, buildTurns, computeTalkRatio,
  computeRapidTurnSwitches, computeQuestionRatio, classifyQuestions, computeParaphraseScore,
  computeActiveListeningScore, repTranscript,
  scopeAcousticToSpeaker, buildRoleplayResult, computeAdaptationScore, computeTermOverlap,
  isLowSampleSession, MIN_RELIABLE_TURNS,
  type Utterance, type PitchSample, type SilencePeriod, type SocialStyleRead,
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
    expect(result.turnCount).toBeGreaterThan(0)
    expect(result.questionRatio).toBe(0)
    expect(result.durationSec).toBeCloseTo(14, 0)
    expect(result.openQuestionRatio).toBe(0) // rep (A) asked no questions in this fixture
    expect(result.paraphraseScore).toBeGreaterThanOrEqual(0)
    expect(result.paraphraseScore).toBeLessThanOrEqual(1)
    expect(['developing', 'solid', 'excellent']).toContain(result.activeListening.label)
    expect(result.warmth).toBeGreaterThanOrEqual(0)
    expect(result.warmth).toBeLessThanOrEqual(1)
    expect(['visual', 'auditory', 'kinesthetic', null]).toContain(result.predicates.dominant)
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

  it('does not misclassify a closed Arabic question containing "من" as a preposition, but still detects it as the interrogative "who"', () => {
    const utterances: Utterance[] = [
      { speaker: 'A', text: 'هل يمكنني الحصول على عينة من هذا الدواء؟', start: 0, end: 3000 },
      { speaker: 'A', text: 'من سيقرر هذا؟', start: 3100, end: 5000 },
    ]
    const turns = buildTurns(utterances)
    const result = classifyQuestions(turns, 'A')
    expect(result.total).toBe(2)
    expect(result.open).toBe(1)
    expect(result.closed).toBe(1)
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

describe('adaptation score', () => {
  const makeRead = (assertiveness: number, responsiveness: number): SocialStyleRead => ({
    style: 'driver', confidence: 80, assertiveness, responsiveness,
    proof: { paceLabel: 'fast', rangeLabel: 'flat', hesitationLabel: 'fluent', wpm: 180, pitchRange: 40, totalHesitations: 0 },
  })

  it('scores identical rep/partner styles as fully mirrored', () => {
    const read = makeRead(70, 30)
    const result = computeAdaptationScore(read, read)
    expect(result).not.toBeNull()
    expect(result!.score).toBe(100)
    expect(result!.label).toBe('mirrored')
  })

  it('scores opposite-corner styles as mismatched', () => {
    const result = computeAdaptationScore(makeRead(100, 0), makeRead(0, 100))
    expect(result!.score).toBe(0)
    expect(result!.label).toBe('mismatched')
  })

  it('returns null when either read is unavailable', () => {
    expect(computeAdaptationScore(null, makeRead(50, 50))).toBeNull()
    expect(computeAdaptationScore(makeRead(50, 50), null)).toBeNull()
    expect(computeAdaptationScore(null, null)).toBeNull()
  })
})

describe('buildRoleplayResult partner analysis', () => {
  it('computes a partner style read and adaptation score when the partner speaks enough for a reliable read', () => {
    const utterances: Utterance[] = [
      { speaker: 'A', text: 'Good morning, thanks for seeing me today, I appreciate your time.', start: 0, end: 4000 },
      { speaker: 'B', text: 'Sure, glad to help, what do you have for me today then.', start: 4200, end: 8000 },
      { speaker: 'A', text: 'This new formulation reduces dosing frequency for your patients.', start: 8100, end: 12000 },
      { speaker: 'B', text: 'Interesting, does it interact with anything we should worry about.', start: 12100, end: 16000 },
    ]
    // Every 500ms from 0-16000 lands plenty of samples in both A's and B's
    // turn windows (each ~8s total) — well over the 5-sample minimum.
    const pitchSamples: PitchSample[] = Array.from({ length: 33 }, (_, i) => ({ f0: 130 + (i % 3) * 10, vol: 30, t: i * 500 }))
    const result = buildRoleplayResult(utterances, 'A', pitchSamples, [])
    expect(result.partnerRead).not.toBeNull()
    expect(result.adaptationScore).not.toBeNull()
    expect(result.adaptationScore!.score).toBeGreaterThanOrEqual(0)
    expect(result.adaptationScore!.score).toBeLessThanOrEqual(100)
  })

  it('returns null partnerRead/adaptationScore when the partner barely speaks', () => {
    const utterances: Utterance[] = [
      { speaker: 'A', text: 'Good morning, thanks for seeing me today, I appreciate your time very much indeed.', start: 0, end: 8000 },
      { speaker: 'B', text: 'Sure.', start: 8100, end: 8600 },
    ]
    // All samples land inside A's window; none inside B's tiny 500ms window.
    const pitchSamples: PitchSample[] = Array.from({ length: 10 }, (_, i) => ({ f0: 130, vol: 30, t: i * 800 }))
    const result = buildRoleplayResult(utterances, 'A', pitchSamples, [])
    expect(result.partnerRead).toBeNull()
    expect(result.adaptationScore).toBeNull()
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

describe('isLowSampleSession', () => {
  // No coded minimum existed for the ratio-based metrics (talk ratio,
  // question ratio, term overlap, active listening) before this — only
  // the acoustic pitch-sample gate (processAcousticData, line 26) had one.
  // 10 total turns ~= 5 real exchanges each way, the practical floor below
  // which these percentages are dominated by noise, not signal.
  it('flags a session below the reliable-turn floor', () => {
    expect(isLowSampleSession(MIN_RELIABLE_TURNS - 1)).toBe(true)
  })

  it('does not flag a session at or above the floor', () => {
    expect(isLowSampleSession(MIN_RELIABLE_TURNS)).toBe(false)
    expect(isLowSampleSession(MIN_RELIABLE_TURNS + 5)).toBe(false)
  })
})

describe('computeTermOverlap', () => {
  const turn = (text: string, speaker: string) => ({ text, speaker, start: 0, end: 1000, durationMs: 1000 })

  it('is 100% when both speakers use exactly the same content words', () => {
    const turns = [turn('the pricing model works well', 'rep'), turn('pricing model works well', 'partner')]
    expect(computeTermOverlap(turns, 'rep')).toBe(1)
  })

  it('is 0% when the two speakers share no content words', () => {
    const turns = [turn('completely different topics here', 'rep'), turn('another unrelated subject entirely', 'partner')]
    expect(computeTermOverlap(turns, 'rep')).toBe(0)
  })

  it('is a partial ratio for partial overlap, ignoring stopwords and short words', () => {
    // rep content words: {pricing, model, great}; partner: {concerned, pricing, model}
    // union = {pricing, model, great, concerned} (4), intersection = {pricing, model} (2) -> 0.5
    const turns = [turn('the pricing model is great', 'rep'), turn('I am concerned but the pricing model', 'partner')]
    expect(computeTermOverlap(turns, 'rep')).toBeCloseTo(0.5, 5)
  })

  it('returns 0 rather than dividing by zero when one side has no content words at all', () => {
    const turns = [turn('a', 'rep'), turn('pricing model', 'partner')]
    expect(computeTermOverlap(turns, 'rep')).toBe(0)
  })
})

describe('spoken question detection regressions', () => {
  const turn = (text: string, speaker = 'rep') => ({ text, speaker, start: 0, end: 1000, durationMs: 1000 })
  it.each(['كيف تتعامل مع هذه الحالات', 'دكتور شو اهم تحدي عندك', 'طيب، ليش بتفضل هذا الخيار', 'وَكَيْفَ تتعامل مع المرضى', 'احكيلي عن تجربتك', 'Doctor what concerns you most'])('recognizes unpunctuated open questions: %s', text => {
    expect(classifyQuestions([turn(text)], 'rep')).toEqual({ total: 1, open: 1, closed: 0, openRatio: 1 })
    expect(computeQuestionRatio([turn(text)], 'rep')).toBe(1)
  })
  it.each(['هل هذا يناسبك', 'ممكن نحدد موعد', 'Can you explain your concern', 'هل يمكنني الحصول على عينة من هذا الدواء؟'])('recognizes closed questions: %s', text => {
    expect(classifyQuestions([turn(text)], 'rep').closed).toBe(1)
  })
  it.each(['من المهم الالتزام بالعلاج', 'كمية الدواء مناسبة', 'هذا يوضح كيف يعمل العلاج', 'I know what you mean'])('does not score statements as questions: %s', text => {
    expect(computeQuestionRatio([turn(text)], 'rep')).toBe(0)
  })
  it('counts a question followed by a statement and excludes doctor questions', () => {
    const turns = [turn('هل يناسبك؟ شكرا.'), turn('هذا واضح'), turn('شو السبب', 'doctor')]
    expect(computeQuestionRatio(turns, 'rep')).toBe(0.5)
    expect(classifyQuestions(turns, 'rep').total).toBe(1)
  })
})
