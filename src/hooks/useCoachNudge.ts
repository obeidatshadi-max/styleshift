'use client'
import { useCallback, useEffect, useState } from 'react'
import { useDoctors } from '@/hooks/useDoctors'
import { createClient } from '@/lib/supabase-browser'
import { buildNudge, type NudgeDebrief, type NudgePromise } from '@/lib/coach-nudges'

const STORAGE_KEY = 'styleshift.nudgeSnooze'
const SNOOZE_MS = 24 * 60 * 60 * 1000

// Snoozing is a per-device convenience, so storage can be missing or blocked without breaking the nudge.
function readSnoozed(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch { return {} }
}

/** The one nudge worth showing on Home right now, or null. */
export function useCoachNudge() {
  const { doctors } = useDoctors()
  const [debriefs, setDebriefs] = useState<NudgeDebrief[] | null>(null)
  const [promises, setPromises] = useState<NudgePromise[]>([])
  const [snoozed, setSnoozed] = useState<Record<string, number>>({})
  const [now] = useState(() => Date.now())

  useEffect(() => {
    setSnoozed(readSnoozed())
    let live = true
    fetch('/api/coach-debrief')
      .then(res => (res.ok ? res.json() : { entries: [] }))
      .then((data: { entries?: { doctor_id: string | null; created_at: string; result?: { report?: { nextAction?: string } } }[] }) => {
        if (live) setDebriefs((data.entries ?? []).map(e => ({ doctor_id: e.doctor_id, created_at: e.created_at, nextAction: e.result?.report?.nextAction ?? null })))
      })
      .catch(() => { if (live) setDebriefs([]) })
    // Promises made to a doctor and not yet ticked off (RLS limits this to the rep's own rows).
    createClient().from('doctor_visits').select('id,doctor_id,promise_made,created_at')
      .not('promise_made', 'is', null).is('promise_done_at', null)
      .then(({ data }) => {
        if (live) setPromises(((data ?? []) as { id: string; doctor_id: string; promise_made: string; created_at: string }[])
          .map(r => ({ id: r.id, doctor_id: r.doctor_id, text: r.promise_made, created_at: r.created_at })))
      })
    return () => { live = false }
  }, [])

  const dismiss = useCallback((key: string) => {
    setSnoozed(prev => {
      const next = { ...prev, [key]: Date.now() + SNOOZE_MS }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* private mode: snooze lasts this visit only */ }
      return next
    })
  }, [])

  const nudge = debriefs ? buildNudge(doctors, debriefs, now, snoozed, promises) : null
  return { nudge, dismiss }
}
