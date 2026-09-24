'use client'
import { useCallback, useRef, useState } from 'react'
import type { SessionReport } from '@/schemas/report'
import type { Difficulty } from '@/lib/voice-partner-core'

export type SimPhase = 'idle' | 'starting' | 'live' | 'sending' | 'ending' | 'report' | 'error'
export type SimErrorKind = 'not_configured' | 'rate_limited' | 'unavailable' | 'no_rep_turns' | 'turn_limit' | 'generic'
export interface SimMessage { role: 'doctor' | 'rep'; text: string }

function errorKindFor(status: number, code: string | undefined): SimErrorKind {
  if (status === 503 && code === 'not_configured') return 'not_configured'
  if (status === 429) return 'rate_limited'
  if (code === 'no_rep_turns') return 'no_rep_turns'
  if (code === 'turn_limit') return 'turn_limit'
  if (status === 502) return 'unavailable'
  return 'generic'
}

async function post<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; kind: SimErrorKind }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => null) as (T & { error?: string }) | null
    if (!res.ok || !data) return { ok: false, kind: errorKindFor(res.status, data?.error) }
    return { ok: true, data }
  } catch {
    return { ok: false, kind: 'generic' } // offline / network
  }
}

/** Client state for the multi-agent text simulation. All workflow logic lives
 * on the server (orchestrator); this only tracks what to show. Failures never
 * lose the conversation: a failed send removes only the optimistic message,
 * and a failed end can simply be pressed again (the server resumes). */
export function useTextSimulation(doctorId: string, lang: 'en' | 'ar') {
  const [phase, setPhase] = useState<SimPhase>('idle')
  const [errorKind, setErrorKind] = useState<SimErrorKind | null>(null)
  const [messages, setMessages] = useState<SimMessage[]>([])
  const [report, setReport] = useState<SessionReport | null>(null)
  const sessionRef = useRef<string | null>(null)
  const busyRef = useRef(false)
  const hasReportRef = useRef(false)

  const start = useCallback(async (difficulty?: Difficulty) => {
    if (busyRef.current) return
    busyRef.current = true
    setPhase('starting'); setErrorKind(null); setMessages([]); setReport(null); sessionRef.current = null; hasReportRef.current = false
    const res = await post<{ sessionId: string; doctorText: string }>('/api/simulation/start', { doctorId, lang, difficulty })
    busyRef.current = false
    if (!res.ok) { setErrorKind(res.kind); setPhase('error'); return }
    sessionRef.current = res.data.sessionId
    setMessages([{ role: 'doctor', text: res.data.doctorText }])
    setPhase('live')
  }, [doctorId, lang])

  /** Resolves true when the doctor replied; false leaves the text for the
   * caller to put back in the input box. */
  const send = useCallback(async (text: string): Promise<boolean> => {
    const message = text.trim()
    if (!message || !sessionRef.current || busyRef.current) return false
    busyRef.current = true
    setErrorKind(null); setPhase('sending')
    setMessages(m => [...m, { role: 'rep', text: message }])
    const res = await post<{ doctorText: string }>('/api/simulation/message', { sessionId: sessionRef.current, message })
    busyRef.current = false
    if (!res.ok) {
      setMessages(m => m.slice(0, -1)) // drop the optimistic rep line only
      setErrorKind(res.kind); setPhase('live')
      return false
    }
    setMessages(m => [...m, { role: 'doctor', text: res.data.doctorText }])
    setPhase('live')
    return true
  }, [])

  const end = useCallback(async () => {
    if (!sessionRef.current || busyRef.current) return
    busyRef.current = true
    setErrorKind(null); setPhase('ending')
    // The legacy per-agent report is no longer rendered (the shared
    // ConversationReport pipeline replaces it — see TextSimulation.tsx), but
    // this call still has to run: it's what drives the session to
    // phase: 'reported' and persists the transcript the new pipeline reads.
    const res = await post<{ report: SessionReport }>('/api/simulation/end', { sessionId: sessionRef.current })
    busyRef.current = false
    // Pressing End again resumes server-side. A failed coaching retry goes back
    // to the report the rep already had, not the (finished) conversation.
    if (!res.ok) { setErrorKind(res.kind); setPhase(hasReportRef.current ? 'report' : 'live'); return }
    hasReportRef.current = true
    setReport(res.data.report)
    setPhase('report')
  }, [])

  return { phase, errorKind, messages, report, sessionId: sessionRef.current, start, send, end }
}
