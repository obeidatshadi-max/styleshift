'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { enqueueWrite, looksOffline, listPendingWrites } from '@/lib/offline-queue'
import type { DoctorVisit, DoctorVisitInput } from '@/types/game'

/** A doctor's visit timeline — real visits and auto-logged practice sessions. */
export function useDoctorVisits(doctorId: string) {
  const [supabase] = useState(createClient)
  const [visits, setVisits] = useState<DoctorVisit[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setVisits([]); setLoading(false); return }
    const { data } = await supabase
      .from('doctor_visits')
      .select('*')
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false })
    const pending = await listPendingWrites().catch(() => [])
    const persisted = (data as DoctorVisit[]) ?? []
    const ids = new Set(persisted.map(v => v.id))
    const pendingVisits = pending.filter(p => p.table === 'doctor_visits' && p.payload.rep_id === user.id && p.payload.doctor_id === doctorId && !ids.has(String(p.payload.id)))
      .map(p => ({ ...p.payload, id: `offline-${p.payload.id}`, created_at: p.payload.created_at ?? p.created_at } as unknown as DoctorVisit))
    setVisits(prev => {
      const offline = [...pendingVisits, ...prev.filter(v => v.id.startsWith('offline-'))]
      const seen = new Set<string>()
      return [...offline.filter(v => { if (seen.has(v.id)) return false; seen.add(v.id); return true }), ...persisted]
    })
    setLoading(false)
  }, [supabase, doctorId])

  useEffect(() => {
    void load()
    const synced = () => { void load() }
    window.addEventListener('styleshift:offline-synced', synced)
    return () => window.removeEventListener('styleshift:offline-synced', synced)
  }, [load])

  const addVisit = useCallback(async (input: DoctorVisitInput): Promise<DoctorVisit | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const payload = { ...input, id: crypto.randomUUID(), created_at: new Date().toISOString(), doctor_id: doctorId, rep_id: user.id }
    let data: DoctorVisit | null = null
    let error: { message: string } | null = null
    try {
      const response = await supabase.from('doctor_visits').insert(payload).select().single()
      data = response.data as DoctorVisit | null
      error = response.error
    } catch (e) { error = { message: e instanceof Error ? e.message : String(e) } }

    if (error && looksOffline(error)) {
      // No connection — queue it so the rep isn't blocked, and show it in
      // the timeline now with a pending marker; it becomes a real row once
      // the offline sync flushes the queue (see OfflineSync).
      let pendingId: string
      try { pendingId = await enqueueWrite('doctor_visits', payload) } catch { return null }
      const pending = { ...payload, id: pendingId, created_at: new Date().toISOString() } as unknown as DoctorVisit
      setVisits(prev => [pending, ...prev])
      return pending
    }

    if (error) console.error('doctor_visits insert failed:', error.message)
    if (data) setVisits(prev => [data, ...prev])
    return data
  }, [supabase, doctorId])

  /** Ticks off the promise on a visit. Returns false when it could not be saved (e.g. offline). */
  const completePromise = useCallback(async (visitId: string): Promise<boolean> => {
    const doneAt = new Date().toISOString()
    const { error } = await supabase.from('doctor_visits').update({ promise_done_at: doneAt }).eq('id', visitId)
    if (error) return false
    setVisits(prev => prev.map(v => (v.id === visitId ? { ...v, promise_done_at: doneAt } : v)))
    return true
  }, [supabase])

  return { visits, loading, addVisit, completePromise, reload: load }
}
