'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import type { Profile, BadgeName } from '@/types/game'
import { XP_VALUES } from '@/lib/game-data'
import { todayKey, DAILY_TOTAL } from '@/lib/daily'

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

  // Uploads a photo to the rep's own avatars folder and saves its public URL on
  // the profile. Returns the URL, or null on failure. A cache-busting query is
  // added so a replaced photo shows immediately.
  const updateAvatar = useCallback(async (file: File): Promise<string | null> => {
    if (!profile) return null
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${profile.id}/avatar.${ext}`
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) return null
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = `${pub.publicUrl}?v=${Date.now()}`
    const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id)
    if (dbErr) return null
    setProfile(prev => prev ? { ...prev, avatar_url: url } : prev)
    return url
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

  // Records one of today's Daily Challenge questions (one row per UTC day per
  // level; the unique constraint makes re-answering a level a no-op). Awards the
  // correct-answer XP per question, plus the daily-streak bonus once — on the
  // answer that completes today's full set of DAILY_TOTAL questions.
  const recordDaily = useCallback(async (
    level: number, scenarioId: number, correct: boolean, reactionMs?: number
  ): Promise<boolean> => {
    if (!profile) return false
    const today = todayKey()
    const { error } = await supabase.from('daily_challenges').insert({
      rep_id: profile.id, challenge_date: today, level, scenario_id: scenarioId,
      correct, reaction_ms: reactionMs ?? null,
    })
    if (error) return false // already answered this level today (unique) or write failed
    let reward = correct ? XP_VALUES.correct : 0
    const { count } = await supabase
      .from('daily_challenges')
      .select('id', { count: 'exact', head: true })
      .eq('rep_id', profile.id)
      .eq('challenge_date', today)
    if (count === DAILY_TOTAL) reward += XP_VALUES.dailyStreak // set just completed
    await addXp(reward)
    return true
  }, [profile, supabase, addXp])

  return { profile, badges, completedLevels, loading, addXp, earnBadge, saveSession, recordDaily, updateAvatar, reload: load }
}
