/** Minimal text-completion seam so agents can be tested without the network
 * and swapped to another provider later. Same Anthropic call shape the
 * existing routes use (Haiku 4.5, x-api-key + anthropic-version headers). */
export interface CompleteArgs { system: string; prompt: string; maxTokens: number }
export type CompleteFn = (args: CompleteArgs) => Promise<string | null>

export const AGENT_MODEL = 'claude-haiku-4-5-20251001'

export function createAnthropicComplete(apiKey: string): CompleteFn {
  return async ({ system, prompt, maxTokens }) => {
    let res: Response
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: AGENT_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
      })
    } catch (e) {
      console.error('[llm] anthropic request failed', e instanceof Error ? e.message : 'unknown')
      return null
    }
    if (!res.ok) {
      // Status + error type only — never the request body or the key.
      let err: { error?: { type?: string; message?: string } } | null = null
      try { err = await res.json() } catch { /* diagnostics only — never let logging break the failure path */ }
      console.error('[llm] anthropic non-OK', res.status, err?.error?.type ?? 'unknown', err?.error?.message?.slice(0, 200) ?? '')
      return null
    }
    const data = await res.json().catch(() => null) as { content?: { text?: string }[]; stop_reason?: string } | null
    // A max_tokens stop means the JSON the callers parse is cut off.
    if (data?.stop_reason === 'max_tokens') console.error('[llm] anthropic truncated at max_tokens', maxTokens)
    return data?.content?.[0]?.text ?? null
  }
}
