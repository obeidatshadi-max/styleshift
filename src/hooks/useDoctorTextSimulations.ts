'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'

export interface TextSimulationSummary {
  id: string
  created_at: string
  /** 0-100 weighted competency score; null when nothing was scored. */
  overall: number | null
  repTurns: number
}

interface Row {
  id: string
  created_at: string
  overall: number | null
  transcript: { role?: string }[] | null
}

/** Finished AI-Doctor text simulations for one doctor, newest first. Reads only
 * the score and transcript out of the stored record (JSON paths), not the whole
 * document, and skips simulations that were never ended. RLS limits rows to the
 * signed-in rep, and the explicit rep filter mirrors the roleplay history hook. */
export function useDoctorTextSimulations(doctorId: string) {
  const [supabase] = useState(createClient)
  const [sims, setSims] = useState<TextSimulationSummary[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('agent_sessions')
      .select('id, created_at, overall:record->session->scores->overall, transcript:record->session->transcript')
      .eq('doctor_id', doctorId)
      .eq('rep_id', user.id)
      .neq('phase', 'in_roleplay')
      .order('created_at', { ascending: false })
    setSims(((data as unknown as Row[]) ?? []).map(row => ({
      id: row.id,
      created_at: row.created_at,
      overall: typeof row.overall === 'number' ? Math.round(row.overall) : null,
      repTurns: (row.transcript ?? []).filter(turn => turn.role === 'rep').length,
    })))
    setLoading(false)
  }, [supabase, doctorId])

  useEffect(() => { load() }, [load])

  return { sims, loading, reload: load }
}
