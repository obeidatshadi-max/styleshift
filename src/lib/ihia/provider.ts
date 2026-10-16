import { createAnthropicComplete, type CompleteFn } from '@/agents/llm'

const fields = ['expression', 'literal_meaning', 'contextual_meaning', 'specialty', 'kind', 'uncertainty', 'example']
const schema = { type: 'object', additionalProperties: false, required: ['suggestions'], properties: {
  suggestions: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'object', additionalProperties: false,
    required: fields, properties: Object.fromEntries(fields.map(field => [field, field === 'kind'
      ? { type: 'string', enum: ['dialect', 'medical', 'pharmacy', 'workflow'] } : { type: 'string' }])) } },
} }

/** Reuse existing server credentials. No runtime silent provider retry and no key logging. */
export function suggestionCompletion(): CompleteFn | null {
  const provider = process.env.IHIA_SUGGESTION_PROVIDER ?? (process.env.OPENAI_API_KEY ? 'openai' : 'anthropic')
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY ? createAnthropicComplete(process.env.ANTHROPIC_API_KEY) : null
  if (provider !== 'openai' || !process.env.OPENAI_API_KEY) return null
  const key = process.env.OPENAI_API_KEY
  return async ({ system, prompt, maxTokens }) => {
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({ model: 'gpt-4.1-mini', instructions: system, input: prompt,
          max_output_tokens: maxTokens, store: false,
          text: { format: { type: 'json_schema', name: 'ihia_suggestions', strict: true, schema } } }),
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
