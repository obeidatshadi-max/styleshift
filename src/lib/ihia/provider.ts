import { createAnthropicComplete, type CompleteFn } from '@/agents/llm'
import { createOpenAiJsonComplete } from '@/agents/openai-complete'

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
  return createOpenAiJsonComplete(process.env.OPENAI_API_KEY,
    { type: 'json_schema', name: 'ihia_suggestions', strict: true, schema })
}
