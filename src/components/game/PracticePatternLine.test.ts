// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
vi.mock('@/lib/i18n', () => ({ useT: () => (key: string, p?: Record<string, string | number>) => p ? `${key}|${Object.values(p).join('|')}` : key }))
const rows = vi.hoisted(() => ({ data: [] as unknown[] }))
vi.mock('@/lib/supabase-browser', () => ({
  createClient: () => ({ from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: rows.data }) }) }) }) }),
}))
import PracticePatternLine from './PracticePatternLine'

const hurt = (behavior: string) => ({ competencies: { closing: { score: 40, contributions: [{ behavior, points: -5 }] } } })
beforeEach(() => { vi.stubGlobal('React', React) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('PracticePatternLine', () => {
  it('stays silent without a pattern', async () => {
    rows.data = [hurt('premature_close')]
    const { container } = render(React.createElement(PracticePatternLine))
    await new Promise(r => setTimeout(r, 20))
    expect(container.innerHTML).toBe('')
  })
  it('shows the repeated behavior with its label', async () => {
    rows.data = [hurt('premature_close'), hurt('premature_close'), hurt('premature_close')]
    render(React.createElement(PracticePatternLine))
    expect(await screen.findByText(/pattern.repeated\|sim.beh.premature_close\|3\|3/)).toBeTruthy()
  })
})
