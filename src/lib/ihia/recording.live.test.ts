import { expect, it } from 'vitest'
import { createOpenAiJsonComplete } from '@/agents/openai-complete'
import { buildReportPrompt } from '@/lib/report/buildReportPrompt'
import { groundReport } from '@/lib/report/groundReport'
import { extractSocialSignals } from '@/lib/report/socialSignals'
import { RECORDING_LANGUAGE_RULES, recordingDialectContext } from './recording'
import type { TranscriptSegment, ReportContext } from '@/schemas/conversationReport'

// Opt-in only. Synthetic conversation; no real recording, account impersonation or database writes.
it.skipIf(process.env.IHIA_LIVE_SMOKE !== 'true')('analyzes synthetic Iraqi conversation while preserving original evidence', async () => {
  if (!process.env.OPENAI_API_KEY) process.loadEnvFile('.env.local')
  expect(!!process.env.OPENAI_API_KEY).toBe(true)
  const segments: TranscriptSegment[] = [
    { segmentIndex: 0, speakerRole: 'counterpart', text: 'هسه ما عندي وكت، عندي مراجعين.', startMs: 0, endMs: 2000, createdAt: null },
    { segmentIndex: 1, speakerRole: 'rep', text: 'زين دكتور، شنو الوقت المناسب للـ follow-up؟', startMs: 2000, endMs: 4000, createdAt: null },
    { segmentIndex: 2, speakerRole: 'counterpart', text: 'خل نحچي الأسبوع الجاي، بس هسه ما أگدر أحدد يوم.', startMs: 4000, endMs: 6000, createdAt: null },
    { segmentIndex: 3, speakerRole: 'rep', text: 'تمام، أتواصل وياك حتى نتفق على وقت.', startMs: 6000, endMs: 8000, createdAt: null },
  ]
  const original = structuredClone(segments)
  const context: ReportContext = { objective: 'Clarify a suitable follow-up time', productContext: null,
    isSimulation: false, simulationPersona: null, savedCounterpartStyle: null, deterministicMetrics: {}, qualityFlags: ['short_session'] }
  const built = buildReportPrompt(segments, context, extractSocialSignals(segments, 'counterpart'), extractSocialSignals(segments, 'rep'), 'all', 'en')
  const raw = await createOpenAiJsonComplete(process.env.OPENAI_API_KEY!)({
    ...built, system: `${built.system}\n${RECORDING_LANGUAGE_RULES}`,
    prompt: `${built.prompt}\n${recordingDialectContext(segments, [])}`,
  })
  expect(raw).toBeTruthy()
  const report = groundReport(JSON.parse(raw!), segments, context, { sessionType: 'human_partner', transcriptVersion: 1 })
  expect(report).not.toBeNull()
  expect(report!.coachingPriority.evidence.length).toBeGreaterThan(0)
  for (const evidence of report!.coachingPriority.evidence) {
    expect(evidence.quote).toBe(segments.find(s => s.segmentIndex === evidence.segmentIndex)!.text)
  }
  expect(segments).toEqual(original)
}, 60000)
