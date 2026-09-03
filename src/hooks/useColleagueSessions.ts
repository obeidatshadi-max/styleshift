'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import type { RoleplaySessionSummary } from '@/types/game'

const SESSION_COLUMNS = 'id, created_at, duration_sec, talk_ratio, question_ratio, open_question_ratio, paraphrase_score, active_listening_score, rep_style, rep_confidence'

/** A colleague's roleplay session history — scores only, newest first. */
export function useColleagueSessions(colleagueId: string) {
  const supabase = createClient()
  const [sessions, setSessions] = useState<RoleplaySessionSummary[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('roleplay_sessions')
      .select(SESSION_COLUMNS)
      .eq('colleague_id', colleagueId)
      .order('created_at', { ascending: false })
    setSessions((data as RoleplaySessionSummary[]) ?? [])
    setLoading(false)
  }, [supabase, colleagueId])

  useEffect(() => { load() }, [load])

  return { sessions, loading, reload: load }
}
