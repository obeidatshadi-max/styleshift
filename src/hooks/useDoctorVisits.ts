'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
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
    const { data } = await supabase
      .from('doctor_visits')
      .insert({ ...input, doctor_id: doctorId, rep_id: user.id })
      .select()
      .single()
    if (data) setVisits(prev => [data as DoctorVisit, ...prev])
    return (data as DoctorVisit) ?? null
  }, [supabase, doctorId])

  return { visits, loading, addVisit, reload: load }
}
