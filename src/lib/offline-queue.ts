'use client'

// A tiny IndexedDB-backed write queue. Field reps lose signal in clinics and
// rural areas — a write made offline (logging a visit, mainly) shouldn't be
// lost or block the rep. Each entry is a plain Supabase insert this queue
// replays once the network is back, in the order it was written.

const DB_NAME = 'styleshift-offline'
const STORE = 'pending_writes'

export interface PendingWrite {
  id: number
  table: string
  payload: Record<string, unknown>
  created_at: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Queues a write for later. Returns a locally-synthesized id for optimistic UI. */
export async function enqueueWrite(table: string, payload: Record<string, unknown>): Promise<string> {
  const db = await openDb()
  const entry: Omit<PendingWrite, 'id'> = { table, payload, created_at: new Date().toISOString() }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).add(entry)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
  return `offline-${crypto.randomUUID()}`
}

export async function listPendingWrites(): Promise<PendingWrite[]> {
  const db = await openDb()
  const out = await new Promise<PendingWrite[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result as PendingWrite[])
    req.onerror = () => reject(req.error)
  })
  db.close()
  return out
}

async function removePendingWrite(id: number): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

/**
 * True when a Supabase (or fetch) failure looks like "no network", as
 * opposed to a real server-side rejection (validation, RLS, auth) — only
 * the former is worth queuing for a later retry.
 */
export function looksOffline(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /failed to fetch|network|load failed/i.test(msg)
}

/**
 * Replays every queued write in order, via the given Supabase client.
 * Stops at the first failure (keeps remaining entries queued) so a bad
 * connection doesn't drop writes out of order.
 */
export async function flushPendingWrites(
  supabase: { from: (table: string) => { insert: (payload: Record<string, unknown>) => PromiseLike<{ error: unknown }> } }
): Promise<{ flushed: number }> {
  const pending = await listPendingWrites()
  let flushed = 0
  for (const entry of pending.sort((a, b) => a.id - b.id)) {
    const { error } = await supabase.from(entry.table).insert(entry.payload)
    if (error) break
    await removePendingWrite(entry.id)
    flushed++
  }
  return { flushed }
}
