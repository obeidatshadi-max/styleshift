import { afterEach, describe, expect, it, vi } from 'vitest'
import { AGENT_MODEL, DEFAULT_AGENT_MODEL, createAnthropicComplete, type CompleteUsage } from './llm'

afterEach(() => vi.unstubAllGlobals())

function stubFetch(body: unknown, status = 200) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}
const sentModel = (fn: ReturnType<typeof stubFetch>) =>
  JSON.parse((fn.mock.calls[0] as unknown as [string, { body: string }])[1].body).model

describe('createAnthropicComplete model choice', () => {
  it('keeps the production default when no model is given', async () => {
    const fn = stubFetch({ content: [{ text: 'hi' }] })
    await createAnthropicComplete('k')({ system: 's', prompt: 'p', maxTokens: 10 })
    expect(DEFAULT_AGENT_MODEL).toBe('claude-haiku-4-5-20251001')
    expect(AGENT_MODEL).toBe(DEFAULT_AGENT_MODEL)
    expect(sentModel(fn)).toBe('claude-haiku-4-5-20251001')
  })

  it('sends the model chosen for a benchmark run', async () => {
    const fn = stubFetch({ content: [{ text: 'hi' }] })
    await createAnthropicComplete('k', { model: 'claude-haiku-5-5' })({ system: 's', prompt: 'p', maxTokens: 10 })
    expect(sentModel(fn)).toBe('claude-haiku-5-5')
  })
})

describe('createAnthropicComplete reply handling', () => {
  it('reads the text block when a thinking block comes first (Haiku 5.5)', async () => {
    stubFetch({ content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: '{"ok":true}' }], stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 900, output_tokens_details: { thinking_tokens: 700 } } })
    const seen: CompleteUsage[] = []
    const out = await createAnthropicComplete('k', { onUsage: u => seen.push(u) })({ system: 's', prompt: 'p', maxTokens: 10 })
    expect(out).toBe('{"ok":true}')
    expect(seen[0].thinkingTokens).toBe(700)
  })

  it('returns null when the model stopped inside its thinking and wrote no text', async () => {
    stubFetch({ content: [{ type: 'thinking', thinking: '', signature: 's' }], stop_reason: 'max_tokens', usage: { input_tokens: 10, output_tokens: 10 } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await createAnthropicComplete('k')({ system: 's', prompt: 'p', maxTokens: 10 })).toBeNull()
  })

  it('joins several text blocks and still reads a single plain text block', async () => {
    stubFetch({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] })
    expect(await createAnthropicComplete('k')({ system: 's', prompt: 'p', maxTokens: 10 })).toBe('ab')
  })

  it('adds extra body fields and scales max_tokens only when asked', async () => {
    const fn = stubFetch({ content: [{ type: 'text', text: 'x' }] })
    await createAnthropicComplete('k', { extraBody: { output_config: { effort: 'low' } }, maxTokensMultiplier: 2 })({ system: 's', prompt: 'p', maxTokens: 100 })
    const body = JSON.parse((fn.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    expect(body.output_config).toEqual({ effort: 'low' })
    expect(body.max_tokens).toBe(200)
    const fn2 = stubFetch({ content: [{ type: 'text', text: 'x' }] })
    await createAnthropicComplete('k')({ system: 's', prompt: 'p', maxTokens: 100 })
    const b2 = JSON.parse((fn2.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    expect(b2.max_tokens).toBe(100)
    expect(Object.keys(b2).sort()).toEqual(['max_tokens', 'messages', 'model', 'system'])
  })
})

describe('createAnthropicComplete onUsage', () => {
  it('reports tokens, stop reason and latency but never the text', async () => {
    stubFetch({ content: [{ text: 'SECRET REPLY' }], stop_reason: 'end_turn', usage: { input_tokens: 120, output_tokens: 45 } })
    const seen: CompleteUsage[] = []
    const out = await createAnthropicComplete('k', { onUsage: u => seen.push(u) })({ system: 's', prompt: 'SECRET PROMPT', maxTokens: 10 })
    expect(out).toBe('SECRET REPLY')
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ ok: true, inputTokens: 120, outputTokens: 45, stopReason: 'end_turn', status: 200, model: DEFAULT_AGENT_MODEL })
    expect(seen[0].latencyMs).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify(seen[0])).not.toMatch(/SECRET/)
  })

  it('reports a rejected model as a failed call with its HTTP status', async () => {
    stubFetch({ error: { type: 'not_found_error', message: 'model' } }, 404)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const seen: CompleteUsage[] = []
    const out = await createAnthropicComplete('k', { model: 'nope', onUsage: u => seen.push(u) })({ system: 's', prompt: 'p', maxTokens: 10 })
    expect(out).toBeNull()
    expect(seen[0]).toMatchObject({ ok: false, status: 404, model: 'nope', inputTokens: null })
  })

  it('reports a network failure with no status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom') }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const seen: CompleteUsage[] = []
    const out = await createAnthropicComplete('k', { onUsage: u => seen.push(u) })({ system: 's', prompt: 'p', maxTokens: 10 })
    expect(out).toBeNull()
    expect(seen[0]).toMatchObject({ ok: false, status: null })
  })
})
