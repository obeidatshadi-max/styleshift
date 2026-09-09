'use client'
import { useState, useEffect, useCallback } from 'react'
import type { GroupInfo, Standings } from '@/lib/group-standings'

export function useGroup() {
  const [group, setGroup] = useState<GroupInfo | null>(null)
  const [standings, setStandings] = useState<Standings | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/groups')
      if (res.ok) {
        const data = await res.json()
        setGroup(data.group)
        setStandings(data.standings)
      }
    } catch { /* offline — group panel just won't show */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const createGroup = useCallback(async (): Promise<string | null> => {
    const res = await fetch('/api/groups', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) return data.error ?? 'Could not create group'
    await load()
    return null
  }, [load])

  return { group, standings, loading, createGroup }
}
