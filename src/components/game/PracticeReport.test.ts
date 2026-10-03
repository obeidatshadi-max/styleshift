// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'
import PracticeReport from './PracticeReport'

vi.mock('@/components/report/ConversationReport', () => ({
  ConversationReport: ({ report }: { report: { label: string } }) => createElement('div', null, report.label),
}))
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })
const view = (sessionId: string, sessionType: 'ai_doctor_text' | 'ai_doctor_voice' = 'ai_doctor_voice') =>
  createElement(LanguageProvider, null, createElement(PracticeReport, { sessionId, sessionType }))

describe('practice coaching report', () => {
  it('retries a failed report for the same text session', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValueOnce(Response.json({ report: { label: 'Recovered coaching' } }))
    render(view('text-session', 'ai_doctor_text'))
    fireEvent.click(await screen.findByRole('button', { name: 'Retry coaching report' }))
    await screen.findByText('Recovered coaching')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    for (const call of fetchMock.mock.calls) {
      expect(JSON.parse(String(call[1]?.body))).toEqual({ sessionId: 'text-session', sessionType: 'ai_doctor_text' })
    }
  })

  it('recovers on its own from one gateway timeout without showing an error', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 504 }))
      .mockResolvedValueOnce(Response.json({ report: { label: 'Second try coaching' } }))
    render(view('slow-session', 'ai_doctor_text'))
    await screen.findByText('Second try coaching')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('does not auto-retry a client error such as rate limiting', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 429 }))
    render(view('limited-session'))
    await screen.findByRole('alert')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows the error after two transient failures', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 504 }))
    render(view('down-session'))
    await screen.findByRole('alert')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('ignores an old session response arriving after the next session report', async () => {
    let resolveOld!: (response: Response) => void
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
      .mockResolvedValueOnce(Response.json({ report: { label: 'Current coaching' } }))
    const rendered = render(view('old-session'))
    const oldSignal = fetchMock.mock.calls[0][1]?.signal
    rendered.rerender(view('new-session'))
    await screen.findByText('Current coaching')
    expect(oldSignal?.aborted).toBe(true)
    await act(async () => resolveOld(Response.json({ report: { label: 'Stale coaching' } })))
    expect(screen.queryByText('Stale coaching')).toBeNull()
    expect(screen.getByText('Current coaching')).toBeTruthy()
  })

  it('aborts report generation when leaving the practice screen', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    const rendered = render(view('voice-session'))
    const signal = fetchMock.mock.calls[0][1]?.signal
    rendered.unmount()
    expect(signal?.aborted).toBe(true)
  })
})
