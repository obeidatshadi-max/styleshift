'use client'
import { useEffect, useState } from 'react'
import { useLang } from '@/lib/i18n'
import type { CoachProgressSummary, Comparison } from '@/lib/conversation-coach/progress'
import type { OpportunityKey } from '@/lib/conversation-coach/types'

const KEY_TEXT: Record<OpportunityKey, { en: string; ar: string }> = {
  concerns_clarified: { en: 'Concerns clarified before answering', ar: 'مخاوف وضّحتها قبل الإجابة' },
  follow_up_questions: { en: 'Follow-up questions', ar: 'أسئلة متابعة' },
  listening_summaries: { en: 'Listening summaries', ar: 'تلخيصات تدل على الاستماع' },
  next_step_agreed: { en: 'Next step agreed', ar: 'خطوة تالية متفق عليها' },
}
const CMP: Record<Comparison, { en: string; ar: string }> = {
  not_enough_data: { en: 'Not enough comparable recordings to compare yet.', ar: 'لا توجد تسجيلات متشابهة كافية للمقارنة بعد.' },
  higher: { en: 'Higher share than in your earlier recordings.', ar: 'نسبة أعلى من تسجيلاتك السابقة.' },
  lower: { en: 'Lower share than in your earlier recordings.', ar: 'نسبة أقل من تسجيلاتك السابقة.' },
  similar: { en: 'About the same as your earlier recordings.', ar: 'تقريبًا مثل تسجيلاتك السابقة.' },
}

/** Opportunity counts across the rep's own recordings. No overall score; comparisons only when data allows. */
export default function CoachProgress() {
  const { lang: appLang } = useLang()
  const lang = appLang === 'ar' ? 'ar' : 'en'
  const [data, setData] = useState<CoachProgressSummary | null>(null)
  useEffect(() => {
    let active = true
    fetch('/api/reports/coach-progress').then(r => (r.ok ? r.json() : null)).then(d => { if (active) setData(d) }).catch(() => {})
    return () => { active = false }
  }, [])
  if (!data || data.recordings === 0) return null
  const of = (n: number, d: number | null) => d === null ? String(n) : lang === 'ar' ? `${n} من ${d}` : `${n} of ${d}`
  return <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, marginBottom: 14 }}>
    <h3 style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--cyan)', margin: '0 0 6px' }}>{lang === 'ar' ? 'عبر تسجيلاتك' : 'Across your recordings'}</h3>
    <p style={{ fontSize: 14, color: 'var(--ink-dim)', margin: '0 0 8px' }}>{lang === 'ar'
      ? `${data.recordings} تسجيلات مع تحليل. المحادثات المختلفة تعطي فرصًا مختلفة، لذلك الأرقام ليست درجات.${data.partialRecordings ? ` ${data.partialRecordings} منها جزئية ولا تدخل في المقارنة.` : ''}`
      : `${data.recordings} analysed recordings. Different conversations offer different opportunities, so these are counts, not scores.${data.partialRecordings ? ` ${data.partialRecordings} were partial and are left out of comparisons.` : ''}`}</p>
    {data.keys.map(k => <div key={k.key} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 15 }}>
        <span>{KEY_TEXT[k.key][lang]}</span>
        <span style={{ fontFamily: 'var(--mono)' }}>{k.latest ? (lang === 'ar' ? 'الأخير: ' : 'Latest: ') + of(k.latest.numerator, k.latest.denominator) : '—'}</span>
      </div>
      {k.earlier && <p style={{ fontSize: 13, color: 'var(--ink-dim)', margin: '2px 0' }}>{lang === 'ar'
        ? `قبل ذلك: ${of(k.earlier.numerator, k.earlier.denominator)} في ${k.earlier.recordings} تسجيلات`
        : `Before: ${of(k.earlier.numerator, k.earlier.denominator)} across ${k.earlier.recordings} recordings`}</p>}
      {k.key !== 'listening_summaries' && <p style={{ fontSize: 13, color: 'var(--ink-dim)', margin: 0 }}>{CMP[k.comparison][lang]}</p>}
    </div>)}
    <p style={{ fontSize: 14, margin: '8px 0 0' }}>{lang === 'ar'
      ? `محاولات تمرين الإعادة: ${data.practice.attempts} (تحقق المعيار في ${data.practice.criterionMet}).`
      : `Replay practice attempts: ${data.practice.attempts} (criterion met in ${data.practice.criterionMet}).`}</p>
  </div>
}
