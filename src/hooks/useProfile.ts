'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import type { Profile, BadgeName } from '@/types/game'
import type { SpsResult } from '@/lib/sps-core'
import type { GameAnswer, LevelScore } from '@/lib/game-scoring'
import { logInviteEvent } from '@/lib/invite-events'

/** What the server returns for a finished level run. */
export type LevelResult = LevelScore & { totalXp: number | null; newBadges: BadgeName[] }

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

    // Independent reads, so fetch them together: one after another they kept "Loading…" up ~1 s longer.
    const [{ data: p }, { data: b }, { data: sess }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('badges').select('badge_name').eq('rep_id', user.id),
      supabase.from('sessions').select('level').eq('rep_id', user.id),
    ])
    if (sess) setCompletedLevels([...new Set(sess.map((s: { level: number }) => s.level))])

    if (p) setProfile(p as Profile)
    if (b) setBadges(b.map((r: { badge_name: string }) => r.badge_name as BadgeName))

    // The home screen can show now; the daily-visit bookkeeping below finishes in the background.
    setLoading(false)

    // First visit of the day: the server stamps last_visit and adds the visit bonus once.
    if (p && p.last_visit !== new Date().toISOString().slice(0, 10)) {
      const res = await fetch('/api/game/visit', { method: 'POST' }).catch(() => null)
      const out = res?.ok ? await res.json() as { xpAwarded: number; lastVisit: string } : null
      if (out) setProfile(prev => prev ? { ...prev, xp: prev.xp + out.xpAwarded, last_visit: out.lastVisit } : prev)
    }
  }, [supabase])

  useEffect(() => { load() }, [load])

  // XP is added by the server; this only updates what the screen shows.
  const setXpTotal = useCallback((total: number | null | undefined) => {
    if (typeof total === 'number') setProfile(prev => prev ? { ...prev, xp: total } : prev)
  }, [])

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

  // Writes the completed SPS assessment onto the rep's profile row. Called
  // once, the first time GameShell detects sps_top_key is missing.
  const saveSpsAssessment = useCallback(async (result: SpsResult) => {
    if (!profile) return
    const { error } = await supabase
      .from('profiles')
      .update({ sps_top_key: result.topKey, sps_profile: result })
      .eq('id', profile.id)
    if (error) return
    setProfile(prev => prev ? { ...prev, sps_top_key: result.topKey, sps_profile: result } : prev)
  }, [profile, supabase])

  // Badges are granted by the server; this only adds them to what the screen shows.
  const addBadges = useCallback((names: readonly BadgeName[]) => {
    if (names.length) setBadges(prev => [...new Set([...prev, ...names])])
  }, [])

  /** Sends a finished level run (the picks only). The server scores it, saves the session,
   * adds the XP and grants badges. Returns the server's score, or null if it was not saved. */
  const completeLevel = useCallback(async (level: number, lang: 'en' | 'ar', answers: GameAnswer[]): Promise<LevelResult | null> => {
    if (!profile) return null
    // Read before the save: the rep's first-ever completed level is when completedLevels is still empty.
    const isFirstEverDrill = completedLevels.length === 0
    const res = await fetch('/api/game/level-complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level, lang, answers }),
    }).catch(() => null)
    if (!res?.ok) return null
    const out = await res.json() as LevelResult
    setXpTotal(out.totalXp)
    addBadges(out.newBadges ?? [])
    setCompletedLevels(prev => [...new Set([...prev, level])])
    if (isFirstEverDrill) logInviteEvent('first_drill_completed')
    return out
  }, [profile, completedLevels, setXpTotal, addBadges])

  /** One of today's Daily Challenge answers. The server checks it and adds the XP (plus the
   * streak bonus on the answer that completes the set). Returns false if it was not saved. */
  const recordDaily = useCallback(async (
    level: number, scenarioId: number, pick: number | string, lang: 'en' | 'ar', reactionMs?: number
  ): Promise<boolean> => {
    if (!profile) return false
    const res = await fetch('/api/game/daily-answer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, scenarioId, pick, lang, ms: reactionMs }),
    }).catch(() => null)
    if (!res?.ok) return false
    const out = await res.json() as { saved: boolean; totalXp?: number | null }
    setXpTotal(out.totalXp)
    return out.saved
  }, [profile, setXpTotal])

  return { profile, badges, completedLevels, loading, setXpTotal, completeLevel, recordDaily, updateAvatar, saveSpsAssessment, reload: load }
}
