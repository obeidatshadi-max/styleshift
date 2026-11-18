// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'
import ReplayPractice from './ReplayPractice'
import { groundCoach } from '@/lib/conversation-coach/ground'
import { SYNTHETIC_EN, SYNTHETIC_EN_MODEL_OUTPUT } from '@/lib/conversation-coach/fixtures'

vi.mock('@/components/game/VoiceRecorder', () => ({ default: () => <span>mic</span> }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

const coach = groundCoach(SYNTHETIC_EN_MODEL_OUTPUT, SYNTHETIC_EN, { lang: 'en', partialRecording: false, transcriptQuality: null, delivery: null })
const view = (onReplay: (() => void) | null = null) => render(<LanguageProvider>
  <ReplayPractice sessionId="s1" priority={coach.priority!} moment={coach.keyMoments[0]} onReplay={onReplay} />
</LanguageProvider>)

describe('ReplayPractice', () => {
  it('labels the attempt as practice and shows the stored criterion and cue', () => {
    view()
    expect(screen.getByText(/not a conversation with a real doctor/)).toBeTruthy()
    expect(screen.getByText(coach.priority!.successCriterion)).toBeTruthy()
    expect(screen.getByText(/My concern is patients stopping/)).toBeTruthy()
    expect(screen.getByText(/original audio is not available/)).toBeTruthy()
  })

  it('sends only the session and the attempt, then shows feedback', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ result: 'partly', whatWorked: 'You acknowledged.', oneChange: 'Ask one question.', quote: null, saved: true }))
    vi.stubGlobal('fetch', fetch)
    const replay = vi.fn()
    view(replay)
    fireEvent.click(screen.getByRole('button', { name: /Play the original moment/ }))
    expect(replay).toHaveBeenCalled()
    fireEvent.change(screen.getByPlaceholderText('Your reply…'), { target: { value: 'I understand your concern.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Get feedback' }))
    await screen.findByText('Partly met')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ sessionId: 's1', attempt: 'I understand your concern.', lang: 'en' })
    expect(screen.getByText('Ask one question.')).toBeTruthy()
  })

  it('says when feedback is not switched on', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })))
    view()
    fireEvent.change(screen.getByPlaceholderText('Your reply…'), { target: { value: 'Which side effects?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Get feedback' }))
    await screen.findByText(/not switched on yet/)
  })
})
