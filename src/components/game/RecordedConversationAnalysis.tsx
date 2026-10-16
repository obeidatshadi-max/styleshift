'use client'
import { useState } from 'react'
import { useLang } from '@/lib/i18n'
import { useSavedReport } from '@/hooks/useSavedReport'
import { ConversationReport } from '@/components/report/ConversationReport'
import PracticeReport from './PracticeReport'

function SavedOrGenerate({ sessionId }: { sessionId: string }) {
  const saved = useSavedReport('human_partner', sessionId)
  const { lang } = useLang()
  if (saved.status === 'loading') return <p role="status">{lang === 'ar' ? 'جاري تحميل التحليل…' : 'Loading conversation analysis…'}</p>
  if (saved.status === 'found') return <ConversationReport report={saved.report} outdated={false} />
  return <PracticeReport sessionId={sessionId} sessionType="human_partner" analysisConsent />
}

/** User-triggered analysis of the already consented, saved two-person recording. No microphone access. */
export default function RecordedConversationAnalysis({ sessionId }: { sessionId: string }) {
  const { lang } = useLang()
  const [consent, setConsent] = useState(false)
  const [open, setOpen] = useState(false)
  const ar = lang === 'ar'
  return <section aria-label={ar ? 'تحليل المحادثة باللهجة العراقية' : 'Iraqi conversation analysis'}
    style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
    <h3 style={{ fontSize: 16, color: 'var(--cyan)' }}>{ar ? 'فهم المحادثة باللهجة العراقية' : 'Understand the Iraqi conversation'}</h3>
    <p style={{ fontSize: 13, lineHeight: 1.7, margin: '8px 0 12px' }}>{ar
      ? 'حلّل معنى الكلام باللهجة العراقية ضمن سياقه، مع إبقاء الاقتباسات الأصلية وتوضيح أي معنى غير مؤكد. هذا التحليل لا يغيّر قياسات الصوت.'
      : 'Explain Iraqi speech in context, keeping original quotes and marking uncertain meanings. This analysis keeps the voice measurements unchanged.'}</p>
    {!open && <label style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
      <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> {ar
        ? 'أؤكد موافقة الطرفين على إرسال نص المحادثة إلى OpenAI للتحليل وحفظ التقرير. لا أدرج بيانات مرضى.'
        : 'Both participants agree to send the transcript to OpenAI for analysis and save the report. I have excluded patient details.'}
    </label>}
    {!open ? <button disabled={!consent} type="button" onClick={() => setOpen(true)} style={{ cursor: 'pointer', padding: '12px 16px', borderRadius: 10,
      background: 'var(--cyan)', color: '#04121c', border: '1px solid var(--cyan)', width: '100%' }}>
      {ar ? 'تحليل المحادثة بالذكاء الاصطناعي' : 'AI conversation analysis'}
    </button> : <SavedOrGenerate sessionId={sessionId} />}
  </section>
}
