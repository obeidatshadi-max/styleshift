export type VoiceMode = 'objection' | 'opening' | 'question' | 'fab' | 'closing'

export type VoiceEventStage =
  | 'recording_start' | 'mic_denied' | 'not_configured' | 'rate_limited'
  | 'api_error' | 'bad_response' | 'network_error' | 'tts_failed'
  | 'turn_complete' | 'session_complete'

/**
 * The generic-failure taxonomy shown to the rep — a subset of VoiceEventStage
 * (excludes 'not_configured'/'rate_limited', which already have their own
 * distinct UI phase in every hook, and 'tts_failed', which degrades silently
 * to text-only rather than blocking the session).
 */
export type VoiceErrorKind = 'mic' | 'network' | 'api' | 'bad_response'

export const VOICE_MODES: VoiceMode[] = ['objection', 'opening', 'question', 'fab', 'closing']
export const VOICE_EVENT_STAGES: VoiceEventStage[] = [
  'recording_start', 'mic_denied', 'not_configured', 'rate_limited',
  'api_error', 'bad_response', 'network_error', 'tts_failed',
  'turn_complete', 'session_complete',
]

/**
 * Fire-and-forget funnel event for one of the 5 AI-voice-partner modes.
 * Never awaited by callers and never throws — a dropped event must not
 * block or visibly affect the rep's session. `lang` is required (not just
 * optional meta) so the funnel can be sliced by language — without it,
 * nothing could ever confirm or refute whether Arabic sessions fail more
 * than English ones.
 */
export function logVoiceEvent(mode: VoiceMode, lang: 'en' | 'ar', stage: VoiceEventStage, meta?: Record<string, unknown>): void {
  fetch('/api/voice-events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode, stage, meta: { lang, ...meta } }),
  }).catch(() => { /* best-effort */ })
}
