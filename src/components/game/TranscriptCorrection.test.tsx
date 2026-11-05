// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'
import TranscriptCorrection from './TranscriptCorrection'

const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body })
const loaded = { transcriptVersion: 1, canProposePhrases: true, segments: [
  { segmentIndex: 0, speakerRole: 'counterpart', text: 'شنو تريد' }, { segmentIndex: 1, speakerRole: 'rep', text: 'عندك وكت' },
] }
const view = (onSaved = vi.fn()) => render(React.createElement(LanguageProvider, null, React.createElement(TranscriptCorrection, { sessionId: 's1', onSaved })))

beforeEach(() => { vi.stubGlobal('React', React) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

describe('TranscriptCorrection', () => {
  it('loads the transcript on open and keeps Save disabled until something changes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(loaded)))
    const { getByText, findByDisplayValue } = view()
    fireEvent.click(getByText('Check the transcript'))
    await findByDisplayValue('عندك وكت')
    expect((getByText('Save corrections') as HTMLButtonElement).disabled).toBe(true)
  })

  it('saves an edited line and a switched speaker, and tells the parent the new version', async () => {
    const fetchMock = vi.fn(async (url: string) => String(url).includes('/correct') ? json({ newTranscriptVersion: 2, proposalsSent: 1 }) : json(loaded))
    vi.stubGlobal('fetch', fetchMock)
    const onSaved = vi.fn()
    const { getByText, findByDisplayValue, getAllByRole, findByText } = view(onSaved)
    fireEvent.click(getByText('Check the transcript'))
    fireEvent.change(await findByDisplayValue('عندك وكت'), { target: { value: 'عندك وقت' } })
    fireEvent.click(getAllByRole('button').find(b => b.getAttribute('aria-label')?.startsWith('Switch speaker: Other person'))!)
    fireEvent.click(getByText('Save corrections'))
    await findByText(/Saved as version 2/)
    const post = fetchMock.mock.calls.find(c => String(c[0]).includes('/correct')) as unknown as [string, RequestInit]
    expect(JSON.parse(post[1].body as string)).toEqual({
      sessionType: 'human_partner', sessionId: 's1', swapSegmentIndexes: [0], edits: [{ segmentIndex: 1, text: 'عندك وقت' }], proposePhrases: true,
    })
    expect(onSaved).toHaveBeenCalledWith(2)
  })

  it('does not send phrases when the box is unticked', async () => {
    const fetchMock = vi.fn(async (url: string) => String(url).includes('/correct') ? json({ newTranscriptVersion: 2 }) : json(loaded))
    vi.stubGlobal('fetch', fetchMock)
    const { getByText, findByDisplayValue, getByRole } = view()
    fireEvent.click(getByText('Check the transcript'))
    fireEvent.change(await findByDisplayValue('عندك وكت'), { target: { value: 'عندك وقت' } })
    fireEvent.click(getByRole('checkbox'))
    fireEvent.click(getByText('Save corrections'))
    await waitFor(() => expect(fetchMock.mock.calls.some(c => String(c[0]).includes('/correct'))).toBe(true))
    const post = fetchMock.mock.calls.find(c => String(c[0]).includes('/correct')) as unknown as [string, RequestInit]
    expect(JSON.parse(post[1].body as string).proposePhrases).toBe(false)
  })

  it('hides the phrase tick box when the phrase library is off, and shows Arabic text in Arabic', async () => {
    localStorage.setItem('styleshift_lang', 'ar')
    vi.stubGlobal('fetch', vi.fn(async () => json({ ...loaded, canProposePhrases: false })))
    const { findByText, queryByRole, findByDisplayValue } = view()
    fireEvent.click(await findByText('راجع نص المحادثة'))
    await findByDisplayValue('عندك وكت')
    expect(queryByRole('checkbox')).toBeNull()
  })

  it('shows an error when the transcript cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, false)))
    const { getByText, findByRole } = view()
    fireEvent.click(getByText('Check the transcript'))
    expect((await findByRole('alert')).textContent).toContain('Could not load')
  })
})
