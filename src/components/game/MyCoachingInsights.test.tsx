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
})
