'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import type { Doctor, DoctorInput } from '@/types/game'

/** A rep's private saved doctor profiles (CRUD via RLS-protected table). */
export function useDoctors() {
  const supabase = createClient()
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('doctors')
      .select('*')
      .eq('rep_id', user.id)
      .order('updated_at', { ascending: false })
    setDoctors((data as Doctor[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const saveDoctor = useCallback(async (input: DoctorInput, id?: string): Promise<Doctor | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    if (id) {
      const { data } = await supabase
        .from('doctors')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (data) setDoctors(prev => prev.map(d => (d.id === id ? (data as Doctor) : d)))
      return (data as Doctor) ?? null
    }
    const { data } = await supabase
      .from('doctors')
      .insert({ ...input, rep_id: user.id })
      .select()
      .single()
    if (data) setDoctors(prev => [data as Doctor, ...prev])
    return (data as Doctor) ?? null
  }, [supabase])

  const removeDoctor = useCallback(async (id: string) => {
    await supabase.from('doctors').delete().eq('id', id)
    setDoctors(prev => prev.filter(d => d.id !== id))
  }, [supabase])

  return { doctors, loading, saveDoctor, removeDoctor, reload: load }
}
