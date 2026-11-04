import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase-browser', () => ({ createClient: vi.fn() }))
import { MAX_ROLEPLAY_AUDIO_BYTES } from './assemblyai-client'
import { MAX_RECORDING_SEC, RECORDING_BITS_PER_SECOND, RECORDING_SIZE_GUARD_BYTES, RECORDING_WARNING_SEC } from './roleplay-limits'

describe('roleplay recording limits', () => {
  it('keeps the size guard below the upload cap, with room for the last chunk', () => {
    expect(RECORDING_SIZE_GUARD_BYTES).toBeLessThan(MAX_ROLEPLAY_AUDIO_BYTES)
    expect(MAX_ROLEPLAY_AUDIO_BYTES - RECORDING_SIZE_GUARD_BYTES).toBeGreaterThanOrEqual(200_000)
  })
  it('fits the full time limit at the target bitrate under the size guard', () => {
    const bytesAtLimit = (RECORDING_BITS_PER_SECOND / 8) * MAX_RECORDING_SEC
    expect(bytesAtLimit).toBeLessThan(RECORDING_SIZE_GUARD_BYTES)
  })
  it('warns before the limit, never after it', () => {
    expect(RECORDING_WARNING_SEC).toBeGreaterThan(0)
    expect(RECORDING_WARNING_SEC).toBeLessThan(MAX_RECORDING_SEC)
  })
})
