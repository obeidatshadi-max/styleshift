import { randomUUID } from 'node:crypto'

/**
 * Test-only, in-memory stand-in for the slice of the supabase-js query builder
 * that /api/arena uses (select/eq/is/order/maybeSingle/single, insert, update,
 * upsert, delete, exact head counts). Enforces the arena tables' unique keys and
 * fills their column defaults, so route tests exercise real flows end to end.
 */

type Row = Record<string, unknown>
const UNIQUE: Record<string, string[][]> = {
  arena_classes: [['id'], ['code']],
  arena_teams: [['class_id', 'id']],
  arena_participants: [['id']],
  arena_marks: [['class_id', 'key']],
}
let clock = Date.parse('2026-11-01T09:00:00Z')
const now = () => new Date(clock++).toISOString()
const DEFAULTS: Record<string, () => Row> = {
  arena_classes: () => ({ id: randomUUID(), phase: 'lobby', reveal: false, board: null, created_at: now(), expires_at: new Date(clock + 60 * 864e5).toISOString() }),
  arena_teams: () => ({ motto: '', photo: null, photo_version: 0, post_answers: null, post_secs: null, post_auto: null, submitted_by: null, submitted_at: null, created_at: now() }),
  arena_participants: () => ({ id: randomUUID(), team_id: null, pre_answers: null, pre_secs: null, pre_submitted_at: null, created_at: now() }),
  arena_marks: () => ({ updated_at: now() }),
}

export function createFakeDb() {
  const tables: Record<string, Row[]> = { arena_classes: [], arena_teams: [], arena_participants: [], arena_marks: [] }
  const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
  const conflict = (table: string, row: Row, except?: Row) =>
    (UNIQUE[table] ?? []).some(cols => tables[table].some(r => r !== except && cols.every(c => r[c] === row[c])))

  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = []
    let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
    let payload: Row | Row[] | undefined
    let onConflict: string[] = []
    let head = false
    let wantCount = false
    let order: string | null = null
    let returning = false
    let single: 'one' | 'maybe' | null = null

    const run = () => {
      const rows = tables[table]
      const match = () => rows.filter(r => filters.every(f => f(r)))
      if (op === 'insert') {
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[]
        const made: Row[] = []
        for (const p of list) {
          const row = { ...DEFAULTS[table](), ...clone(p) }
          if (conflict(table, row)) return { data: null, error: { code: '23505', message: 'duplicate key' }, count: null }
          rows.push(row); made.push(row)
        }
        return finish(made)
      }
      if (op === 'upsert') {
        const p = clone(payload as Row)
        const existing = rows.find(r => onConflict.every(c => r[c] === p[c]))
        if (existing) Object.assign(existing, p)
        else rows.push({ ...DEFAULTS[table](), ...p })
        return { data: null, error: null, count: null }
      }
      if (op === 'update') {
        const hit = match()
        for (const r of hit) Object.assign(r, clone(payload as Row))
        return finish(hit)
      }
      if (op === 'delete') {
        const hit = new Set(match())
        tables[table] = rows.filter(r => !hit.has(r))
        return { data: null, error: null, count: null }
      }
      let hit = match()
      if (order) hit = [...hit].sort((a, b) => String(a[order!]).localeCompare(String(b[order!])))
      if (wantCount && head) return { data: null, error: null, count: hit.length }
      return finish(hit, true)
    }
    const finish = (hit: Row[], isSelect = false) => {
      if (!isSelect && !returning && !single) return { data: null, error: null, count: null }
      const data = clone(hit)
      if (single === 'one') return data.length === 1 ? { data: data[0], error: null, count: null } : { data: null, error: { code: 'PGRST116', message: 'not one row' }, count: null }
      if (single === 'maybe') return { data: data[0] ?? null, error: null, count: null }
      return { data, error: null, count: null }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (op === 'select') { wantCount = opts?.count === 'exact'; head = !!opts?.head } else returning = true
        return q
      },
      insert(p: Row | Row[]) { op = 'insert'; payload = p; return q },
      update(p: Row) { op = 'update'; payload = p; return q },
      upsert(p: Row, opts: { onConflict: string }) { op = 'upsert'; payload = p; onConflict = opts.onConflict.split(','); return q },
      delete() { op = 'delete'; return q },
      eq(c: string, v: unknown) { filters.push(r => r[c] === v); return q },
      is(c: string, v: null) { filters.push(r => (r[c] ?? null) === v); return q },
      order(c: string) { order = c; return q },
      maybeSingle() { single = 'maybe'; return Promise.resolve(run()) },
      single() { single = 'one'; return Promise.resolve(run()) },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
        try { return Promise.resolve(run()).then(res, rej) } catch (e) { return rej ? rej(e) : Promise.reject(e) }
      },
    }
    return q
  }
  return { from, tables }
}
