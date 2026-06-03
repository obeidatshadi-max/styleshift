'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import type { Profile, BadgeName } from '@/types/game'
import { XP_VALUES } from '@/lib/game-data'

export function useProfile() {
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [badges, setBadges] = useState<BadgeName[]>([])
  const [completedLevels, setCompletedLevels] = useState<number[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    await supabase
      .from('profiles')
      .upsert({ id: user.id }, { onConflict: 'id', ignoreDuplicates: true })

    const { data: p } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    const { data: b } = await supabase
      .from('badges')
      .select('badge_name')
      .eq('rep_id', user.id)

    const { data: sess } = await supabase
      .from('sessions')
      .select('level')
      .eq('rep_id', user.id)
    if (sess) setCompletedLevels([...new Set(sess.map((s: { level: number }) => s.level))])

    if (p) setProfile(p as Profile)
    if (b) setBadges(b.map((r: { badge_name: string }) => r.badge_name as BadgeName))

    const today = new Date().toISOString().slice(0, 10)
    if (p && p.last_visit && p.last_visit !== today) {
      await supabase
        .from('profiles')
        .update({ xp: (p.xp || 0) + XP_VALUES.dailyStreak, last_visit: today })
        .eq('id', user.id)
      setProfile(prev => prev ? { ...prev, xp: prev.xp + XP_VALUES.dailyStreak, last_visit: today } : prev)
    } else if (p && !p.last_visit) {
      await supabase.from('profiles').update({ last_visit: today }).eq('id', user.id)
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const addXp = useCallback(async (amount: number) => {
    if (!profile) return
    const newXp = profile.xp + amount
    await supabase.from('profiles').update({ xp: newXp }).eq('id', profile.id)
    setProfile(prev => prev ? { ...prev, xp: newXp } : prev)
  }, [profile, supabase])

  const earnBadge = useCallback(async (name: BadgeName) => {
    if (!profile || badges.includes(name)) return
    await supabase.from('badges').insert({ rep_id: profile.id, badge_name: name })
    setBadges(prev => [...prev, name])
  }, [profile, badges, supabase])

  const saveSession = useCallback(async (
    level: number, accuracy: number, xpEarned: number, avgReactionMs?: number
  ) => {
    if (!profile) return
    await supabase.from('sessions').insert({
      rep_id: profile.id, level, accuracy, xp_earned: xpEarned,
      avg_reaction_ms: avgReactionMs ?? null,
    })
    setCompletedLevels(prev => [...new Set([...prev, level])])
  }, [profile, supabase])

  return { profile, badges, completedLevels, loading, addXp, earnBadge, saveSession, reload: load }
}
