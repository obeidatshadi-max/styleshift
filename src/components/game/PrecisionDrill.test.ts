// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import PrecisionDrill from './PrecisionDrill'
import { LanguageProvider } from '@/lib/i18n'
import type { Doctor } from '@/types/game'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const doctor = { id: 'd1', name: 'Dr. Salim', style: 'analytical' } as unknown as Doctor
const renderDrill = (onDone = vi.fn()) => render(createElement(LanguageProvider, null, createElement(PrecisionDrill, { doctor, onDone })))

describe('PrecisionDrill', () => {
  it('shows the vague line, sends the typed question, and shows the verdict with an example question', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ pattern: 'unspecified_referent', doctorLine: 'Patients do not like it.' }))
      .mockResolvedValueOnce(Response.json({ verdict: 'specifying', doctorText: 'Mostly my older patients.' }))
    vi.stubGlobal('fetch', fetcher)
    renderDrill()
    expect(await screen.findByText('Patients do not like it.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Which patients, specifically?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
    expect(await screen.findByText('Mostly my older patients.')).toBeTruthy()
    expect(screen.getByText('Made it specific')).toBeTruthy()
    expect(screen.getByText(/"Which patients, specifically\?"/)).toBeTruthy()
    const judge = JSON.parse(fetcher.mock.calls[1][1].body)
    expect(judge).toMatchObject({ action: 'judge', pattern: 'unspecified_referent', repQuestion: 'Which patients, specifically?' })
  })
  it('explains when the feature is not configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))
    renderDrill()
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  })
  it('summarises after the last round', async () => {
    const fetcher = vi.fn()
    for (const p of ['deletion', 'impossibility', 'missing_comparison']) {
      fetcher.mockResolvedValueOnce(Response.json({ pattern: p, doctorLine: `Line ${p}.` }))
      fetcher.mockResolvedValueOnce(Response.json({ verdict: p === 'impossibility' ? 'answered_instead' : 'specifying', doctorText: `Reply ${p}.` }))
    }
    vi.stubGlobal('fetch', fetcher)
    renderDrill()
    for (const p of ['deletion', 'impossibility', 'missing_comparison']) {
      await screen.findByText(`Line ${p}.`)
      fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'What exactly?' } })
      fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
      await screen.findByText(`Reply ${p}.`)
      fireEvent.click(screen.getByRole('button', { name: p === 'missing_comparison' ? 'See summary' : 'Next round' }))
    }
    expect(await screen.findByText("2 of 3 follow-ups made the doctor's statement specific.")).toBeTruthy()
  })
})
