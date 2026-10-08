/** Shared result type + tiny field readers for the hand-written validators in
 * src/schemas/*. The repo has no schema library; validators collect every
 * error (not just the first) so an admin form can show them all at once. */
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }

/** Text in each supported language. At least one language must be present. */
export interface LocalText { en?: string; ar?: string }

export class Reader {
  readonly errors: string[] = []
  constructor(private readonly data: Record<string, unknown>, private readonly prefix = '') {}
  private path(key: string) { return this.prefix ? `${this.prefix}.${key}` : key }
  fail(key: string, msg: string) { this.errors.push(`${this.path(key)}: ${msg}`) }

  str(key: string, opts: { max?: number } = {}): string {
    const v = this.data[key]
    if (typeof v !== 'string' || !v.trim()) { this.fail(key, 'is required'); return '' }
    if (v.trim().length > (opts.max ?? 2000)) this.fail(key, `must be at most ${opts.max ?? 2000} characters`)
    return v.trim()
  }
  optStr(key: string, opts: { max?: number } = {}): string | null {
    const v = this.data[key]
    if (v === undefined || v === null || v === '') return null
    if (typeof v !== 'string') { this.fail(key, 'must be text'); return null }
    if (v.trim().length > (opts.max ?? 2000)) this.fail(key, `must be at most ${opts.max ?? 2000} characters`)
    return v.trim() || null
  }
  oneOf<T extends string>(key: string, allowed: readonly T[], fallback?: T): T {
    const v = this.data[key]
    if (v === undefined && fallback !== undefined) return fallback
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
      this.fail(key, `must be one of: ${allowed.join(', ')}`)
      return (fallback ?? allowed[0]) as T
    }
    return v as T
  }
  optOneOf<T extends string>(key: string, allowed: readonly T[]): T | null {
    const v = this.data[key]
    if (v === undefined || v === null) return null
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) { this.fail(key, `must be one of: ${allowed.join(', ')}`); return null }
    return v as T
  }
  int(key: string, min: number, max: number, fallback?: number): number {
    const v = this.data[key]
    if (v === undefined && fallback !== undefined) return fallback
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) { this.fail(key, `must be a whole number from ${min} to ${max}`); return fallback ?? min }
    return v
  }
  num(key: string, min: number, max: number, fallback?: number): number {
    const v = this.data[key]
    if (v === undefined && fallback !== undefined) return fallback
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) { this.fail(key, `must be a number from ${min} to ${max}`); return fallback ?? min }
    return v
  }
  bool(key: string, fallback = false): boolean {
    const v = this.data[key]
    if (v === undefined) return fallback
    if (typeof v !== 'boolean') { this.fail(key, 'must be true or false'); return fallback }
    return v
  }
  strList(key: string, opts: { min?: number; max?: number; itemMax?: number } = {}): string[] {
    const v = this.data[key]
    if (v === undefined || v === null) { if ((opts.min ?? 0) > 0) this.fail(key, `needs at least ${opts.min} item(s)`); return [] }
    if (!Array.isArray(v) || v.some(i => typeof i !== 'string' || !i.trim())) { this.fail(key, 'must be a list of non-empty text'); return [] }
    const items = (v as string[]).map(i => i.trim())
    if (items.length < (opts.min ?? 0)) this.fail(key, `needs at least ${opts.min} item(s)`)
    if (items.length > (opts.max ?? 50)) this.fail(key, `allows at most ${opts.max ?? 50} items`)
    if (items.some(i => i.length > (opts.itemMax ?? 500))) this.fail(key, `items must be at most ${opts.itemMax ?? 500} characters`)
    return items
  }
  enumList<T extends string>(key: string, allowed: readonly T[], opts: { min?: number } = {}): T[] {
    const items = this.strList(key, opts)
    const bad = items.filter(i => !(allowed as readonly string[]).includes(i))
    if (bad.length) this.fail(key, `unknown value(s): ${bad.join(', ')}`)
    return [...new Set(items.filter(i => (allowed as readonly string[]).includes(i)))] as T[]
  }
  /** Nested object reader; errors are prefixed with the parent path. */
  obj(key: string): Reader {
    const v = this.data[key]
    if (!v || typeof v !== 'object' || Array.isArray(v)) { this.fail(key, 'must be an object'); return new Reader({}, this.path(key)) }
    return new Reader(v as Record<string, unknown>, this.path(key))
  }
  raw(key: string): unknown { return this.data[key] }
  /** Reads a LocalText ({en?, ar?}); optional unless `required`. */
  localText(key: string, opts: { required?: boolean; max?: number } = {}): LocalText {
    const v = this.data[key]
    if (v === undefined || v === null) { if (opts.required) this.fail(key, 'is required (en and/or ar)'); return {} }
    if (typeof v !== 'object' || Array.isArray(v)) { this.fail(key, 'must be {en?, ar?}'); return {} }
    const sub = new Reader(v as Record<string, unknown>, this.path(key))
    const out: LocalText = {}
    const en = sub.optStr('en', opts); const ar = sub.optStr('ar', opts)
    if (en) out.en = en
    if (ar) out.ar = ar
    this.errors.push(...sub.errors)
    if (opts.required && !out.en && !out.ar) this.fail(key, 'needs English and/or Arabic text')
    return out
  }
}

export function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : null
}

export function finish<T>(r: Reader, value: T): ValidationResult<T> {
  return r.errors.length ? { ok: false, errors: r.errors } : { ok: true, value }
}
