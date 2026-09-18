// @vitest-environment jsdom
//
// This repo's vitest.config.ts runs test: { environment: 'node' } globally
// (no other hook in this codebase has a test file / renders through React —
// the task brief's claim that useAudioRecorder/useRoleplayRecorder already
// have this pattern does not hold; verified via search, no such test files
// exist). A per-file `@vitest-environment jsdom` pragma opts just this file
// into a DOM environment for renderHook, without touching the global config
// or any other test file's environment.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

// Method/event names below match the REAL installed API (verified against
// node_modules/@pipecat-ai/client-js/dist/index.d.ts, v1.13.1):
// - class PipecatClient extends RTVIEventEmitter (a TypedEmitter) -> has
//   .on(event, handler) inherited, plus .connect()/.disconnect().
// - PipecatClient.connect() resolves to BotReadyData (not void).
const mockClientInstance = { connect: vi.fn(), disconnect: vi.fn(), on: vi.fn() }
vi.mock('@pipecat-ai/client-js', () => ({ PipecatClient: vi.fn(() => mockClientInstance) }))
vi.mock('@pipecat-ai/daily-transport', () => ({ DailyTransport: vi.fn() }))

import { useVoiceLive } from './useVoiceLive'

describe('useVoiceLive', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useVoiceLive('d1', 'en'))
    expect(result.current.state).toBe('idle')
    expect(result.current.transcript).toEqual([])
  })

  it('goes notconfigured on a 503 from /api/pipecat/session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))
    const { result } = renderHook(() => useVoiceLive('d1', 'en'))
    await act(async () => { await result.current.connect('realistic') })
    await waitFor(() => expect(result.current.state).toBe('notconfigured'))
  })

  it('goes error on a non-503 session-start failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 502 })))
    const { result } = renderHook(() => useVoiceLive('d1', 'en'))
    await act(async () => { await result.current.connect('realistic') })
    await waitFor(() => expect(result.current.state).toBe('error'))
    expect(result.current.errorKind).toBe('network')
  })

  // Response field names match the REAL already-committed /api/pipecat/session
  // contract (src/app/api/pipecat/session/route.ts + route.test.ts, and the
  // design spec's "the response's dailyRoom/dailyToken are what the browser
  // joins with") -- NOT the room_url/token guessed in the task-5 plan draft.
  it('reaches live once the room is fetched and the client connects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ dailyRoom: 'https://x.daily.co/r', dailyToken: 't' })))
    mockClientInstance.connect.mockResolvedValue(undefined)
    const { result } = renderHook(() => useVoiceLive('d1', 'en'))
    await act(async () => { await result.current.connect('realistic') })
    await waitFor(() => expect(result.current.state).toBe('live'))
  })

  it('goes error/mic when the pipecat client fails to connect (mic denied etc.)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ dailyRoom: 'https://x.daily.co/r', dailyToken: 't' })))
    mockClientInstance.connect.mockRejectedValue(new Error('permission denied'))
    const { result } = renderHook(() => useVoiceLive('d1', 'en'))
    await act(async () => { await result.current.connect('realistic') })
    await waitFor(() => expect(result.current.state).toBe('error'))
    expect(result.current.errorKind).toBe('mic')
  })

  it('disconnect moves state to ended', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ dailyRoom: 'https://x.daily.co/r', dailyToken: 't' })))
    mockClientInstance.connect.mockResolvedValue(undefined)
    mockClientInstance.disconnect.mockResolvedValue(undefined)
    const { result } = renderHook(() => useVoiceLive('d1', 'en'))
    await act(async () => { await result.current.connect('realistic') })
    await waitFor(() => expect(result.current.state).toBe('live'))
    await act(async () => { await result.current.disconnect() })
    expect(result.current.state).toBe('ended')
  })

  it('appends only final userTranscript events as rep turns, and botTranscript events as doctor turns', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ dailyRoom: 'https://x.daily.co/r', dailyToken: 't' })))
    mockClientInstance.connect.mockResolvedValue(undefined)
    const { result } = renderHook(() => useVoiceLive('d1', 'en'))
    await act(async () => { await result.current.connect('realistic') })
    await waitFor(() => expect(result.current.state).toBe('live'))

    const onCalls = mockClientInstance.on.mock.calls as [string, (data: unknown) => void][]
    const userHandler = onCalls.find(([event]) => event === 'userTranscript')?.[1]
    const botHandler = onCalls.find(([event]) => event === 'botTranscript')?.[1]
    expect(userHandler).toBeDefined()
    expect(botHandler).toBeDefined()

    act(() => { userHandler!({ text: 'partial', final: false, timestamp: 't', user_id: 'u' }) })
    expect(result.current.transcript).toEqual([])
    act(() => { userHandler!({ text: 'Hello doctor', final: true, timestamp: 't', user_id: 'u' }) })
    act(() => { botHandler!({ text: 'Hello rep' }) })
    expect(result.current.transcript).toEqual([
      { role: 'rep', text: 'Hello doctor' },
      { role: 'doctor', text: 'Hello rep' },
    ])
  })
})
