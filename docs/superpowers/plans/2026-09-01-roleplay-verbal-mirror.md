# Roleplay Verbal Mirror Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a rep record a live, in-person roleplay with a colleague (practicing a doctor visit), and get back objective delivery feedback — talk-time ratio, rapid-turn-switch ("interruption") count, question-asking ratio, and the rep's own pace/pitch/filler-word/social-style read — without ever storing the practice partner's spoken content or the raw audio.

**Architecture:** One phone records the whole roleplay on a single mic. After the rep stops recording, the audio is uploaded to AssemblyAI (via a Netlify function that hides the API key) for speaker diarization — "who spoke when," not full transcription content-wise beyond what's needed to compute the rep's own delivery metrics. The rep then taps to identify which diarized speaker is them. A new pure-logic module (`roleplay-core.ts`) ports StyleShift's sister app's already-shipped acoustic engine (Verbal Mirror, from `ssm-app`'s `dev/voice-logic.js`) verbatim, and adds new turn-taking analysis (talk ratio, rapid switches, question ratio) on top of the diarized utterances. Only the derived numeric result is persisted to Supabase — never the audio blob, never the full transcript, never the partner's words.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (Postgres + RLS), Vitest, Web Audio API (`AudioContext`/`AnalyserNode` for client-side pitch/silence capture), `MediaRecorder` (audio capture), AssemblyAI REST API (speaker diarization), Netlify Functions (server-side proxy hiding the API key).

**Spec:** No standalone spec doc — this plan implements the roleplay-recording direction agreed in conversation on 2026-09-01: record a real two-person practice roleplay (not a solo rehearsal, not a real doctor visit) and analyze the verbal interaction (interruptions, tonality, talk balance). The acoustic engine is ported from `C:\Users\shadi\Desktop\AI APP 2026\pharma\ssm-app\dev\voice-logic.js` (Node-tested pure logic, already inline-ported and shipped in `ssm-app-v4.html`'s "Verbal Mirror" feature) — that file stays the canonical source for the acoustic scoring math; this plan's port is a point-in-time copy, not a live link. Diarization API shape verified against AssemblyAI's live docs (2026-09-01): `POST /v2/upload` → `upload_url`; `POST /v2/transcript` with `speaker_labels: true` + `audio_url` → job `id`; `GET /v2/transcript/{id}` polled until `status: "completed"` → `utterances: [{ speaker, text, start, end, words }]` (start/end in milliseconds); auth header is `authorization: <key>` (no `Bearer` prefix, no `Bearer` anywhere).

## Global Constraints

- **Training only, never a real HCP visit.** This records a roleplay between a rep and a consenting colleague/friend practicing together — never an actual doctor. No feature in this plan may be pointed at a real patient-facing visit.
- **Explicit consent screen before any recording starts**, worded for both people in the room (rep + practice partner), disclosing: (a) audio is uploaded to a third-party cloud service (AssemblyAI) to tell the two voices apart, (b) the raw audio and full transcript are discarded after processing — never stored, (c) only anonymous numeric delivery metrics for the rep are saved. No recording begins until the rep taps through this screen.
- **Never persist the practice partner's spoken words.** Only turn *timing* (who held the floor, when) is used to compute talk ratio / rapid-switch count; the partner's utterance *text* is used solely in-memory, transiently, to let the rep identify "which speaker is me" right after recording, then discarded.
- **Never persist the raw audio blob or the full AssemblyAI transcript.** Only the derived `RoleplayResult` (numbers + style label) is written to `roleplay_sessions`.
- **`ASSEMBLYAI_API_KEY` lives only in the Netlify function's environment**, never reaches the browser — same pattern as the existing `MUNSIT_API_KEY` / `netlify/functions/munsit-proxy.js`.
- **"Interruption" is honestly scoped as "rapid turn switch," not confirmed audio overlap.** Diarizing a single mono recording can't reliably detect two people talking simultaneously — the model assigns each moment to one speaker. `computeRapidTurnSwitches` counts fast back-and-forth (short or negative gaps between turns) as a proxy, and all UI copy referring to it must say "rapid back-and-forth," never claim to detect actual interruptions/overlapping speech.
- Bilingual EN/AR throughout, following the existing flat-key `t()` dictionary pattern in `src/lib/i18n.tsx`.
- Follow existing inline-style convention (CSS custom properties like `var(--cyan)`, `var(--panel)`, `var(--line)`, `var(--mono)`, `var(--sans)`) — no Tailwind, no new CSS files.
- Follow the codebase's existing `X-core.ts` (pure logic, Vitest-tested) + thin client component pattern already used for `sps-core.ts`/`SpsAssessment.tsx` and `leagues-core.ts`.
- RLS pattern for `roleplay_sessions` mirrors the existing `sessions` table exactly: own-rep insert/select + manager-of-company select (see `001_initial_schema.sql` lines 51-72).

---

## Task 1: Roleplay core — acoustic engine port + turn-taking analysis

**Files:**
- Create: `src/lib/roleplay-core.ts`
- Test: `src/lib/roleplay-core.test.ts`

**Interfaces:**
- Produces: `PitchSample`, `SilencePeriod`, `AcousticMetrics`, `processAcousticData`, `SocialStyleKey`, `SocialStyleRead`, `classifySocialStyle`, `PredicateCounts`, `detectPredicates`, `warmthDensity`, `analyzeDelivery`, `Utterance`, `Turn`, `buildTurns`, `TalkRatio`, `computeTalkRatio`, `computeRapidTurnSwitches`, `computeQuestionRatio`, `repTranscript`, `scopeAcousticToSpeaker`, `RoleplayResult`, `buildRoleplayResult` — every later task imports these exact names from `@/lib/roleplay-core`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/roleplay-core.test.ts
import { describe, it, expect } from 'vitest'
import {
  processAcousticData, classifySocialStyle, buildTurns, computeTalkRatio,
  computeRapidTurnSwitches, computeQuestionRatio, repTranscript,
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
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run roleplay-core`
Expected: FAIL — `Cannot find module './roleplay-core'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/roleplay-core.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run roleplay-core`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/roleplay-core.ts src/lib/roleplay-core.test.ts
git commit -m "feat: add roleplay-core, ported acoustic engine + turn-taking analysis"
```

---

## Task 2: AssemblyAI Netlify proxy (hides the API key)

**Files:**
- Create: `netlify/functions/assemblyai-proxy.js`

**Interfaces:**
- Produces: a single POST endpoint at `/.netlify/functions/assemblyai-proxy` accepting `{ action: 'upload', audio: base64 }`, `{ action: 'submit', audio_url: string }`, or `{ action: 'poll', transcript_id: string }` — Task 3 (`assemblyai-client.ts`) is the only consumer, and depends on these exact `action` values and body shapes.

- [ ] **Step 1: Write the function**

```javascript
// netlify/functions/assemblyai-proxy.js
// ═══════════════════════════════════════════════════════════
//  Sits between the app and the AssemblyAI speaker-diarization API.
//  Your ASSEMBLYAI_API_KEY never reaches the browser.
//
//  Set in Netlify → Site settings → Environment variables:
//    ASSEMBLYAI_API_KEY = <your key from assemblyai.com/app/account>
//
//  Browser sends JSON with an `action`:
//    { action: 'upload', audio: '<base64>' }
//      -> { upload_url: string }
//    { action: 'submit', audio_url: string }
//      -> { id: string, status: 'queued' }
//    { action: 'poll', transcript_id: string }
//      -> { status: 'queued'|'processing'|'completed'|'error',
//           utterances?: [{ speaker, text, start, end, words }], error?: string }
// ═══════════════════════════════════════════════════════════

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' }
  }

  const apiKey = process.env.ASSEMBLYAI_API_KEY
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'ASSEMBLYAI_API_KEY not set in Netlify environment variables.' }),
    }
  }

  try {
    const body = JSON.parse(event.body || '{}')

    if (body.action === 'upload') {
      if (!body.audio) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No audio provided.' }) }
      const buffer = Buffer.from(body.audio, 'base64')
      const response = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: { authorization: apiKey },
        body: buffer,
      })
      const data = await response.json()
      return { statusCode: response.status, headers, body: JSON.stringify(data) }
    }

    if (body.action === 'submit') {
      if (!body.audio_url) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No audio_url provided.' }) }
      const response = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { authorization: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_url: body.audio_url, speaker_labels: true }),
      })
      const data = await response.json()
      return { statusCode: response.status, headers, body: JSON.stringify(data) }
    }

    if (body.action === 'poll') {
      if (!body.transcript_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No transcript_id provided.' }) }
      const response = await fetch(`https://api.assemblyai.com/v2/transcript/${body.transcript_id}`, {
        headers: { authorization: apiKey },
      })
      const data = await response.json()
      return { statusCode: response.status, headers, body: JSON.stringify(data) }
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown action: ${body.action}` }) }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add netlify/functions/assemblyai-proxy.js
git commit -m "feat: add AssemblyAI diarization proxy Netlify function"
```

(No automated test — this codebase's existing serverless proxy, `netlify/functions/munsit-proxy.js` in the sister `ssm-app`, has no test file either. Manual verification happens in Task 9 once `ASSEMBLYAI_API_KEY` is set in Netlify.)

---

## Task 3: AssemblyAI browser client

**Files:**
- Create: `src/lib/assemblyai-client.ts`

**Interfaces:**
- Consumes: the proxy from Task 2.
- Produces: `DiarizedWord`, `DiarizedUtterance`, `diarizeAudio(blob: Blob): Promise<DiarizedUtterance[]>` — Task 6 (`useRoleplayRecorder.ts`) is the only consumer.

- [ ] **Step 1: Write the client**

```typescript
// src/lib/assemblyai-client.ts
const PROXY_URL = '/.netlify/functions/assemblyai-proxy'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export interface DiarizedWord { text: string; speaker: string; start: number; end: number }
export interface DiarizedUtterance { speaker: string; text: string; start: number; end: number; words: DiarizedWord[] }

interface TranscriptStatus {
  status: 'queued' | 'processing' | 'completed' | 'error'
  utterances?: DiarizedUtterance[]
  error?: string
}

async function uploadAudio(blob: Blob): Promise<string> {
  const audio = await blobToBase64(blob)
  const res = await fetch(PROXY_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'upload', audio }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Upload failed')
  return data.upload_url as string
}

async function submitDiarization(audioUrl: string): Promise<string> {
  const res = await fetch(PROXY_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'submit', audio_url: audioUrl }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Submit failed')
  return data.id as string
}

async function pollTranscript(transcriptId: string): Promise<TranscriptStatus> {
  const res = await fetch(PROXY_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'poll', transcript_id: transcriptId }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Poll failed')
  return data as TranscriptStatus
}

/** Uploads, submits, and polls until diarization completes. Throws on error or a 90s timeout. */
export async function diarizeAudio(blob: Blob): Promise<DiarizedUtterance[]> {
  const uploadUrl = await uploadAudio(blob)
  const transcriptId = await submitDiarization(uploadUrl)
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    const result = await pollTranscript(transcriptId)
    if (result.status === 'completed') return result.utterances ?? []
    if (result.status === 'error') throw new Error(result.error || 'Diarization failed')
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  throw new Error('Diarization timed out — try a shorter recording.')
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/assemblyai-client.ts
git commit -m "feat: add AssemblyAI diarization browser client"
```

---

## Task 4: Database migration

**Files:**
- Create: `supabase/migrations/009_roleplay_sessions.sql`

**Interfaces:**
- Produces: `public.roleplay_sessions` table — Task 6 (`useRoleplayRecorder.ts`) inserts into it.

- [ ] **Step 1: Write the migration**

```sql
-- Roleplay verbal-mirror sessions: a rep and a practice colleague roleplay a
-- visit out loud, the audio is diarized (AssemblyAI, triggered client-side),
-- and only the derived metrics are persisted here — never the audio, never
-- the full transcript, never the practice partner's spoken words.
create table public.roleplay_sessions (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  duration_sec integer not null,
  talk_ratio numeric not null check (talk_ratio between 0 and 1),
  rapid_turn_switches integer not null default 0,
  question_ratio numeric not null check (question_ratio between 0 and 1),
  rep_style text check (rep_style = any (array['driver','expressive','amiable','analytical'])),
  rep_confidence integer,
  rep_metrics jsonb,
  created_at timestamptz not null default now()
);

alter table public.roleplay_sessions enable row level security;

create policy "own roleplay sessions read" on public.roleplay_sessions for select using (rep_id = auth.uid());
create policy "own roleplay sessions insert" on public.roleplay_sessions for insert with check (rep_id = auth.uid());

create policy "manager roleplay sessions read" on public.roleplay_sessions for select using (
  rep_id in (
    select id from public.profiles
    where company_id in (
      select company_id from public.profiles where id = auth.uid() and role = 'manager'
    )
  )
);
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool against project `cnlloaihrrmattuidpeh` (same approach used for `008_sps_profile.sql`), naming it `roleplay_sessions`.
Expected: succeeds; `select * from public.roleplay_sessions limit 1;` returns zero rows with no error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/009_roleplay_sessions.sql
git commit -m "feat: add roleplay_sessions table"
```

---

## Task 5: XP value + i18n copy

**Files:**
- Modify: `src/types/game.ts` (the `XpValues` interface)
- Modify: `src/lib/game-data.ts` (the `XP_VALUES` constant)
- Modify: `src/lib/i18n.tsx`

**Interfaces:**
- Produces: `XP_VALUES.roleplayComplete: number`, and `roleplay.*` dictionary keys — Task 6 uses the XP value, Task 7 (`RoleplayRecorder.tsx`) uses every `roleplay.*` key listed below.

- [ ] **Step 1: Add `roleplayComplete` to the `XpValues` interface**

```typescript
// src/types/game.ts — replace the existing XpValues interface
export interface XpValues {
  correct: number; fastBonus: number; levelComplete: number
  perfectLevel: number; dailyStreak: number; roleplayComplete: number
}
```

- [ ] **Step 2: Add the value to `XP_VALUES`**

```typescript
// src/lib/game-data.ts — replace the existing XP_VALUES constant
export const XP_VALUES: XpValues = {
  correct:         20,
  fastBonus:       10,
  levelComplete:   50,
  perfectLevel:    100,
  dailyStreak:     30,
  roleplayComplete: 40,
}
```

- [ ] **Step 3: Add `roleplay.*` keys to the `EN` dictionary** (insert after the `sps.*` block added by the SPS onboarding plan)

```typescript
  // roleplay verbal mirror
  'roleplay.eyebrow': 'Roleplay Practice',
  'roleplay.title': 'Record a Live Roleplay',
  'roleplay.intro': 'Practice a visit out loud with a colleague or friend playing the doctor. When you\'re done, you\'ll get objective feedback on your delivery — talk balance, pace, and how often you asked questions.',
  'roleplay.entryButton': 'Roleplay With a Colleague',
  'roleplay.consentTitle': 'Before You Record',
  'roleplay.consentBody': 'This records real audio of you and your practice partner. The recording is uploaded to a cloud service (AssemblyAI) just to tell your two voices apart — it is never saved. Only your own numeric delivery scores (talk time, pace, questions asked) are stored afterward. This is for training practice only, never a real doctor visit.',
  'roleplay.consentCheckbox': 'My practice partner knows this is being recorded for training and agrees.',
  'roleplay.consentAgree': 'I Understand — Start Recording',
  'roleplay.consentCancel': 'Not Now',
  'roleplay.recording': 'Recording…',
  'roleplay.stop': 'Stop & Analyze',
  'roleplay.processing': 'Separating speakers and scoring delivery…',
  'roleplay.pickSpeakerTitle': 'Which Voice Is You?',
  'roleplay.pickSpeakerHint': 'Tap the transcript snippet that\'s your voice.',
  'roleplay.speakerLabel': 'Speaker {letter}',
  'roleplay.resultEyebrow': 'Roleplay Complete',
  'roleplay.resultTitle': 'Your Delivery Report',
  'roleplay.talkRatio': 'Your Talk Time',
  'roleplay.rapidSwitches': 'Rapid Back-and-Forth',
  'roleplay.rapidSwitchesHint': 'Fast turn-switches with your partner — not confirmed interruptions, but a sign of a fast-paced exchange.',
  'roleplay.questionRatio': 'Questions You Asked',
  'roleplay.styleReadTitle': 'Your Delivery Style',
  'roleplay.noStyleRead': 'Not enough of your voice was captured to read a delivery style this time — try speaking a bit more next roleplay.',
  'roleplay.done': 'Done',
  'roleplay.errorMic': 'Microphone access is needed to record a roleplay. Check your browser permissions and try again.',
  'roleplay.errorDiarize': 'Something went wrong analyzing the recording. Your practice wasn\'t saved — try again.',
```

- [ ] **Step 4: Add the matching `AR` keys**

```typescript
  // roleplay verbal mirror
  'roleplay.eyebrow': 'تمرين تمثيل الأدوار',
  'roleplay.title': 'سجّل تمرين تمثيل أدوار حي',
  'roleplay.intro': 'تمرّن على زيارة بصوت عالٍ مع زميل أو صديق يمثّل دور الطبيب. عند الانتهاء، ستحصل على تقييم موضوعي لأدائك — توازن الحديث، السرعة، وعدد الأسئلة التي طرحتها.',
  'roleplay.entryButton': 'تمثيل أدوار مع زميل',
  'roleplay.consentTitle': 'قبل أن تبدأ التسجيل',
  'roleplay.consentBody': 'هذا التمرين يسجّل صوتاً حقيقياً لك ولشريكك في التمرين. يُرفع التسجيل إلى خدمة سحابية (AssemblyAI) فقط لتمييز صوتيكما — ولا يتم حفظه أبداً. تُحفظ فقط نتائجك الرقمية الخاصة (وقت الحديث، السرعة، عدد الأسئلة) بعد التحليل. هذا للتدريب فقط، وليس لزيارة طبيب حقيقية أبداً.',
  'roleplay.consentCheckbox': 'شريكي في التمرين يعلم أن هذا التسجيل للتدريب ويوافق عليه.',
  'roleplay.consentAgree': 'فهمت — ابدأ التسجيل',
  'roleplay.consentCancel': 'ليس الآن',
  'roleplay.recording': 'جارٍ التسجيل…',
  'roleplay.stop': 'إيقاف وتحليل',
  'roleplay.processing': 'جارٍ فصل الأصوات وتقييم الأداء…',
  'roleplay.pickSpeakerTitle': 'أي صوت هو صوتك؟',
  'roleplay.pickSpeakerHint': 'اضغط على المقطع الذي يمثّل صوتك.',
  'roleplay.speakerLabel': 'المتحدث {letter}',
  'roleplay.resultEyebrow': 'اكتمل تمرين تمثيل الأدوار',
  'roleplay.resultTitle': 'تقرير أدائك',
  'roleplay.talkRatio': 'نسبة وقت حديثك',
  'roleplay.rapidSwitches': 'التبادل السريع',
  'roleplay.rapidSwitchesHint': 'تبديلات سريعة في الحديث مع شريكك — ليست مقاطعات مؤكدة، لكنها إشارة إلى حوار سريع الوتيرة.',
  'roleplay.questionRatio': 'الأسئلة التي طرحتها',
  'roleplay.styleReadTitle': 'أسلوبك في الأداء',
  'roleplay.noStyleRead': 'لم يُلتقط صوتك بشكل كافٍ لقراءة أسلوب أدائك هذه المرة — حاول التحدث أكثر في التمرين القادم.',
  'roleplay.done': 'تم',
  'roleplay.errorMic': 'يلزم الوصول إلى الميكروفون لتسجيل تمرين تمثيل الأدوار. تحقق من أذونات المتصفح وحاول مجدداً.',
  'roleplay.errorDiarize': 'حدث خطأ أثناء تحليل التسجيل. لم يتم حفظ تمرينك — حاول مجدداً.',
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/types/game.ts src/lib/game-data.ts src/lib/i18n.tsx
git commit -m "feat: add roleplayComplete XP value and roleplay.* translation keys"
```

---

## Task 6: Roleplay recorder hook (audio capture + diarization orchestration + persistence)

**Files:**
- Create: `src/hooks/useRoleplayRecorder.ts`

**Interfaces:**
- Consumes: `diarizeAudio` (Task 3); `buildRoleplayResult`, `PitchSample`, `SilencePeriod`, `Utterance` (Task 1); `XP_VALUES` (Task 5).
- Produces: `RecorderPhase` (`'idle' | 'recording' | 'processing' | 'pick-speaker' | 'done' | 'error'`), `RawSpeakerPreview`, `useRoleplayRecorder(): { phase, error, elapsedSec, speakerPreviews, result, start, stop, pickSpeaker, reset }` — Task 7 (`RoleplayRecorder.tsx`) is the only consumer.

- [ ] **Step 1: Write the hook**

```typescript
// src/hooks/useRoleplayRecorder.ts
'use client'
import { useCallback, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { diarizeAudio, type DiarizedUtterance } from '@/lib/assemblyai-client'
import {
  buildRoleplayResult, type PitchSample, type SilencePeriod, type Utterance, type RoleplayResult,
} from '@/lib/roleplay-core'
import { XP_VALUES } from '@/lib/game-data'

export type RecorderPhase = 'idle' | 'recording' | 'processing' | 'pick-speaker' | 'done' | 'error'

export interface RawSpeakerPreview { speaker: string; sample: string }

// ── Pitch/silence capture, ported from Verbal Mirror (ssm-app's
// dev/voice-logic.js live-capture section, already shipped in
// ssm-app-v4.html) — same autocorrelation pitch detector, unchanged. ──
function autoCorrelate(bufIn: Float32Array, sampleRate: number): number {
  let buf = bufIn, SIZE = buf.length, rms = 0
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / SIZE)
  if (rms < 0.01) return -1
  let r1 = 0, r2 = SIZE - 1
  const thres = 0.2
  for (let i = 0; i < SIZE / 2; i++) { if (Math.abs(buf[i]) < thres) { r1 = i; break } }
  for (let i = 1; i < SIZE / 2; i++) { if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break } }
  buf = buf.slice(r1, r2); SIZE = buf.length
  const c = new Array(SIZE).fill(0)
  for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE - i; j++) c[i] += buf[j] * buf[j + i]
  let d = 0
  while (d < SIZE && c[d] > c[d + 1]) d++
  let maxval = -1, maxpos = -1
  for (let i = d; i < SIZE; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i }
  let T0 = maxpos
  const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1]
  const a = (x1 + x3 - 2 * x2) / 2, b = (x3 - x1) / 2
  if (a) T0 = T0 - b / (2 * a)
  return sampleRate / T0
}

export function useRoleplayRecorder(doctorId: string | null) {
  const supabase = createClient()
  const [phase, setPhase] = useState<RecorderPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [speakerPreviews, setSpeakerPreviews] = useState<RawSpeakerPreview[]>([])
  const [result, setResult] = useState<RoleplayResult | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const pitchSamplesRef = useRef<PitchSample[]>([])
  const silencePeriodsRef = useRef<SilencePeriod[]>([])
  const startTimeRef = useRef<number>(0)
  const lastSpeechTimeRef = useRef<number | null>(null)
  const silenceStartRef = useRef<number | null>(null)
  const pitchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const utterancesRef = useRef<DiarizedUtterance[]>([])

  const start = useCallback(async () => {
    setError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('mic')
      setPhase('error')
      return
    }
    streamRef.current = stream

    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.8
    source.connect(analyser)
    audioCtxRef.current = audioCtx
    analyserRef.current = analyser

    pitchSamplesRef.current = []
    silencePeriodsRef.current = []
    lastSpeechTimeRef.current = null
    silenceStartRef.current = null
    startTimeRef.current = Date.now()

    pitchIntervalRef.current = setInterval(() => {
      const buf = new Float32Array(analyser.fftSize)
      analyser.getFloatTimeDomainData(buf)
      const f0 = autoCorrelate(buf, audioCtx.sampleRate)
      const volBuf = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(volBuf)
      const vol = volBuf.reduce((a, b) => a + b, 0) / volBuf.length
      const now = Date.now() - startTimeRef.current
      if (f0 > 60 && f0 < 600 && vol > 20) {
        pitchSamplesRef.current.push({ f0, vol, t: now })
        if (silenceStartRef.current !== null) {
          silencePeriodsRef.current.push({ start: silenceStartRef.current, end: now })
          silenceStartRef.current = null
        }
        lastSpeechTimeRef.current = now
      } else if (vol < 15 && lastSpeechTimeRef.current !== null && silenceStartRef.current === null) {
        silenceStartRef.current = now
      }
    }, 100)

    elapsedIntervalRef.current = setInterval(() => {
      setElapsedSec(Math.round((Date.now() - startTimeRef.current) / 1000))
    }, 500)

    chunksRef.current = []
    const mediaRec = new MediaRecorder(stream)
    mediaRec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mediaRec.start()
    mediaRecRef.current = mediaRec

    setPhase('recording')
  }, [])

  const cleanupCapture = useCallback(() => {
    if (pitchIntervalRef.current) { clearInterval(pitchIntervalRef.current); pitchIntervalRef.current = null }
    if (elapsedIntervalRef.current) { clearInterval(elapsedIntervalRef.current); elapsedIntervalRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }
    analyserRef.current = null
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
  }, [])

  const stop = useCallback(async () => {
    const mediaRec = mediaRecRef.current
    if (!mediaRec) return
    if (silenceStartRef.current !== null && lastSpeechTimeRef.current !== null) {
      silencePeriodsRef.current.push({ start: silenceStartRef.current, end: Date.now() - startTimeRef.current })
    }
    cleanupCapture()
    setPhase('processing')

    const blob: Blob = await new Promise(resolve => {
      mediaRec.onstop = () => resolve(new Blob(chunksRef.current, { type: mediaRec.mimeType || 'audio/webm' }))
      mediaRec.stop()
    })

    try {
      const utterances = await diarizeAudio(blob)
      utterancesRef.current = utterances
      const speakers = Array.from(new Set(utterances.map(u => u.speaker)))
      if (speakers.length < 2) {
        setError('diarize')
        setPhase('error')
        return
      }
      setSpeakerPreviews(speakers.map(speaker => ({
        speaker,
        sample: utterances.find(u => u.speaker === speaker)?.text ?? '',
      })))
      setPhase('pick-speaker')
    } catch {
      setError('diarize')
      setPhase('error')
    }
  }, [cleanupCapture])

  const pickSpeaker = useCallback(async (repSpeaker: string) => {
    const utterances: Utterance[] = utterancesRef.current.map(u => ({
      speaker: u.speaker, text: u.text, start: u.start, end: u.end,
    }))
    const built = buildRoleplayResult(utterances, repSpeaker, pitchSamplesRef.current, silencePeriodsRef.current)
    setResult(built)

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('roleplay_sessions').insert({
        rep_id: user.id,
        doctor_id: doctorId,
        duration_sec: Math.round(built.durationSec),
        talk_ratio: built.talkRatio.repRatio,
        rapid_turn_switches: built.rapidTurnSwitches,
        question_ratio: built.questionRatio,
        rep_style: built.repRead?.style ?? null,
        rep_confidence: built.repRead?.confidence ?? null,
        rep_metrics: built.repRead ?? null,
      })
      const { data: profile } = await supabase.from('profiles').select('xp').eq('id', user.id).single()
      if (profile) {
        await supabase.from('profiles').update({ xp: profile.xp + XP_VALUES.roleplayComplete }).eq('id', user.id)
      }
    }

    setPhase('done')
  }, [doctorId, supabase])

  const reset = useCallback(() => {
    cleanupCapture()
    utterancesRef.current = []
    setSpeakerPreviews([])
    setResult(null)
    setError(null)
    setElapsedSec(0)
    setPhase('idle')
  }, [cleanupCapture])

  return { phase, error, elapsedSec, speakerPreviews, result, start, stop, pickSpeaker, reset }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRoleplayRecorder.ts
git commit -m "feat: add useRoleplayRecorder (capture, diarize, score, persist)"
```

---

## Task 7: Roleplay recorder UI

**Files:**
- Create: `src/components/game/RoleplayRecorder.tsx`

**Interfaces:**
- Consumes: `useRoleplayRecorder` (Task 6); `useT`, `useLang` from `@/lib/i18n`.
- Produces: `export default function RoleplayRecorder({ doctorId, onDone }: { doctorId: string | null; onDone: () => void })` — Task 8 (`VisitPrep.tsx`) renders this and passes `onDone`.

- [ ] **Step 1: Write the component**

```tsx
// src/components/game/RoleplayRecorder.tsx
'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n'
import { useRoleplayRecorder } from '@/hooks/useRoleplayRecorder'

interface Props { doctorId: string | null; onDone: () => void }

export default function RoleplayRecorder({ doctorId, onDone }: Props) {
  const t = useT()
  const { phase, error, elapsedSec, speakerPreviews, result, start, stop, pickSpeaker, reset } = useRoleplayRecorder(doctorId)
  const [consentChecked, setConsentChecked] = useState(false)
  const [consented, setConsented] = useState(false)

  const card: React.CSSProperties = {
    width: '100%', maxWidth: 480,
    background: 'linear-gradient(180deg,var(--panel),#0a1430)',
    border: '1px solid var(--line)', borderRadius: 18,
    padding: '18px 20px 20px', boxShadow: '0 16px 50px rgba(0,0,0,.55)',
  }
  const wrap: React.CSSProperties = { position: 'relative', zIndex: 1, minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
  const eyebrow = (text: string) => (
    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.4em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 10 }}>{text}</div>
  )
  const btnPrimary: React.CSSProperties = {
    width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12,
    letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)',
    color: '#04121c', background: 'var(--cyan)', borderRadius: 10, padding: '12px 18px',
    boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation',
  }
  const btnGhost: React.CSSProperties = {
    width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12,
    letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--line)',
    color: 'var(--ink-dim)', background: 'transparent', borderRadius: 10, padding: '12px 18px',
    touchAction: 'manipulation', marginTop: 10,
  }

  if (!consented) {
    return (
      <div style={wrap}>
        <div style={card}>
          {eyebrow(t('roleplay.consentTitle'))}
          <p style={{ color: 'var(--ink-dim)', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>{t('roleplay.consentBody')}</p>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5, marginBottom: 18, cursor: 'pointer' }}>
            <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--cyan)' }} />
            {t('roleplay.consentCheckbox')}
          </label>
          <button style={{ ...btnPrimary, opacity: consentChecked ? 1 : 0.5, cursor: consentChecked ? 'pointer' : 'not-allowed' }}
            disabled={!consentChecked}
            onClick={() => { setConsented(true); start() }}>
            {t('roleplay.consentAgree')}
          </button>
          <button style={btnGhost} onClick={onDone}>{t('roleplay.consentCancel')}</button>
        </div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div style={wrap}>
        <div style={card}>
          {eyebrow(t('roleplay.title'))}
          <p style={{ color: 'var(--red)', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
            {error === 'mic' ? t('roleplay.errorMic') : t('roleplay.errorDiarize')}
          </p>
          <button style={btnPrimary} onClick={() => { reset(); setConsented(false); setConsentChecked(false) }}>{t('roleplay.done')}</button>
        </div>
      </div>
    )
  }

  if (phase === 'recording') {
    return (
      <div style={wrap}>
        <div style={card}>
          {eyebrow(t('roleplay.recording'))}
          <div style={{ fontFamily: 'var(--mono)', fontSize: 44, fontWeight: 700, color: 'var(--red)', textAlign: 'center', margin: '10px 0 20px' }}>
            {String(Math.floor(elapsedSec / 60)).padStart(2, '0')}:{String(elapsedSec % 60).padStart(2, '0')}
          </div>
          <button style={{ ...btnPrimary, borderColor: 'var(--red)', background: 'var(--red)', boxShadow: 'none' }} onClick={stop}>{t('roleplay.stop')}</button>
        </div>
      </div>
    )
  }

  if (phase === 'processing') {
    return (
      <div style={wrap}>
        <div style={card}>
          {eyebrow(t('roleplay.processing'))}
          <p style={{ color: 'var(--ink-dim)', fontSize: 13.5 }}>…</p>
        </div>
      </div>
    )
  }

  if (phase === 'pick-speaker') {
    return (
      <div style={wrap}>
        <div style={card}>
          {eyebrow(t('roleplay.pickSpeakerTitle'))}
          <p style={{ color: 'var(--ink-dim)', fontSize: 13.5, marginBottom: 14 }}>{t('roleplay.pickSpeakerHint')}</p>
          {speakerPreviews.map(p => (
            <button key={p.speaker} onClick={() => pickSpeaker(p.speaker)}
              style={{ display: 'block', width: '100%', textAlign: 'start', cursor: 'pointer', color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: 13.5, lineHeight: 1.4, border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', background: 'rgba(0,0,0,.18)', marginBottom: 10, touchAction: 'manipulation' }}>
              <b style={{ color: 'var(--cyan)', display: 'block', fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 4 }}>
                {t('roleplay.speakerLabel', { letter: p.speaker })}
              </b>
              &ldquo;{p.sample}&rdquo;
            </button>
          ))}
        </div>
      </div>
    )
  }

  // phase === 'done'
  const r = result!
  const talkPct = Math.round(r.talkRatio.repRatio * 100)
  const questionPct = Math.round(r.questionRatio * 100)

  return (
    <div style={wrap}>
      <div style={{ ...card, maxWidth: 520 }}>
        {eyebrow(t('roleplay.resultEyebrow'))}
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>{t('roleplay.resultTitle')}</h2>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
            <span>{t('roleplay.talkRatio')}</span><span style={{ fontFamily: 'var(--mono)' }}>{talkPct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${talkPct}%`, background: 'var(--cyan)' }} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
            <span>{t('roleplay.questionRatio')}</span><span style={{ fontFamily: 'var(--mono)' }}>{questionPct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${questionPct}%`, background: 'var(--green)' }} />
          </div>
        </div>

        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
            <span>{t('roleplay.rapidSwitches')}</span>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{r.rapidTurnSwitches}</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-dim)', lineHeight: 1.5, marginTop: 6 }}>{t('roleplay.rapidSwitchesHint')}</p>
        </div>

        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 6 }}>{t('roleplay.styleReadTitle')}</div>
          {r.repRead
            ? <div style={{ fontSize: 14 }}>{r.repRead.style} · {r.repRead.confidence}%</div>
            : <p style={{ fontSize: 13, color: 'var(--ink-dim)', lineHeight: 1.5 }}>{t('roleplay.noStyleRead')}</p>}
        </div>

        <button style={btnPrimary} onClick={onDone}>{t('roleplay.done')}</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (No unit test — this is a thin renderer over the already-tested `roleplay-core.ts` and the hook from Task 6, same pattern as `SpsAssessment.tsx` — covered by the manual QA pass in Task 9.)

- [ ] **Step 3: Commit**

```bash
git add src/components/game/RoleplayRecorder.tsx
git commit -m "feat: add RoleplayRecorder consent/record/result UI"
```

---

## Task 8: Wire into VisitPrep

**Files:**
- Modify: `src/components/game/VisitPrep.tsx`

**Interfaces:**
- Consumes: `RoleplayRecorder` (Task 7).

- [ ] **Step 1: Import `RoleplayRecorder`**

```typescript
// src/components/game/VisitPrep.tsx — add with the other component imports
import RoleplayRecorder from './RoleplayRecorder'
```

- [ ] **Step 2: Add `'roleplay'` to the `View` union**

The existing union (near the top of the file):

```typescript
type View =
  | { mode: 'list' }
  | { mode: 'form'; doctor?: Doctor }
  | { mode: 'detail'; doctor: Doctor }
  | { mode: 'warmup'; doctor: Doctor }
  | { mode: 'ai'; doctor: Doctor }
```

Replace with:

```typescript
type View =
  | { mode: 'list' }
  | { mode: 'form'; doctor?: Doctor }
  | { mode: 'detail'; doctor: Doctor }
  | { mode: 'warmup'; doctor: Doctor }
  | { mode: 'ai'; doctor: Doctor }
  | { mode: 'roleplay'; doctor: Doctor }
```

- [ ] **Step 3: Add the `'roleplay'` view branch** (alongside the existing `if (view.mode === 'warmup')` / `if (view.mode === 'ai')` branches)

```typescript
  if (view.mode === 'roleplay') {
    return <RoleplayRecorder doctorId={view.doctor.id} onDone={() => setView({ mode: 'detail', doctor: view.doctor })} />
  }
```

- [ ] **Step 4: Add the entry button next to the existing warmup/AI-drill buttons** (in the doctor detail view, right after the `'ai'` button)

The existing block:

```tsx
            <button onClick={() => setView({ mode: 'warmup', doctor: d })} style={{ ...primaryBtn, marginTop:2 }}>{t('prep.start')}</button>
            <button onClick={() => setView({ mode: 'ai', doctor: d })}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.1em', textTransform:'uppercase', border:'1px solid var(--purple)', color:'var(--purple)', background:'rgba(176,108,255,.08)', borderRadius:10, padding:'12px 16px', touchAction:'manipulation' }}>
              {t('prep.aiDrill')} · {t('prep.aiPremium')}
            </button>
```

Replace with:

```tsx
            <button onClick={() => setView({ mode: 'warmup', doctor: d })} style={{ ...primaryBtn, marginTop:2 }}>{t('prep.start')}</button>
            <button onClick={() => setView({ mode: 'ai', doctor: d })}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.1em', textTransform:'uppercase', border:'1px solid var(--purple)', color:'var(--purple)', background:'rgba(176,108,255,.08)', borderRadius:10, padding:'12px 16px', touchAction:'manipulation' }}>
              {t('prep.aiDrill')} · {t('prep.aiPremium')}
            </button>
            <button onClick={() => setView({ mode: 'roleplay', doctor: d })}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.1em', textTransform:'uppercase', border:'1px solid var(--green)', color:'var(--green)', background:'rgba(62,224,143,.08)', borderRadius:10, padding:'12px 16px', touchAction:'manipulation' }}>
              🎙 {t('roleplay.entryButton')}
            </button>
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/game/VisitPrep.tsx
git commit -m "feat: add roleplay entry point to VisitPrep doctor detail view"
```

---

## Task 9: Environment setup + manual verification

**Files:** none (operational task)

- [ ] **Step 1: Set the Netlify environment variable**

In Netlify → Site settings → Environment variables, add `ASSEMBLYAI_API_KEY` with a key from an AssemblyAI account (assemblyai.com/app/account). Redeploy so the function picks it up.

- [ ] **Step 2: Manual verification — happy path**

Run `npm run dev`, open a doctor's detail view in Visit Prep, tap "🎙 Roleplay With a Colleague." With a second person (or a second device playing back speech), work through:
1. Consent screen — checkbox must be ticked before "I Understand — Start Recording" is enabled.
2. Record ~20-30 seconds of two-person back-and-forth conversation (mix of statements and at least one question from each side).
3. Stop — should show "Separating speakers and scoring delivery…", then the speaker-picker with two transcript snippets.
4. Tap your own snippet.
5. Result screen should show a talk-time bar, question-ratio bar, a rapid-back-and-forth count, and either a delivery style read or the "not enough voice captured" fallback.
6. Confirm the row landed in Supabase: `select * from roleplay_sessions order by created_at desc limit 1;` — verify `talk_ratio` and `question_ratio` are between 0 and 1, `rep_style` is one of the four style keys or null, and the rep's `xp` increased by 40.

- [ ] **Step 3: Manual verification — error paths**

- Deny microphone permission when prompted → should land on the mic-error screen with a way back out.
- Record less than ~5 seconds of single-speaker-only audio (so diarization can't find two speakers) → should land on the diarize-error screen, and confirm no row was written to `roleplay_sessions`.

- [ ] **Step 4: Confirm no raw audio or full transcript was persisted**

`select rep_metrics from roleplay_sessions order by created_at desc limit 1;` — confirm the JSON contains only the `SocialStyleRead` shape (style/confidence/assertiveness/responsiveness/proof), never raw transcript text or an audio reference.

---

## Self-Review

**Spec coverage:** Acoustic engine port + turn-taking analysis (Task 1), diarization proxy + client (Tasks 2-3), schema (Task 4), XP + copy (Task 5), capture/orchestration/persistence (Task 6), UI including the mandatory consent screen (Task 7), VisitPrep entry point (Task 8), env setup + manual QA including a check that nothing sensitive is persisted (Task 9) — covers the full agreed scope: real two-person roleplay, single-mic capture, cloud diarization for turn-taking, rapid-turn-switch/talk-ratio/question-ratio metrics, and the acoustic delivery read, with the "interruption" claim honestly scoped throughout.

**Placeholder scan:** No TBD/TODO markers; every code block is complete and runnable; every step names its exact file and run command.

**Type consistency:** `Utterance`/`Turn`/`RoleplayResult`/`PitchSample`/`SilencePeriod` defined once (Task 1) and imported by that exact name everywhere else. `DiarizedUtterance` (Task 3, from the AssemblyAI client) is deliberately a different, wider type than `Utterance` (Task 1's narrower core type) — Task 6's `pickSpeaker` explicitly maps one to the other rather than conflating them. `diarizeAudio` return type matches its Task 3 definition and Task 6 call site. `roleplay_sessions` column names (`talk_ratio`, `rapid_turn_switches`, `question_ratio`, `rep_style`, `rep_confidence`, `rep_metrics`) match across the migration (Task 4) and the insert in Task 6. `XP_VALUES.roleplayComplete` matches between its Task 5 definition and Task 6 usage.
