import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createEmptySession } from '@/schemas/session/factory'
import { createSupabasePersonaLoader, createSupabaseSessionStore } from './supabase'
import type { SessionRecord } from './types'

/** Minimal chainable stand-in for the query builder: every filter returns the
 * builder; terminal calls resolve to `result`. Records what was called. */
function fakeClient(tables: Record<string, { data?: unknown; error?: { message: string } | null }>) {
  const calls: { table: string; op: string; args: unknown[] }[] = []
  const from = (table: string) => {
    const result = tables[table] ?? { data: null, error: null }
    const builder: Record<string, unknown> = {}
    for (const op of ['select', 'eq', 'upsert']) {
      builder[op] = (...args: unknown[]) => { calls.push({ table, op, args }); return builder }
    }
    builder.maybeSingle = () => Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
    builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: result.data ?? null, error: result.error ?? null })
    return builder
  }
  return { client: { from } as unknown as SupabaseClient, calls }
}

const record = (): SessionRecord => ({ session: createEmptySession('sess-1', 'rep-1'), phase: 'in_roleplay', trace: [], report: null })

describe('createSupabaseSessionStore', () => {
  it('upserts the whole record keyed by session id, denormalizing rep, doctor and phase', async () => {
    const { client, calls } = fakeClient({ agent_sessions: { error: null } })
    const r = record(); r.session.physician.doctorId = 'doc-1'
    await createSupabaseSessionStore(client).save(r)
    const upsert = calls.find(c => c.op === 'upsert')!
    expect(upsert.table).toBe('agent_sessions')
    expect(upsert.args[0]).toMatchObject({ id: 'sess-1', rep_id: 'rep-1', doctor_id: 'doc-1', phase: 'in_roleplay', record: r })
    expect(upsert.args[1]).toEqual({ onConflict: 'id' })
  })

  it('throws on a write error so the orchestrator can report store_failed', async () => {
    const { client } = fakeClient({ agent_sessions: { error: { message: 'rls' } } })
    await expect(createSupabaseSessionStore(client).save(record())).rejects.toThrow(/write failed: rls/)
  })

  it('returns the stored record, null when absent, and throws on read error', async () => {
    const r = record()
    expect(await createSupabaseSessionStore(fakeClient({ agent_sessions: { data: { record: r } } }).client).get('sess-1')).toEqual(r)
    expect(await createSupabaseSessionStore(fakeClient({ agent_sessions: { data: null } }).client).get('nope')).toBeNull()
    await expect(createSupabaseSessionStore(fakeClient({ agent_sessions: { error: { message: 'boom' } } }).client).get('x')).rejects.toThrow(/read failed/)
  })
})

describe('createSupabasePersonaLoader', () => {
  const doctor = {
    id: 'doc-1', rep_id: 'rep-1', name: 'Dr. Noor', specialty: 'oncology', workplace: null, style: 'analytical', assertiveness: null, responsiveness: null,
    key_phrases: null, objections: [], objection_notes: null, notes: null, created_at: '', updated_at: '',
  }
  const profile = { id: 'rep-1', display_name: 'Rana', company_id: null, sps_top_key: null, sps_profile: null }

  it('scopes the doctor lookup to the rep and maps it to persona data', async () => {
    const { client, calls } = fakeClient({ doctors: { data: doctor }, profiles: { data: profile } })
    const p = await createSupabasePersonaLoader(client).load('rep-1', 'doc-1', { difficulty: 'realistic' })
    expect(p?.physician.name).toBe('Dr. Noor')
    expect(p?.rep.displayName).toBe('Rana')
    const doctorEqs = calls.filter(c => c.table === 'doctors' && c.op === 'eq').map(c => c.args)
    expect(doctorEqs).toContainEqual(['id', 'doc-1'])
    expect(doctorEqs).toContainEqual(['rep_id', 'rep-1'])
  })

  it('returns null when the doctor or profile is missing', async () => {
    const load = (tables: Parameters<typeof fakeClient>[0]) => createSupabasePersonaLoader(fakeClient(tables).client).load('rep-1', 'doc-1', { difficulty: 'realistic' })
    expect(await load({ doctors: { data: null }, profiles: { data: profile } })).toBeNull()
    expect(await load({ doctors: { data: doctor }, profiles: { data: null } })).toBeNull()
  })
})

void vi
