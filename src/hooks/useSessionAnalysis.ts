'use client'
import { useCallback, useState } from 'react'
import type { AdaptationScores, CompetencyScores, CriticalMoment, DoctorStyleProfile, SessionSignals } from '@/lib/session-evaluator'

export type SessionAnalysisStatus = 'idle' | 'loading' | 'ready' | 'notconfigured' | 'ratelimited' | 'error'

export interface SessionAnalysisResult {
  competencies: CompetencyScores
  signals: SessionSignals
  criticalMoments: CriticalMoment[]
  adaptation: AdaptationScores
  adaptationScore: number | null
  adaptationRecommendation: string
  doctorStyleProfile: DoctorStyleProfile
}

// Deep Analysis is deliberately lazy/on-demand (see session-analysis/route.ts's
// header comment) — this hook is separate from useVoicePartner's live-turn
// flow on purpose: it's an optional, after-the-fact view a rep may never open.
export function useSessionAnalysis() {
  const [status, setStatus] = useState<SessionAnalysisStatus>('idle')
  const [data, setData] = useState<SessionAnalysisResult | null>(null)

  const fetchAnalysis = useCallback(async (sessionId: string, lang: 'en' | 'ar') => {
    setStatus('loading')
    try {
      const res = await fetch('/api/voice-partner/session-analysis', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, lang }),
      })
      if (res.status === 503) { setStatus('notconfigured'); return }
      if (res.status === 429) { setStatus('ratelimited'); return }
      if (!res.ok) { setStatus('error'); return }
      const json = await res.json().catch(() => null) as SessionAnalysisResult | null
      if (!json?.competencies || !json.signals) { setStatus('error'); return }
      setData(json)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [])

  return { status, data, fetchAnalysis }
}
