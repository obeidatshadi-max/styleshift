import type { SessionRecord, SessionStore } from './types'

/** Process-local store for tests and local development. Stores deep copies so
 * callers cannot mutate persisted state by accident. A Supabase-backed store
 * implements the same two methods. */
export class InMemorySessionStore implements SessionStore {
  private records = new Map<string, SessionRecord>()

  async get(sessionId: string): Promise<SessionRecord | null> {
    const r = this.records.get(sessionId)
    return r ? structuredClone(r) : null
  }

  async save(record: SessionRecord): Promise<void> {
    this.records.set(record.session.sessionId, structuredClone(record))
  }

  get size(): number { return this.records.size }
}
