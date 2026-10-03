import { describe, it, expect } from 'vitest'
import { buildReportPrompt, SYSTEM } from './buildReportPrompt'
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
  it('splits the shape across two parts that together cover the full report, with a smaller token budget each', () => {
    const findings = buildReportPrompt(segments, context, [], [], 'findings')
    const coaching = buildReportPrompt(segments, context, [], [], 'coaching')
    const all = buildReportPrompt(segments, context, [], [], 'all')
    expect(findings.prompt).toContain('"visitSummary"')
    expect(findings.prompt).not.toContain('"coachingPriority": {')
    expect(coaching.prompt).toContain('"coachingPriority": {')
    expect(coaching.prompt).not.toContain('"visitSummary": {')
    expect(findings.maxTokens).toBeLessThan(all.maxTokens)
    for (const key of ['"visitSummary"', '"commitments"', '"coachingPriority"', '"socialStyle"']) expect(all.prompt).toContain(key)
  })
  it('system prompt forbids fabricating commitments/dates/scores', () => {
    expect(SYSTEM.toLowerCase()).toMatch(/never invent/)
  })
})
