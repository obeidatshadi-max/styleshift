import { describe, it, expect } from 'vitest'
import { buildReportPrompt, mergeReportParts, REPORT_PARTS, SYSTEM } from './buildReportPrompt'
import type { TranscriptSegment, ReportContext } from '@/schemas/conversationReport'

const segments: TranscriptSegment[] = [
  { segmentIndex: 0, speakerRole: 'counterpart', text: 'I have five minutes only.', startMs: 0, endMs: 2000, createdAt: null },
  { segmentIndex: 1, speakerRole: 'rep', text: 'Understood, I will be brief.', startMs: 2000, endMs: 4000, createdAt: null },
]
const context: ReportContext = {
  objective: 'Introduce new formulation', productContext: null, isSimulation: true,
  simulationPersona: { style: 'driver', hiddenConcern: 'cost' }, savedCounterpartStyle: null,
  deterministicMetrics: { talkRatio: 0.5 }, qualityFlags: [],
}

describe('buildReportPrompt', () => {
  it('includes every segment indexed, never renumbered', () => {
    const { prompt } = buildReportPrompt(segments, context, [])
    expect(prompt).toContain('[0] counterpart: I have five minutes only.')
    expect(prompt).toContain('[1] rep: Understood, I will be brief.')
  })
  it('tells the model to cite segmentIndex only, never quote text itself', () => {
    const { prompt } = buildReportPrompt(segments, context, [])
    expect(prompt.toLowerCase()).toContain('segmentindex')
    expect(prompt.toLowerCase()).toMatch(/do not (include|write) the quoted text/)
  })
  it('marks a simulation persona as configuration, not customer data, in the prompt', () => {
    const { prompt } = buildReportPrompt(segments, context, [])
    expect(prompt).toMatch(/simulation.*persona|persona.*simulation/i)
    expect(prompt).not.toMatch(/customer('s)? (trust|hidden concern)/i)
  })
  it('forbids inventing an objective when none was supplied', () => {
    const noObjective = { ...context, objective: null }
    const { prompt } = buildReportPrompt(segments, noObjective, [])
    expect(prompt).toMatch(/no objective was (supplied|given|stated)/i)
  })
  it('spells out the exact JSON field names groundReport reads, so the model cannot rename them', () => {
    const { prompt } = buildReportPrompt(segments, context, [])
    // A missing coachingPriority.behavior discards the whole report (the production 502s).
    for (const field of ['"coachingPriority": { "behavior"', '"strength": { "behavior"', '"visitSummary": { "summary"',
      '"whatHappened"', '"betterPhrase"', '"mostUsefulAdjustment"', '"dimension": "opening"'])
      expect(prompt).toContain(field)
  })
  it('splits the shape across parts that each hold only their own keys and together cover the full report', () => {
    const topKeys = ['visitSummary', 'customerUnderstanding', 'performance', 'criticalMoments', 'momentUnderstanding', 'vagueStatements', 'commitments', 'coachingPriority', 'strength', 'socialStyle']
    const all = buildReportPrompt(segments, context, [], [], 'all')
    const covered = new Set<string>()
    for (const part of REPORT_PARTS) {
      const built = buildReportPrompt(segments, context, [], [], part)
      const own = topKeys.filter(key => built.prompt.includes(`
  "${key}":`))
      expect(own.length).toBeGreaterThan(0)
      own.forEach(key => { expect(covered.has(key)).toBe(false); covered.add(key) })
      expect(built.maxTokens).toBeLessThan(all.maxTokens)
    }
    expect([...covered].sort()).toEqual([...topKeys].sort())
    expect(topKeys.every(key => all.prompt.includes(`
  "${key}":`))).toBe(true)
  })
  it('asks the moments part for vague counterpart statements with the Structure of Magic patterns', () => {
    const { prompt } = buildReportPrompt(segments, context, [], [], 'moments')
    expect(prompt).toContain('"vagueStatements": [{ "evidence"')
    expect(prompt).toContain('"missing_comparison"')
    expect(prompt).toMatch(/did not ask to make specific/)
    expect(buildReportPrompt(segments, context, [], [], 'coaching').prompt).not.toContain('vagueStatements')
  })
  it('merges only the keys each part owns, so a stray key cannot overwrite another part', () => {
    const merged = mergeReportParts({
      summary: { visitSummary: { summary: 'real' }, commitments: [] },
      moments: { performance: [], criticalMoments: [] },
      coaching: { coachingPriority: { behavior: 'b' }, strength: { behavior: 's' }, visitSummary: 'No objective was supplied.' },
      style: { socialStyle: {}, extra: 1 },
    })
    expect(merged.visitSummary).toEqual({ summary: 'real' })
    expect(Object.keys(merged).sort()).toEqual(['commitments', 'coachingPriority', 'criticalMoments', 'performance', 'socialStyle', 'strength', 'visitSummary'].sort())
    expect(mergeReportParts({ coaching: { coachingPriority: {} } })).toEqual({ coachingPriority: {} })
  })
  it('asks for free-text fields in the selected language but keeps keys and enum values in English', () => {
    const ar = buildReportPrompt(segments, context, [], [], 'all', 'ar').prompt
    const en = buildReportPrompt(segments, context, [], [], 'all', 'en').prompt
    expect(ar).toContain('Write every free-text field in Arabic')
    expect(ar).toMatch(/enumerated values .* stay in English/)
    expect(en).toContain('Write every free-text field in English.')
    expect(en).not.toContain('in Arabic')
    expect(buildReportPrompt(segments, context, []).prompt).toContain('in English')
  })
  it('names the coaching free-text fields as Arabic so they are not left in English', () => {
    const ar = buildReportPrompt(segments, context, [], [], 'coaching', 'ar').prompt
    expect(ar).toMatch(/MUST be Arabic.*"behavior".*"practiceExercise"/)
  })
  it('forbids suggested wording that asserts product efficacy, in every part and language', () => {
    for (const part of ['all', 'summary', 'moments', 'coaching', 'style'] as const)
      for (const lang of ['en', 'ar'] as const)
        expect(buildReportPrompt(segments, context, [], [], part, lang).prompt).toMatch(/NEVER assert what the product does or achieves/)
  })
  it('system prompt forbids fabricating commitments/dates/scores', () => {
    expect(SYSTEM.toLowerCase()).toMatch(/never invent/)
  })
})

describe('knowledge in the report prompt', () => {
  const withKnowledge = {
    ...context,
    knowledge: {
      analystSection: 'ANALYST-SECTION fact f1',
      coachSection: 'COACH-SECTION fact f1',
      prohibitedHits: [{ itemId: 'p1', phrase: 'cures heart disease', segmentIndex: 1 }],
    },
  }

  it('gives the coaching part the coach section and the observation parts the analyst section', () => {
    expect(buildReportPrompt(segments, withKnowledge, [], [], 'coaching', 'en').prompt).toContain('COACH-SECTION')
    expect(buildReportPrompt(segments, withKnowledge, [], [], 'coaching', 'en').prompt).not.toContain('ANALYST-SECTION')
    expect(buildReportPrompt(segments, withKnowledge, [], [], 'moments', 'en').prompt).toContain('ANALYST-SECTION')
    expect(buildReportPrompt(segments, withKnowledge, [], [], 'all', 'en').prompt).toContain('COACH-SECTION')
  })

  it('lists prohibited-claim matches as review signals, not verdicts', () => {
    const p = buildReportPrompt(segments, withKnowledge, [], [], 'summary', 'en').prompt
    expect(p).toMatch(/not verdicts/)
    expect(p).toContain('cures heart disease')
  })

  it('lets suggested wording use an approved fact only when a knowledge section is present', () => {
    const exception = /you may state an approved fact from the knowledge section above exactly as written/
    expect(buildReportPrompt(segments, withKnowledge, [], [], 'coaching', 'en').prompt).toMatch(exception)
    const without = buildReportPrompt(segments, context, [], [], 'coaching', 'en').prompt
    expect(without).not.toMatch(exception)
    expect(without).toMatch(/NEVER assert what the product does or achieves/)
  })

  it('adds nothing for a context without knowledge', () => {
    const p = buildReportPrompt(segments, context, [], [], 'coaching', 'en').prompt
    expect(p).not.toContain('review signals')
  })
})
