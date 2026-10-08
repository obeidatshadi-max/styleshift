export interface VocalLabel { label: string; score: number }
export interface VocalFeedback { emotions: VocalLabel[]; styles: VocalLabel[] }

function labels(value: unknown): VocalLabel[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is VocalLabel =>
    !!item && typeof item.label === 'string' && item.label.length <= 80 &&
    typeof item.score === 'number' && Number.isFinite(item.score) && item.score >= 0 && item.score <= 1,
  ).sort((a, b) => b.score - a.score).slice(0, 3)
}

export function parseVocalFeedback(value: unknown): VocalFeedback | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  const emotions = labels(data.emotions)
  const styles = labels(data.styles)
  return emotions.length || styles.length ? { emotions, styles } : null
}

/** Optional English-only acoustic feedback; provider failures leave practice available. */
export async function analyzeVocalDelivery(audio: Blob, lang: 'en' | 'ar'): Promise<VocalFeedback | null> {
  const key = process.env.ORUK_API_KEY
  if (lang !== 'en' || process.env.ORUK_ANALYSIS_ENABLED !== 'true' || !key) return null
  const form = new FormData()
  form.append('model', 'oruk-resonance')
  const type = audio.type.split(';')[0]
  const extension = ({ 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/flac': 'flac' } as Record<string, string>)[type] ?? 'webm'
  form.append('file', audio, `practice.${extension}`)
  try {
    const response = await fetch('https://speech-api.oruk.ai/v1/audio/analysis', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'X-Request-ID': crypto.randomUUID() },
      body: form,
      signal: AbortSignal.timeout(12000),
    })
    if (!response.ok) return null
    return parseVocalFeedback(await response.json())
  } catch { return null }
}
