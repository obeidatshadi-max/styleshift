/**
 * Small request timer that reports steps in a `Server-Timing` response header.
 * Browsers show the header in DevTools (Network > Timing), and scripts can read it
 * with performance.getEntriesByType('resource')[i].serverTiming or response.headers.
 *
 * Only durations and fixed step names go in the header: never ids, names or data.
 */
export interface ServerTimer {
  /** Run `fn`, record how long it took under `name`, and return its result. */
  time<T>(name: string, fn: () => PromiseLike<T> | T): Promise<T>
  /** Record a duration measured elsewhere. */
  add(name: string, ms: number): void
  /** The header value, with a `total` entry measured from when the timer was made. */
  header(): string
}

const NAME_RE = /^[a-z0-9_-]{1,40}$/

export function createServerTimer(now: () => number = () => performance.now()): ServerTimer {
  const start = now()
  const entries: { name: string; ms: number }[] = []

  function add(name: string, ms: number) {
    // Fixed step names only: the header is visible to the browser.
    if (!NAME_RE.test(name)) throw new Error(`bad server-timing name: ${name}`)
    entries.push({ name, ms })
  }

  return {
    async time(name, fn) {
      const t0 = now()
      try {
        return await fn()
      } finally {
        add(name, now() - t0)
      }
    },
    add,
    header() {
      // Same name twice gets a numbered suffix so DevTools shows both.
      const seen = new Map<string, number>()
      const parts = entries.map(({ name, ms }) => {
        const n = (seen.get(name) ?? 0) + 1
        seen.set(name, n)
        return `${n > 1 ? `${name}-${n}` : name};dur=${ms.toFixed(1)}`
      })
      parts.push(`total;dur=${(now() - start).toFixed(1)}`)
      return parts.join(', ')
    },
  }
}

/** Set (or append to) the Server-Timing header on a response and return it. */
export function withServerTiming<R extends { headers: Headers }>(res: R, timer: ServerTimer, prefix?: string): R {
  let value = timer.header()
  if (prefix) value = value.split(', ').map(p => `${prefix}-${p}`).join(', ')
  res.headers.append('Server-Timing', value)
  return res
}
