// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
vi.mock('@/lib/i18n', () => ({ useT: () => (key: string) => key, useLang: () => ({ lang: 'en' }) }))
const rec = vi.hoisted(() => ({ previewUrl: null as string | null, start: vi.fn(), stop: vi.fn(), take: vi.fn(), discard: vi.fn(), abort: vi.fn() }))
vi.mock('@/hooks/useAudioRecorder', () => ({ useAudioRecorder: () => rec }))
import VoiceRecorder from './VoiceRecorder'
const fetchMock = vi.fn()
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('fetch', fetchMock); rec.previewUrl = null; rec.start.mockResolvedValue(true); rec.stop.mockResolvedValue(undefined); rec.take.mockReturnValue({ blob: new Blob(['audio']), durationSec: 2 }); rec.discard.mockClear(); fetchMock.mockResolvedValue(Response.json({ text: 'captured visit note' })) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })
describe('Visit Prep recorder recovery', () => {
  it('sends the actual recording MIME type flow to transcription and releases it on success', async () => {
    const onTranscript = vi.fn()
    render(React.createElement(VoiceRecorder, { onTranscript }))
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByRole('button').getAttribute('aria-label')).toBe('visit.recording'))
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith('captured visit note'))
    expect(rec.take).toHaveBeenCalledWith(true); expect(rec.discard).toHaveBeenCalled()
  })
  it('keeps a failed take and retries it without opening the microphone again', async () => {
    rec.previewUrl = 'blob:kept'
    fetchMock.mockResolvedValueOnce(Response.json({}, { status: 503 })).mockResolvedValueOnce(Response.json({ text: 'retried note' }))
    const onTranscript = vi.fn(); render(React.createElement(VoiceRecorder, { onTranscript }))
    fireEvent.click(screen.getByRole('button', { name: '🎙️' })); await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Retry recording / transcription' }))
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith('retried note'))
    expect(rec.start).not.toHaveBeenCalled(); expect(rec.take).toHaveBeenCalledTimes(2); expect(rec.discard).toHaveBeenCalled()
  })
  it('stops the microphone and cancels transcription on unmount', async () => {
    const view = render(React.createElement(VoiceRecorder, { onTranscript: vi.fn() }))
    view.unmount(); expect(rec.abort).toHaveBeenCalled()
  })
})
