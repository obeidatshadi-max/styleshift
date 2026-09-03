//
// Acoustic engine ported verbatim from ssm-app's Verbal Mirror
// (C:\Users\shadi\Desktop\AI APP 2026\pharma\ssm-app\dev\voice-logic.js,
// already shipped in ssm-app-v4.html). That file stays canonical for the
// scoring math; this is a point-in-time TypeScript port, not a live link.
// The turn-taking section below (from "Roleplay turn-taking analysis" on)
// is new — StyleShift-specific, not present in ssm-app.

export interface PitchSample { f0: number; vol: number; t: number }
export interface SilencePeriod { start: number; end: number }

export interface AcousticMetrics {
  avgPitch: number; minPitch: number; maxPitch: number; pitchRange: number
  wpm: number; totalHesitations: number; fillerMatches: number; silentHesitations: number
  avgSentLen: number; durationSec: number; wordCount: number; sentences: number
  pitchLabel: 'deep' | 'mid' | 'high'
  paceLabel: 'slow' | 'measured' | 'fast' | 'rapid'
  hesitationLabel: 'fluent' | 'mild' | 'moderate' | 'frequent'
  rangeLabel: 'flat' | 'moderate' | 'expressive'
  socialLabel: 'reserved' | 'balanced' | 'expressive'
}

