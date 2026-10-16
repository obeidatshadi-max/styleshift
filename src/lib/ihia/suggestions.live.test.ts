import { expect, it } from 'vitest'
import { suggestionCompletion } from './provider'
import { suggestExpressions } from './suggestions'

// Opt-in only: one real request with synthetic context; no auth impersonation or DB writes.
it.skipIf(process.env.IHIA_LIVE_SMOKE !== 'true')('existing configured AI generates unverified Iraqi suggestions', async () => {
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) process.loadEnvFile('.env.local')
  const complete = suggestionCompletion()
  expect(!!complete).toBe(true)
  const result = await suggestExpressions(complete!, 'A busy doctor asks a pharmaceutical representative to keep a meeting short.', 'baghdad')
  expect(result && result.length >= 1).toBeTruthy()
  for (const entry of result!) {
    expect(entry.review_status).toBe('unverified')
    expect(entry.source_reference).toContain('AI-generated')
  }
}, 60000)
