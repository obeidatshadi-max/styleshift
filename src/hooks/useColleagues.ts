'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import type { Colleague, ColleagueInput } from '@/types/game'

/** A rep's private practice-colleague roster (CRUD via RLS-protected table). */
export function useColleagues() {
  const supabase = createClient()
  const [colleagues, setColleagues] = useState<Colleague[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('colleagues')
      .select('*')
      .eq('rep_id', user.id)
      .order('created_at', { ascending: false })
    setColleagues((data as Colleague[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const saveColleague = useCallback(async (input: ColleagueInput): Promise<Colleague | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase
      .from('colleagues')
      .insert({ ...input, rep_id: user.id })
      .select()
      .single()
    if (data) setColleagues(prev => [data as Colleague, ...prev])
    return (data as Colleague) ?? null
  }, [supabase])

  const removeColleague = useCallback(async (id: string) => {
    await supabase.from('colleagues').delete().eq('id', id)
    setColleagues(prev => prev.filter(c => c.id !== id))
  }, [supabase])

  return { colleagues, loading, saveColleague, removeColleague, reload: load }
}
