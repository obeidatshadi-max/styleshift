'use client'
import { useState } from 'react'
import { useLang } from '@/lib/i18n'
import { useSavedReport } from '@/hooks/useSavedReport'
import { ConversationReport } from '@/components/report/ConversationReport'
import PracticeReport from './PracticeReport'
import TranscriptCorrection from './TranscriptCorrection'

function SavedOrGenerate({ sessionId, latestVersion }: { sessionId: string; latestVersion: number | null }) {
  const saved = useSavedReport('human_partner', sessionId)
  const { lang } = useLang()
  const [regenerate, setRegenerate] = useState(false)
  if (saved.status === 'loading') return <p role="status">{lang === 'ar' ? 'جاري تحميل التحليل…' : 'Loading conversation analysis…'}</p>
  // A correction after this report was written makes it outdated: it still shows, marked as old,
  // until the rep creates it again from the corrected text.
  const outdated = saved.status === 'found' && latestVersion !== null && saved.report.transcriptVersion < latestVersion
  if (saved.status === 'found' && !regenerate) return <>
    <ConversationReport report={saved.report} outdated={outdated} />
    {outdated && <button type="button" onClick={() => setRegenerate(true)}
      style={{ cursor: 'pointer', padding: '12px 16px', borderRadius: 10, background: 'var(--cyan)', color: 'var(--on-accent)', border: '1px solid var(--cyan)', width: '100%', marginTop: 12 }}>
      {lang === 'ar' ? 'أعد إنشاء التحليل من النص المصحّح' : 'Create the analysis again from the corrected text'}
    </button>}
  </>
  return <PracticeReport sessionId={sessionId} sessionType="human_partner" analysisConsent />
}

/** User-triggered analysis of the already consented, saved two-person recording. No microphone access. */
export default function RecordedConversationAnalysis({ sessionId }: { sessionId: string }) {
  const { lang } = useLang()
  const [consent, setConsent] = useState(false)
  const [open, setOpen] = useState(false)
  const [latestVersion, setLatestVersion] = useState<number | null>(null)
  const ar = lang === 'ar'
  return <>
    <TranscriptCorrection sessionId={sessionId} onSaved={setLatestVersion} />
    <section aria-label={ar ? 'تحليل المحادثة باللهجة العراقية' : 'Iraqi conversation analysis'}
    style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
    <h3 style={{ fontSize: 16, color: 'var(--cyan)' }}>{ar ? 'فهم المحادثة باللهجة العراقية' : 'Understand the Iraqi conversation'}</h3>
    <p style={{ fontSize: 16, lineHeight: 1.7, margin: '8px 0 12px' }}>{ar
      ? 'حلّل معنى الكلام باللهجة العراقية ضمن سياقه، مع إبقاء الاقتباسات الأصلية وتوضيح أي معنى غير مؤكد. هذا التحليل لا يغيّر قياسات الصوت.'
      : 'Explain Iraqi speech in context, keeping original quotes and marking uncertain meanings. This analysis keeps the voice measurements unchanged.'}</p>
    {!open && <label style={{ display: 'block', marginBottom: 12, fontSize: 16 }}>
      <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> {ar
        ? 'أؤكد موافقة الطرفين على إرسال نص المحادثة إلى OpenAI للتحليل وحفظ التقرير. لا أدرج بيانات مرضى.'
        : 'Both participants agree to send the transcript to OpenAI for analysis and save the report. I have excluded patient details.'}
    </label>}
    {!open ? <button disabled={!consent} type="button" onClick={() => setOpen(true)} style={{ cursor: 'pointer', padding: '12px 16px', borderRadius: 10,
      background: 'var(--cyan)', color: 'var(--on-accent)', border: '1px solid var(--cyan)', width: '100%' }}>
      {ar ? 'تحليل المحادثة بالذكاء الاصطناعي' : 'AI conversation analysis'}
    </button> : <SavedOrGenerate key={latestVersion ?? 0} sessionId={sessionId} latestVersion={latestVersion} />}
  </section>
  </>
}
