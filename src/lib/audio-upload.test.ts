import { describe, it, expect } from 'vitest'
import { validateAudioUpload, MAX_AUDIO_BYTES } from './audio-upload'

function blob(bytes: number, type = 'audio/webm'): File {
  return new File([new Uint8Array(bytes)], 'audio.webm', { type })
}

describe('validateAudioUpload', () => {
  it('accepts a normal audio blob', () => {
    const result = validateAudioUpload(blob(1000))
    expect(result.ok).toBe(true)
  })

  it('rejects a non-Blob value', () => {
    const result = validateAudioUpload('not-a-blob')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('bad_request')
  })

  it('rejects null', () => {
    const result = validateAudioUpload(null)
    expect(result.ok).toBe(false)
  })

  it('rejects an empty blob', () => {
    const result = validateAudioUpload(blob(0))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('bad_request')
  })

  it('rejects a blob over the size cap', () => {
    const result = validateAudioUpload(blob(MAX_AUDIO_BYTES + 1))
    expect(result.ok).toBe(false)
    if (!result.ok) { expect(result.error).toBe('audio_too_large'); expect(result.status).toBe(413) }
  })

  it('accepts a blob exactly at the size cap', () => {
    const result = validateAudioUpload(blob(MAX_AUDIO_BYTES))
    expect(result.ok).toBe(true)
  })

  it('rejects a non-audio MIME type', () => {
    const result = validateAudioUpload(blob(1000, 'text/plain'))
    expect(result.ok).toBe(false)
    if (!result.ok) { expect(result.error).toBe('invalid_audio_type'); expect(result.status).toBe(415) }
  })

  it('accepts a blob with no declared type', () => {
    const result = validateAudioUpload(blob(1000, ''))
    expect(result.ok).toBe(true)
  })
})
