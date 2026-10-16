import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { suggestionCompletion } from './provider'
beforeEach(() => {
  vi.stubEnv('IHIA_SUGGESTION_PROVIDER', '')
  vi.stubEnv('OPENAI_API_KEY', '')
  vi.stubEnv('ANTHROPIC_API_KEY', '')
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
const args = { system: 'Return unverified JSON', prompt: '{}', maxTokens: 2400 }
describe('IHIA text-provider boundary', () => {
  it('uses the existing OpenAI key with structured output and storage disabled', async () => {
    vi.stubEnv('IHIA_SUGGESTION_PROVIDER', 'openai'); vi.stubEnv('OPENAI_API_KEY', 'test-only')
    const fetch = vi.fn().mockResolvedValue(Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: '{"suggestions":[]}' }] }] }))
    vi.stubGlobal('fetch', fetch)
    expect(await suggestionCompletion()!(args)).toBe('{"suggestions":[]}')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ model: 'gpt-4.1-mini', store: false,
      text: { format: { type: 'json_schema', strict: true } } })
    expect(fetch.mock.calls[0][0]).not.toContain('test-only')
  })
  it.each([{ status: 'incomplete', output: [] }, { status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'No' }] }] }])('rejects incomplete/refused responses', async data => {
    vi.stubEnv('IHIA_SUGGESTION_PROVIDER', 'openai'); vi.stubEnv('OPENAI_API_KEY', 'test-only')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)))
    expect(await suggestionCompletion()!(args)).toBeNull()
  })
  it('does not expose provider diagnostics or retry another provider', async () => {
    vi.stubEnv('IHIA_SUGGESTION_PROVIDER', 'openai'); vi.stubEnv('OPENAI_API_KEY', 'test-only'); vi.stubEnv('ANTHROPIC_API_KEY', 'other')
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: 'private diagnostics' }, { status: 401 }))
    vi.stubGlobal('fetch', fetch)
    expect(await suggestionCompletion()!(args)).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('requires valid configuration', () => {
    expect(suggestionCompletion()).toBeNull()
    vi.stubEnv('IHIA_SUGGESTION_PROVIDER', 'openai')
    expect(suggestionCompletion()).toBeNull()
    vi.stubEnv('IHIA_SUGGESTION_PROVIDER', 'unsupported'); vi.stubEnv('OPENAI_API_KEY', 'test-only')
    expect(suggestionCompletion()).toBeNull()
  })
  it('can select the existing Anthropic adapter explicitly', () => {
    vi.stubEnv('IHIA_SUGGESTION_PROVIDER', 'anthropic'); vi.stubEnv('ANTHROPIC_API_KEY', 'test-only')
    expect(typeof suggestionCompletion()).toBe('function')
  })
})
