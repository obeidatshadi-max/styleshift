// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'
import MyCoachingInsights from './MyCoachingInsights'

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const view = () => render(React.createElement(LanguageProvider, null, React.createElement(MyCoachingInsights)))

beforeEach(() => { vi.stubGlobal('React', React) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('MyCoachingInsights', () => {
  // The API sends gravity: null until a rep has enough analysed AI Doctor
  // sessions; reading overallSessionCount on it crashed the whole /play page.
  it('renders nothing, without crashing, when the API has no gravity data yet', async () => {
    const fetchMock = vi.fn(async () => json({ gravity: null, unusedResources: [], mastermindInsights: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const { container } = view()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 20))
    expect(container.innerHTML).toBe('')
  })

  // Reps in Iraq use the Arabic UI; the insight sentences are built in English on the server,
  // so the card rebuilds them in Arabic from the evidence that travels with each insight.
  it('shows the insight sentences in Arabic when the language is Arabic', async () => {
    localStorage.setItem('styleshift_lang', 'ar')
    const insight = {
      source: 'gravity', observation: 'Under Doubt objections, your reply length shifts.', pattern: 'p', impact: 'i', alternative: 'a',
      evidence: { trigger: 'doubt', sessionCount: 4, metric: 'avgRepTurnLength', deviationPct: 60, winRate: 25, baselineWinRate: 60, winRateGapPts: 35 },
      experiment: { objectionType: 'doubt', focusStep: 'listen', label: 'Practice Doubt objections' },
    }
    vi.stubGlobal('fetch', vi.fn(async () => json({ gravity: { overallSessionCount: 10, patterns: [] }, unusedResources: [], mastermindInsights: [insight] })))
    const { findByText } = view()
    expect(await findByText(/عند ظهور «الشك»/)).toBeTruthy()
    localStorage.removeItem('styleshift_lang')
  })
})
