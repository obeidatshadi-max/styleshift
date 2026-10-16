import type { CompleteFn } from './llm'

/** Server-only JSON completion seam. No provider response/credential logging or response storage. */
export function createOpenAiJsonComplete(key: string, format: Record<string, unknown> = { type: 'json_object' }): CompleteFn {
  return async ({ system, prompt, maxTokens }) => {
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({ model: 'gpt-4.1-mini', instructions: system, input: prompt,
          max_output_tokens: maxTokens, store: false, text: { format } }),
      })
      if (!response.ok) return null
      const data = await response.json()
      if (data.status !== 'completed' || !Array.isArray(data.output)) return null
      const text = data.output.flatMap((item: { content?: { type?: string; text?: string }[] }) => item.content ?? [])
        .filter((item: { type?: string; text?: string }) => item.type === 'output_text' && typeof item.text === 'string')
        .map((item: { text: string }) => item.text).join('')
      return text || null
    } catch { return null }
  }
}