export function processAcousticData({ pitchSamples, silencePeriods, transcript, durationSec }: {
  pitchSamples: PitchSample[]; silencePeriods: SilencePeriod[]; transcript: string; durationSec: number
}): AcousticMetrics | null {
  if (!pitchSamples || pitchSamples.length < 5) return null

  const pitches = pitchSamples.map(s => s.f0)
  const avgPitch = pitches.reduce((a, b) => a + b, 0) / pitches.length
  const minPitch = Math.min(...pitches)
  const maxPitch = Math.max(...pitches)
  const pitchRange = maxPitch - minPitch

  const words = (transcript || '').trim().split(/\s+/).filter(Boolean)
  const wordCount = words.length
  const wpm = durationSec > 0 ? Math.round((wordCount / durationSec) * 60) : 0

  const fillerPattern = /\b(um|uh|er|ah|hmm|like|you know|i mean|basically|sort of|kind of)\b/gi
  const fillerMatches = ((transcript || '').match(fillerPattern) || []).length
  const silentHesitations = (silencePeriods || []).filter(s => (s.end - s.start) > 500).length
  const totalHesitations = fillerMatches + silentHesitations

  const sentences = (transcript || '').split(/[.!?]+/).filter(s => s.trim().length > 3)
  const avgSentLen = sentences.length > 0
    ? sentences.reduce((a, s) => a + s.trim().split(/\s+/).length, 0) / sentences.length
    : wordCount

  return {
    avgPitch: Math.round(avgPitch), minPitch: Math.round(minPitch), maxPitch: Math.round(maxPitch),
    pitchRange: Math.round(pitchRange), wpm, totalHesitations, fillerMatches, silentHesitations,
    avgSentLen: Math.round(avgSentLen), durationSec: Math.round(durationSec), wordCount, sentences: sentences.length,
    pitchLabel: avgPitch < 140 ? 'deep' : avgPitch < 200 ? 'mid' : 'high',
    paceLabel: wpm < 120 ? 'slow' : wpm < 170 ? 'measured' : wpm < 210 ? 'fast' : 'rapid',
    hesitationLabel: totalHesitations === 0 ? 'fluent' : totalHesitations < 3 ? 'mild' : totalHesitations < 7 ? 'moderate' : 'frequent',
    rangeLabel: pitchRange < 60 ? 'flat' : pitchRange < 120 ? 'moderate' : 'expressive',
    socialLabel: avgSentLen < 6 ? 'reserved' : avgSentLen < 12 ? 'balanced' : 'expressive',
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(100, v))
function band(v: number, lo: number, hi: number): number {
  if (hi === lo) return 50
  return clamp01(((v - lo) / (hi - lo)) * 100)
}

export type SocialStyleKey = 'driver' | 'expressive' | 'amiable' | 'analytical'

export interface SocialStyleRead {
  style: SocialStyleKey; confidence: number; assertiveness: number; responsiveness: number
  proof: { paceLabel: string; rangeLabel: string; hesitationLabel: string; wpm: number; pitchRange: number; totalHesitations: number }
}

export function classifySocialStyle(metrics: AcousticMetrics, warmthDensity = 0): SocialStyleRead {
  const paceN = band(metrics.wpm, 110, 210)
  const hesPerMin = metrics.durationSec > 0 ? (metrics.totalHesitations / metrics.durationSec) * 60 : 0
  const fluencyN = 100 - band(hesPerMin, 0, 12)
  const assertiveness = Math.round(clamp01(paceN * 0.6 + fluencyN * 0.4))

  const rangeN = band(metrics.pitchRange, 30, 160)
  const warmthN = clamp01(warmthDensity * 100)
  const responsiveness = Math.round(clamp01(rangeN * 0.65 + warmthN * 0.35))

  const tell = assertiveness >= 50
  const emote = responsiveness >= 50
  let style: SocialStyleKey
  if (tell && !emote) style = 'driver'
  else if (tell && emote) style = 'expressive'
  else if (!tell && emote) style = 'amiable'
  else style = 'analytical'

  const dx = Math.abs(assertiveness - 50)
  const dy = Math.abs(responsiveness - 50)
  const dist = Math.sqrt(dx * dx + dy * dy)
  const confidence = Math.round(Math.max(50, Math.min(95, 50 + (dist / 70.7) * 45)))

  return {
    style, confidence, assertiveness, responsiveness,
    proof: { paceLabel: metrics.paceLabel, rangeLabel: metrics.rangeLabel, hesitationLabel: metrics.hesitationLabel, wpm: metrics.wpm, pitchRange: metrics.pitchRange, totalHesitations: metrics.totalHesitations },
  }
}

const VAK = {
  visual:      /\b(see|look|picture|clear|show|view|imagine|focus|bright|appears?)\b|أشوف|واضح|يبيّن|أتخيل|منظر|يطلّ/gi,
  auditory:    /\b(hear|sound|tell|discuss|listen|talk|ring|loud|quiet|say)\b|أسمع|يحكي|نتفاهم|نحكي|صوت|يقول/gi,
  kinesthetic: /\b(feel|grasp|handle|solid|comfortable|touch|warm|pressure|smooth|heavy)\b|أحس|نمسك|مريح|ثقيل|ناعم|ضغط/gi,
}

export interface PredicateCounts { visual: number; auditory: number; kinesthetic: number; dominant: 'visual' | 'auditory' | 'kinesthetic' | null }

export function detectPredicates(transcript: string): PredicateCounts {
  const t = transcript || ''
  const counts = {
    visual: (t.match(VAK.visual) || []).length,
    auditory: (t.match(VAK.auditory) || []).length,
    kinesthetic: (t.match(VAK.kinesthetic) || []).length,
  }
  let dominant: PredicateCounts['dominant'] = null, max = 0
  for (const k of ['visual', 'auditory', 'kinesthetic'] as const) {
    if (counts[k] > max) { max = counts[k]; dominant = k }
  }
  if (max === 0) dominant = null
  return { ...counts, dominant }
}

const WARMTH = /\b(thanks?|thank you|appreciate|please|happy|glad|sorry|hope|care|support|together|friend|welcome|kind)\b|شكرا|أهلا|حبيبي|تسلم|نورت|عزيزي|سعيد|من فضلك/gi

export function warmthDensity(transcript: string): number {
  const t = (transcript || '').trim()
  if (!t) return 0
  const words = t.split(/\s+/).filter(Boolean).length || 1
  const hits = (t.match(WARMTH) || []).length
  return Math.min(1, hits / words * 6)
}

export function analyzeDelivery({ transcript }: { transcript: string }) {
  return { predicates: detectPredicates(transcript), warmth: warmthDensity(transcript) }
}

// ── Roleplay turn-taking analysis (new, StyleShift-specific) ──

export interface Utterance { speaker: string; text: string; start: number; end: number }
export interface Turn extends Utterance { durationMs: number }

export function buildTurns(utterances: Utterance[]): Turn[] {
  return utterances.map(u => ({ ...u, durationMs: u.end - u.start }))
}

export interface TalkRatio { repMs: number; partnerMs: number; totalMs: number; repRatio: number }

export function computeTalkRatio(turns: Turn[], repSpeaker: string): TalkRatio {
  let repMs = 0, partnerMs = 0
  for (const t of turns) {
    if (t.speaker === repSpeaker) repMs += t.durationMs
    else partnerMs += t.durationMs
  }
  const totalMs = repMs + partnerMs
  return { repMs, partnerMs, totalMs, repRatio: totalMs > 0 ? repMs / totalMs : 0 }
}

/**
 * Counts rapid speaker switches (gap between the previous turn's end and the
 * next turn's start below `thresholdMs`, including negative gaps where the
 * diarization model reports overlap) as a proxy for interruptions. Diarizing
 * a single mono recording can't reliably detect true simultaneous speech —
 * this counts fast back-and-forth / cut-offs, not confirmed audio overlap.
 */
export function computeRapidTurnSwitches(turns: Turn[], thresholdMs = 400): number {
  let count = 0
  for (let i = 1; i < turns.length; i++) {
    if (turns[i].speaker === turns[i - 1].speaker) continue
    const gap = turns[i].start - turns[i - 1].end
    if (gap < thresholdMs) count++
  }
  return count
}

const QUESTION_STARTERS_AR = /^(هل|ماذا|كيف|متى|لماذا|أين|من|كم)\b/

export function computeQuestionRatio(turns: Turn[], repSpeaker: string): number {
  const repTurns = turns.filter(t => t.speaker === repSpeaker)
  if (!repTurns.length) return 0
  const isQuestion = (text: string) => {
    const trimmed = text.trim()
    return trimmed.endsWith('?') || trimmed.endsWith('؟') || QUESTION_STARTERS_AR.test(trimmed)
  }
  const questions = repTurns.filter(t => isQuestion(t.text)).length
  return questions / repTurns.length
}

// "Contains" rather than "starts with" — a wh-word or yes/no marker rarely
// opens the sentence exactly ("Sure, what have you got?"), so anchoring to
// the start would miss it.
const OPEN_MARKERS_EN = /\b(what|how|why|when|where|which|tell me|walk me through|describe|explain)\b/i
const OPEN_MARKERS_AR = /(?<![\p{L}\p{N}])(ماذا|كيف|متى|لماذا|أين|من|كم)(?![\p{L}\p{N}])/u

export interface QuestionBreakdown { total: number; open: number; closed: number; openRatio: number }

/**
 * Splits a speaker's questions into open-ended (wh-word / "tell me" / "walk
 * me through" style — invites the other person to elaborate) vs. closed
 * (yes/no-shaped, or a question with no open marker). A question with no
 * detected open marker defaults to closed rather than "undetermined" — most
 * unmarked questions ("This works for you?") are yes/no-shaped in practice.
 */
export function classifyQuestions(turns: Turn[], repSpeaker: string): QuestionBreakdown {
  const repTurns = turns.filter(t => t.speaker === repSpeaker)
  const isQuestion = (text: string) => {
    const trimmed = text.trim()
    return trimmed.endsWith('?') || trimmed.endsWith('؟') || QUESTION_STARTERS_AR.test(trimmed)
  }
  const questions = repTurns.map(t => t.text).filter(isQuestion)
  const open = questions.filter(q => OPEN_MARKERS_EN.test(q) || OPEN_MARKERS_AR.test(q)).length
  const total = questions.length
  return { total, open, closed: total - open, openRatio: total > 0 ? open / total : 0 }
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'to', 'of', 'in', 'on', 'for', 'and', 'or', 'but', 'not', 'this', 'that', 'with', 'as', 'at',
  'be', 'do', 'does', 'did', 'have', 'has',
  'من', 'في', 'على', 'إلى', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'و', 'أو', 'لا', 'نعم', 'كان', 'كانت',
])

