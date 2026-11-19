// Limits for a recorded roleplay / practice conversation.
//
// The audio is uploaded as base64 JSON through a Netlify function, which caps
// the upload at 4 MiB (MAX_ROLEPLAY_AUDIO_BYTES in assemblyai-client.ts). The
// recorder stops by itself before either limit below is passed, so a long call
// is never lost: it goes straight to analysis.

/** A conversation longer than this is cut off and analysed as recorded. */
export const MAX_RECORDING_SEC = 600

/** Seconds before the cut-off at which the rep sees a countdown. */
export const RECORDING_WARNING_SEC = 60

/** Opus/AAC speech bitrate. 48 kbps is about 6 KB/s, so 10 minutes is about 3.6 MB. */
export const RECORDING_BITS_PER_SECOND = 48_000

/** Stop when the recorded bytes reach this, whatever the clock says. A phone
 * that ignores the bitrate hint (some iOS versions) can record far more per
 * second; this keeps the file below the 4 MiB upload cap (4,194,304 bytes). */
export const RECORDING_SIZE_GUARD_BYTES = 3_800_000

/** Seconds of audio needed before the phone's real recording rate is trusted. */
export const RATE_SAMPLE_SEC = 15

/**
 * How long this recording can really last on this phone. Normally the time
 * limit; on a phone that records more bytes per second than asked, the size
 * guard ends it earlier, and the rep must see that real limit in the
 * countdown, not the 10 minutes that will never be reached.
 */
export function effectiveLimitSec(elapsedSec: number, bytesRecorded: number): number {
  if (elapsedSec < RATE_SAMPLE_SEC || bytesRecorded <= 0) return MAX_RECORDING_SEC
  const bySize = Math.floor((elapsedSec * RECORDING_SIZE_GUARD_BYTES) / bytesRecorded)
  return Math.max(elapsedSec, Math.min(MAX_RECORDING_SEC, bySize))
}

/** 1:05 style time for the screens. */
export function formatMinSec(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
