'use client'
import type { SupabaseClient } from '@supabase/supabase-js'

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
  const stablePayload = { ...payload, id: payload.id ?? crypto.randomUUID() }
  const entry: Omit<PendingWrite, 'id'> = { table, payload: stablePayload, created_at: new Date().toISOString() }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).add(entry)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
  return `offline-${stablePayload.id}`
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
  const msg = err instanceof Error ? err.message : typeof err === 'object' && err !== null && 'message' in err ? String(err.message) : String(err ?? '')
  return /failed to fetch|network|load failed/i.test(msg)
}

/**
 * Replays every queued write in order, via the given Supabase client.
 * Stops on transport failure. Rejected independent visits stay queued while
 * later valid visits can sync. Replays are scoped to the authenticated owner.
 */
export async function replayPendingWrites(
  supabase: SupabaseClient, pending: PendingWrite[], remove: (id: number) => Promise<void>,
): Promise<{ flushed: number; failed: number }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { flushed: 0, failed: 0 }
  let flushed = 0, failed = 0
  for (const entry of pending.sort((a, b) => a.id - b.id)) {
    if (entry.payload.rep_id !== user.id) continue
    if (entry.table !== 'doctor_visits' || !entry.payload.id) { failed++; continue }
    try {
      const { error } = await supabase.from(entry.table).insert(entry.payload)
      if (error) {
        if (error.code === '23505') {
          const { data } = await supabase.from(entry.table).select('*').eq('id', entry.payload.id).eq('rep_id', user.id).maybeSingle()
          // Only acknowledge this exact operation, never a different uniqueness conflict.
          if (!data || Object.entries(entry.payload).some(([k, v]) => k !== 'created_at' && data[k] !== v)) { failed++; continue }
        } else {
          if (looksOffline(error.message)) break
          failed++; continue // Keep a rejected write visible without starving later independent visits.
        }
      }
      await remove(entry.id); flushed++
    } catch { failed++; break }
  }
  return { flushed, failed }
}

let flushing: Promise<{ flushed: number; failed: number }> | null = null
export function flushPendingWrites(supabase: SupabaseClient): Promise<{ flushed: number; failed: number }> {
  if (flushing) return flushing
  flushing = (async () => {
    const pending = await listPendingWrites()
    // Upgrade legacy entries before sending, so a lost response is safe on the next replay.
    for (const entry of pending) if (!entry.payload.id) {
      entry.payload.id = crypto.randomUUID()
      const db = await openDb()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(entry)
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error)
      })
      db.close()
    }
    return replayPendingWrites(supabase, pending, removePendingWrite)
  })().finally(() => { flushing = null })
  return flushing
}