/** Lowercased, punctuation-stripped content words (length > 2, stopwords removed). */
function contentWords(text: string): Set<string> {
  const words = (text || '').toLowerCase().replace(/[.,!?؟،;:"'()]/g, '').split(/\s+/).filter(Boolean)
  return new Set(words.filter(w => w.length > 2 && !STOPWORDS.has(w)))
}

/**
 * For each rep turn that immediately follows a partner turn, scores what
 * fraction of the partner's content words the rep's reply echoes back — a
 * proxy for paraphrasing/rephrasing what was just said. Reads partner-turn
 * TEXT transiently (same in-memory Utterance[] the pipeline already
 * discards after scoring) — only the resulting number is ever persisted.
 * Returns the average across all measured rep-follows-partner pairs, or 0
 * if there are none.
 */
export function computeParaphraseScore(turns: Turn[], repSpeaker: string): number {
  let scored = 0, pairs = 0
  for (let i = 1; i < turns.length; i++) {
    if (turns[i].speaker !== repSpeaker || turns[i - 1].speaker === repSpeaker) continue
    const partnerWords = contentWords(turns[i - 1].text)
    if (partnerWords.size === 0) continue
    const repWords = contentWords(turns[i].text)
    let hits = 0
    for (const w of partnerWords) if (repWords.has(w)) hits++
    scored += hits / partnerWords.size
    pairs++
  }
  return pairs > 0 ? scored / pairs : 0
}

export function repTranscript(turns: Turn[], repSpeaker: string): string {
  return turns.filter(t => t.speaker === repSpeaker).map(t => t.text).join(' ')
}

/** Scopes captured pitch samples / silence periods down to the time windows a given speaker held the floor. */
export function scopeAcousticToSpeaker(
  pitchSamples: PitchSample[], silencePeriods: SilencePeriod[], turns: Turn[], speaker: string
): { pitchSamples: PitchSample[]; silencePeriods: SilencePeriod[] } {
  const speakerTurns = turns.filter(t => t.speaker === speaker)
  const inSpeakerTurn = (t: number) => speakerTurns.some(turn => t >= turn.start && t <= turn.end)
  return {
    pitchSamples: pitchSamples.filter(s => inSpeakerTurn(s.t)),
    silencePeriods: silencePeriods.filter(s => inSpeakerTurn(s.start)),
  }
}

export interface RoleplayResult {
  talkRatio: TalkRatio
  rapidTurnSwitches: number
  questionRatio: number
  repRead: SocialStyleRead | null
  durationSec: number
}

/** Builds the complete, storable roleplay result from diarized utterances plus the rep's captured acoustic samples for the whole recording (they get scoped to the rep's turns internally). */
export function buildRoleplayResult(
  utterances: Utterance[], repSpeaker: string,
  pitchSamples: PitchSample[], silencePeriods: SilencePeriod[]
): RoleplayResult {
  const turns = buildTurns(utterances)
  const talkRatio = computeTalkRatio(turns, repSpeaker)
  const rapidTurnSwitches = computeRapidTurnSwitches(turns)
  const questionRatio = computeQuestionRatio(turns, repSpeaker)
  const transcript = repTranscript(turns, repSpeaker)
  const { pitchSamples: repPitch, silencePeriods: repSilence } = scopeAcousticToSpeaker(pitchSamples, silencePeriods, turns, repSpeaker)
  const repDurationSec = talkRatio.repMs / 1000
  const metrics = processAcousticData({ pitchSamples: repPitch, silencePeriods: repSilence, transcript, durationSec: repDurationSec })
  const delivery = analyzeDelivery({ transcript })
  const repRead = metrics ? classifySocialStyle(metrics, delivery.warmth) : null
  return { talkRatio, rapidTurnSwitches, questionRatio, repRead, durationSec: talkRatio.totalMs / 1000 }
}
