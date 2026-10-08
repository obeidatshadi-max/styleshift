'use client'
import { useEffect, useState } from 'react'
import { useLang, useT } from '@/lib/i18n'
import { card, ghostBtn, primaryBtn, sectionLabel, bodyText, smallLabel } from './TextSimulation'
import type { CriterionFeedback } from '@/lib/drill-run'

interface DrillSummary {
  id: string
  type: string
  difficulty: string
  durationMin: number
  objective: string
  history: { attempts: number; completions: number; personalBest: number | null } | null
}

interface AttemptResult {
  score: number | null
  passed: boolean
  feedback: CriterionFeedback[]
  personalBest: number | null
  newPersonalBest: boolean
  canRetry: boolean
  hint: string | null
}

type Phase = 'compose' | 'checking' | 'result'

/** Home card: short focused drills. Renders nothing when the feature is off or
 * no drill exists in the rep's language. Scoring, limits and storage are all
 * server-side; this only collects a reply and shows the result. */
export default function MicroPractice({ focusDrillId, onClose }: { focusDrillId?: string; onClose?: () => void } = {}) {
  const t = useT()
  const { lang } = useLang()
  const [drills, setDrills] = useState<DrillSummary[]>([])
  const [prompts, setPrompts] = useState<Record<string, string>>({})
  const [active, setActive] = useState<DrillSummary | null>(null)
  const [phase, setPhase] = useState<Phase>('compose')
  const [reply, setReply] = useState('')
  const [result, setResult] = useState<AttemptResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const res = await fetch(`/api/micro-practice?lang=${lang}`).catch(() => null)
    if (!res?.ok) { setDrills([]); return }
    const data = await res.json() as { drills: DrillSummary[]; prompts?: Record<string, string> }
    setDrills(data.drills)
    setPrompts(data.prompts ?? {})
  }
  useEffect(() => { void load() }, [lang]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focusDrillId || active) return
    const d = drills.find(x => x.id === focusDrillId)
    if (d) open(d)
  }, [focusDrillId, drills]) // eslint-disable-line react-hooks/exhaustive-deps

  function open(d: DrillSummary) { setActive(d); setPhase('compose'); setReply(''); setResult(null); setError(null) }
  async function close() { setActive(null); await load(); onClose?.() }

  async function submit() {
    if (!active || !reply.trim() || phase === 'checking') return
    setPhase('checking'); setError(null)
    const res = await fetch('/api/micro-practice/attempt', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ drillId: active.id, response: reply, lang }),
    }).catch(() => null)
    const data = await res?.json().catch(() => null)
    if (!res?.ok || !data) {
      setError(t(data?.error === 'could_not_assess' || data?.error === 'retry_limit' ? `mp.err.${data.error}` : 'mp.err.generic'))
      setPhase('compose')
      return
    }
    setResult(data as AttemptResult)
    setPhase('result')
  }

  if (!drills.length) return null

  if (active) {
    return (
      <div style={card}>
        <div style={sectionLabel}>{t(`mp.type.${active.type}`)}</div>
        <p style={{ ...bodyText, marginBottom: 6 }}>{active.objective}</p>
        {prompts[active.id] && <p dir="auto" style={{ ...bodyText, border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>{prompts[active.id]}</p>}

        {phase !== 'result' && <>
          <textarea
            dir="auto" value={reply} onChange={e => setReply(e.target.value)} maxLength={1200} rows={4} disabled={phase === 'checking'}
            placeholder={t('mp.placeholder')} aria-label={t('mp.placeholder')}
            style={{ width: '100%', margin: '10px 0', background: 'rgba(0,0,0,.3)', border: '1px solid var(--line)', borderRadius: 10, padding: 12, color: 'var(--ink)', fontSize: 14, fontFamily: 'var(--sans)' }}
          />
          {error && <div role="alert" style={{ ...bodyText, color: 'var(--red)', marginBottom: 8 }}>{error}</div>}
          <button onClick={submit} disabled={phase === 'checking' || !reply.trim()} style={primaryBtn}>{phase === 'checking' ? t('mp.checking') : t('mp.submit')}</button>
        </>}

        {phase === 'result' && result && (
          <div role="status" aria-live="polite" style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: result.passed ? 'var(--green)' : 'var(--ink)' }}>
              {result.passed ? t('mp.passed') : t('mp.notYet')}{result.score !== null && ` · ${t('mp.score', { n: result.score })}`}
            </div>
            {result.newPersonalBest && <div style={{ ...smallLabel, color: 'var(--cyan)', marginTop: 4 }}>{t('mp.newBest')}</div>}
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.feedback.map(f => (
                <li key={f.behavior} style={{ border: `1px solid ${f.met ? 'var(--green)' : 'var(--line)'}`, borderRadius: 10, padding: 10 }}>
                  <div style={smallLabel}>{f.met ? t('mp.met') : t('mp.missed')}</div>
                  <div style={bodyText}>{f.message}</div>
                  {f.quote && <div dir="auto" style={{ ...bodyText, color: 'var(--ink-dim)', marginTop: 4 }}>{t('mp.yourWords')} “{f.quote}”</div>}
                </li>
              ))}
            </ul>
            {result.hint && <div style={{ ...bodyText, color: 'var(--cyan)', marginBottom: 10 }}>{t('mp.hint')}: {result.hint}</div>}
            {result.canRetry && !result.passed && <button onClick={() => { setPhase('compose'); setResult(null) }} style={primaryBtn}>{t('mp.retry')}</button>}
          </div>
        )}
        <button onClick={close} style={{ ...ghostBtn, width: '100%', marginTop: 10 }}>{t('mp.done')}</button>
      </div>
    )
  }

  return (
    <div style={card}>
      <div style={sectionLabel}>{t('mp.title')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {drills.map(d => (
          <button key={d.id} onClick={() => open(d)} style={{ ...ghostBtn, textAlign: 'start', textTransform: 'none', letterSpacing: 0, display: 'block', width: '100%' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{t(`mp.type.${d.type}`)}</div>
            <div style={smallLabel}>
              {t('mp.minutes', { n: d.durationMin })}
              {d.history?.personalBest != null && ` · ${t('mp.best', { n: d.history.personalBest })}`}
              {d.history && d.history.completions > 0 && ` · ${t('mp.completed', { n: d.history.completions })}`}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
