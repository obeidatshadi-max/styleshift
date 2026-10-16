// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'
import RecordedConversationAnalysis from './RecordedConversationAnalysis'
const m = vi.hoisted(() => ({ saved: vi.fn() }))
vi.mock('@/hooks/useSavedReport', () => ({ useSavedReport: m.saved }))
vi.mock('@/components/report/ConversationReport', () => ({ ConversationReport: ({ report }: { report: { label: string } }) => <p>{report.label}</p> }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); localStorage.clear() })
describe('two-person recorder AI analysis', () => {
  it('does not analyze until requested, then sends the existing session and renders the report', async () => {
    m.saved.mockReturnValue({ status: 'missing' })
    const fetch = vi.fn().mockResolvedValue(Response.json({ report: { label: 'Iraqi report with original evidence' } }))
    vi.stubGlobal('fetch', fetch)
    render(<LanguageProvider><RecordedConversationAnalysis sessionId="recorded-session" /></LanguageProvider>)
    expect(fetch).not.toHaveBeenCalled()
    expect(m.saved).not.toHaveBeenCalled()
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'AI conversation analysis' }))
    await screen.findByText('Iraqi report with original evidence')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ sessionType: 'human_partner', sessionId: 'recorded-session', lang: 'en', analysisConsent: true })
  })
  it('reuses an existing saved report rather than generating another one', async () => {
    m.saved.mockReturnValue({ status: 'found', report: { label: 'Saved analysis' } })
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    render(<LanguageProvider><RecordedConversationAnalysis sessionId="saved-session" /></LanguageProvider>)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'AI conversation analysis' }))
    await screen.findByText('Saved analysis')
    expect(fetch).not.toHaveBeenCalled()
  })
})
