'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'

export interface DoctorCoachDebrief {
  id: string
  created_at: string
  objective: string
  nextAction: string
}

interface Row {
  id: string
  created_at: string
  objective: string | null
  nextAction: string | null
}

/** A doctor's saved AI Coach debriefs, newest first. Reads only the objective and
 * next action out of the stored JSON, not the rep's whole account of the call.
 * Debriefs saved before the Coach asked which doctor a call was with carry no
 * doctorId and so belong to no doctor's timeline. */
export function useDoctorCoachDebriefs(doctorId: string) {
  const supabase = createClient()
  const [debriefs, setDebriefs] = useState<DoctorCoachDebrief[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('coach_debriefs')
      .select('id, created_at, objective:input->>objective, nextAction:result->report->>nextAction')
      .eq('input->>doctorId', doctorId)
      .eq('rep_id', user.id)
      .order('created_at', { ascending: false })
    setDebriefs(((data as unknown as Row[]) ?? []).map(row => ({
      id: row.id,
      created_at: row.created_at,
      objective: row.objective ?? '',
      nextAction: row.nextAction ?? '',
    })))
    setLoading(false)
  }, [supabase, doctorId])

  useEffect(() => { load() }, [load])

  return { debriefs, loading, reload: load }
}
