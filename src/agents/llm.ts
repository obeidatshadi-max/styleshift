/** Minimal text-completion seam so agents can be tested without the network
 * and swapped to another provider later. Same Anthropic call shape the
 * existing routes use (Haiku 4.5, x-api-key + anthropic-version headers). */
export interface CompleteArgs { system: string; prompt: string; maxTokens: number }
export type CompleteFn = (args: CompleteArgs) => Promise<string | null>

/** Production default. Changing this changes every agent; the A/B benchmark
 * (tools/benchmark) picks a model per run through `options.model` instead. */
export const DEFAULT_AGENT_MODEL = 'claude-haiku-4-5-20251001'
export const AGENT_MODEL = DEFAULT_AGENT_MODEL

/** Per-call metadata for measurement. Numbers and ids only: never the prompt,
 * the reply text or the key. */
export interface CompleteUsage {
  model: string
  ok: boolean
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
  stopReason: string | null
  /** HTTP status, or null when the request never completed. */
  status: number | null
  /** Tokens spent on thinking (already included in outputTokens), when the model reports them. */
  thinkingTokens: number | null
}

export interface AnthropicCompleteOptions {
  /** Defaults to DEFAULT_AGENT_MODEL, so existing callers behave exactly as before. */
  model?: string
  /** Extra top-level request fields, for example { output_config: { effort: 'low' } }. Benchmark only. */
  extraBody?: Record<string, unknown>
  /** Multiplies the caller's max_tokens. Haiku 5.5 counts thinking tokens against max_tokens. Benchmark only. */
  maxTokensMultiplier?: number
  /** Called once per request, success or failure. Not set in production. */
  onUsage?: (usage: CompleteUsage) => void
}

export function createAnthropicComplete(apiKey: string, options: AnthropicCompleteOptions = {}): CompleteFn {
  const model = options.model ?? DEFAULT_AGENT_MODEL
  return async ({ system, prompt, maxTokens }) => {
    let res: Response
    const started = Date.now()
    const report = (u: Partial<CompleteUsage>) => options.onUsage?.({
      model, ok: false, inputTokens: null, outputTokens: null, latencyMs: Date.now() - started, stopReason: null, status: null, thinkingTokens: null, ...u,
    })
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model, max_tokens: Math.round(maxTokens * (options.maxTokensMultiplier ?? 1)), system,
          messages: [{ role: 'user', content: prompt }], ...options.extraBody,
        }),
      })
    } catch (e) {
      report({})
      console.error('[llm] anthropic request failed', e instanceof Error ? e.message : 'unknown')
      return null
    }
    if (!res.ok) {
      // Status + error type only — never the request body or the key.
      let err: { error?: { type?: string; message?: string } } | null = null
      try { err = await res.json() } catch { /* diagnostics only — never let logging break the failure path */ }
      console.error('[llm] anthropic non-OK', res.status, err?.error?.type ?? 'unknown', err?.error?.message?.slice(0, 200) ?? '')
      report({ status: res.status })
      return null
    }
    const data = await res.json().catch(() => null) as {
      content?: { type?: string; text?: string }[]; stop_reason?: string
      usage?: { input_tokens?: number; output_tokens?: number; output_tokens_details?: { thinking_tokens?: number } }
    } | null
    report({
      ok: !!data, status: res.status, stopReason: data?.stop_reason ?? null,
      inputTokens: data?.usage?.input_tokens ?? null, outputTokens: data?.usage?.output_tokens ?? null,
      thinkingTokens: data?.usage?.output_tokens_details?.thinking_tokens ?? null,
    })
    // A max_tokens stop means the JSON the callers parse is cut off.
    if (data?.stop_reason === 'max_tokens') console.error('[llm] anthropic truncated at max_tokens', maxTokens)
    // Models that think (Haiku 5.5) put a `thinking` block before the answer, so the
    // answer is every text block, never simply the first block. Haiku 4.5 returns one text block.
    const text = (data?.content ?? []).filter(b => b.type === undefined || b.type === 'text').map(b => b.text ?? '').join('')
    return text || null
  }
}
