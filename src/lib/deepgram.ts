/** Deepgram Nova-3 Arabic transcription — swappable alternative to OpenAI
 * Whisper for the turn-based objection drill's Arabic path. Nova-3 Arabic
 * (Jan 2026) supports 17 regional dialects including Iraqi (ar-IQ), unlike
 * Whisper's single generic 'ar'. Gated behind its own DEEPGRAM_API_KEY
 * (Netlify env — separate from the Pipecat agent's own copy of this key)
 * so quality can be compared against Whisper before deciding to keep it;
 * missing key or any failure falls back to null, same graceful-degrade
 * pattern as oruk.ts's analyzeVocalDelivery. */
export async function transcribeWithDeepgram(audio: Blob, lang: 'en' | 'ar'): Promise<string | null> {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) return null
  const language = lang === 'ar' ? 'ar-IQ' : 'en'
  let res: Response
  try {
    res = await fetch(`https://api.deepgram.com/v1/listen?model=nova-3&language=${language}&smart_format=true`, {
      method: 'POST',
      headers: { authorization: `Token ${apiKey}`, 'content-type': audio.type || 'audio/webm' },
      body: audio,
      signal: AbortSignal.timeout(15_000),
    })
  } catch { return null }
  if (!res.ok) return null
  const data = await res.json().catch(() => null) as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] } } | null
  const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim()
  return transcript || null
}
