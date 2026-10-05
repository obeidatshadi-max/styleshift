'use client'
import { useCallback, useEffect, useState } from 'react'
import { useDoctors } from '@/hooks/useDoctors'
import { buildNudge, type NudgeDebrief } from '@/lib/coach-nudges'

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
    return () => { live = false }
  }, [])

  const dismiss = useCallback((key: string) => {
    setSnoozed(prev => {
      const next = { ...prev, [key]: Date.now() + SNOOZE_MS }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* private mode: snooze lasts this visit only */ }
      return next
    })
  }, [])

  const nudge = debriefs ? buildNudge(doctors, debriefs, now, snoozed) : null
  return { nudge, dismiss }
}
