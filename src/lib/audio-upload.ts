// Well under Whisper's hard 25MB cap, generous for a capped ~3-minute
// recording at typical MediaRecorder webm/opus voice bitrates.
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024

export type AudioValidation =
  | { ok: true; blob: Blob }
  | { ok: false; error: 'bad_request' | 'audio_too_large' | 'invalid_audio_type'; status: number }

/**
 * Validates an uploaded audio FormData entry before it reaches Whisper —
 * rejects anything that isn't a real audio blob, is empty, exceeds the size
 * cap, or declares a non-audio MIME type. Duration itself is bounded
 * client-side (useAudioRecorder's auto-stop); this is the server-side
 * backstop, since duration can't be cheaply verified from bytes alone.
 */
export function validateAudioUpload(value: FormDataEntryValue | null): AudioValidation {
  if (!(value instanceof Blob)) return { ok: false, error: 'bad_request', status: 400 }
  if (value.size === 0) return { ok: false, error: 'bad_request', status: 400 }
  if (value.size > MAX_AUDIO_BYTES) return { ok: false, error: 'audio_too_large', status: 413 }
  if (value.type && !value.type.startsWith('audio/')) return { ok: false, error: 'invalid_audio_type', status: 415 }
  return { ok: true, blob: value }
}
