// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'
import type { Doctor } from '@/types/game'
import VoicePartnerLive from './VoicePartnerLive'

const live = vi.hoisted(() => ({
  state: 'live', errorKind: null, activity: 'listening', muted: false,
  transcript: [{ role: 'doctor', text: 'What is the evidence?' }, { role: 'rep', text: 'Which outcomes matter to you?' }],
  connect: vi.fn(), disconnect: vi.fn(), toggleMute: vi.fn(),
}))
vi.mock('@/hooks/useVoiceLive', () => ({ useVoiceLive: () => live }))
vi.mock('./PracticeReport', () => ({ default: ({ sessionId }: { sessionId: string }) => createElement('div', null, `Coaching report: ${sessionId}`) }))
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }))
const doctor = { id: 'doc-1', name: 'Dr. Salim' } as Doctor
beforeEach(() => { live.state = 'live'; live.disconnect.mockResolvedValue(live.transcript) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); localStorage.clear() })
async function begin(onDone = vi.fn()) {
  render(createElement(LanguageProvider, null, createElement(VoicePartnerLive, { doctor, onDone })))
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByText('Start Call'))
  await screen.findByText('End Call')
  return onDone
}

describe('live practice feedback', () => {
  it('keeps the user on the report until they choose to return', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => Response.json(String(input).includes('live-judge')
      ? { outcome: 'escalated', objectionType: 'doubt', clearSteps: ['clarify'], turnCount: 1 } : { ok: true }))
    const onDone = await begin()
    expect(screen.getByText('Which outcomes matter to you?')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByText('End Call')))
    await screen.findByText('Needs more practice')
    expect(screen.getByText(/Coaching report:/)).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Back to doctor'))
    expect(onDone).toHaveBeenCalledWith('escalated', { turns: 1, openingCrisis: 'What is the evidence?' })
  })
  it('does not turn a failed judge into a poor performance result', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    const onDone = await begin()
    await act(async () => fireEvent.click(screen.getByText('End Call')))
    await screen.findByText('Not scored')
    fireEvent.click(screen.getByText('Back to doctor'))
    expect(onDone).toHaveBeenCalledWith('unscored', expect.objectContaining({ turns: 1 }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('explains when scoring succeeds but saving fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => String(input).includes('live-judge')
      ? Response.json({ outcome: 'won', objectionType: 'doubt', clearSteps: [], turnCount: 1 }) : new Response('', { status: 500 }))
    await begin()
    await act(async () => fireEvent.click(screen.getByText('End Call')))
    await screen.findByText('Your call was scored, but the session could not be saved.')
    expect(screen.getByText('Concern resolved')).toBeTruthy()
  })
  it('distinguishes an interrupted call from a scored result', async () => {
    const onDone = vi.fn()
    const view = render(createElement(LanguageProvider, null, createElement(VoicePartnerLive, { doctor, onDone })))
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Start Call'))
    live.state = 'error'
    view.rerender(createElement(LanguageProvider, null, createElement(VoicePartnerLive, { doctor, onDone })))
    fireEvent.click(screen.getByText('Back to doctor'))
    expect(onDone).toHaveBeenCalledWith('interrupted', expect.objectContaining({ turns: 1 }))
  })
})
