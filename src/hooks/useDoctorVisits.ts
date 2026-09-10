'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { enqueueWrite, looksOffline } from '@/lib/offline-queue'
import type { DoctorVisit, DoctorVisitInput } from '@/types/game'

/** A doctor's visit timeline — real visits and auto-logged practice sessions. */
export function useDoctorVisits(doctorId: string) {
  const supabase = createClient()
  const [visits, setVisits] = useState<DoctorVisit[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('doctor_visits')
      .select('*')
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false })
    setVisits((data as DoctorVisit[]) ?? [])
    setLoading(false)
  }, [supabase, doctorId])

  useEffect(() => { load() }, [load])

  const addVisit = useCallback(async (input: DoctorVisitInput): Promise<DoctorVisit | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const payload = { ...input, doctor_id: doctorId, rep_id: user.id }
    const { data, error } = await supabase.from('doctor_visits').insert(payload).select().single()

    if (error && looksOffline(error)) {
      // No connection — queue it so the rep isn't blocked, and show it in
      // the timeline now with a pending marker; it becomes a real row once
      // the offline sync flushes the queue (see OfflineSync).
      const pendingId = await enqueueWrite('doctor_visits', payload)
      const pending = { ...payload, id: pendingId, created_at: new Date().toISOString() } as unknown as DoctorVisit
      setVisits(prev => [pending, ...prev])
      return pending
    }

    if (error) console.error('doctor_visits insert failed:', error.message)
    if (data) setVisits(prev => [data as DoctorVisit, ...prev])
    return (data as DoctorVisit) ?? null
  }, [supabase, doctorId])

  return { visits, loading, addVisit, reload: load }
}
