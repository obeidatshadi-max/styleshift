'use client'
import { useState } from 'react'
import { useLang } from '@/lib/i18n'
import { useSavedReport } from '@/hooks/useSavedReport'
import { ConversationReport } from '@/components/report/ConversationReport'
import ConversationCoachView from '@/components/report/ConversationCoachView'
import type { ConversationReport as Report } from '@/schemas/conversationReport'
import PracticeReport from './PracticeReport'
import TranscriptCorrection from './TranscriptCorrection'

/** Coach first (snapshot, moments, one priority, practice); the full existing report stays one tap away. */
function CoachThenFullReport({ report, outdated, sessionId, audioUrl }: { report: Report; outdated: boolean; sessionId: string; audioUrl: string | null }) {
  const { lang } = useLang()
  const [full, setFull] = useState(!report.coach)
  return <>
    {report.coach && <ConversationCoachView coach={report.coach} sessionId={sessionId} audioUrl={audioUrl} />}
    {report.coach && <button type="button" aria-expanded={full} onClick={() => setFull(f => !f)}
      style={{ cursor: 'pointer', padding: '12px 16px', borderRadius: 10, background: 'transparent', color: 'var(--cyan)', border: '1px solid var(--line)', width: '100%', marginBottom: 12 }}>
      {full ? (lang === 'ar' ? 'إخفاء التحليل الكامل' : 'Hide the full analysis') : (lang === 'ar' ? 'عرض التحليل الكامل' : 'Show the full analysis')}
    </button>}
    {full && <ConversationReport report={report} outdated={outdated} />}
  </>
}

function SavedOrGenerate({ sessionId, latestVersion, audioUrl, partialRecording }: { sessionId: string; latestVersion: number | null; audioUrl: string | null; partialRecording: boolean }) {
  const saved = useSavedReport('human_partner', sessionId)
  const { lang } = useLang()
  const [regenerate, setRegenerate] = useState(false)
  if (saved.status === 'loading') return <p role="status">{lang === 'ar' ? 'جاري تحميل التحليل…' : 'Loading conversation analysis…'}</p>
  // A correction after this report was written makes it outdated: it still shows, marked as old,
  // until the rep creates it again from the corrected text.
  const outdated = saved.status === 'found' && latestVersion !== null && saved.report.transcriptVersion < latestVersion
  if (saved.status === 'found' && !regenerate) return <>
    <CoachThenFullReport report={saved.report} outdated={outdated} sessionId={sessionId} audioUrl={audioUrl} />
    {outdated && <button type="button" onClick={() => setRegenerate(true)}
      style={{ cursor: 'pointer', padding: '12px 16px', borderRadius: 10, background: 'var(--cyan)', color: 'var(--on-accent)', border: '1px solid var(--cyan)', width: '100%', marginTop: 12 }}>
      {lang === 'ar' ? 'أعد إنشاء التحليل من النص المصحّح' : 'Create the analysis again from the corrected text'}
    </button>}
  </>
  return <PracticeReport sessionId={sessionId} sessionType="human_partner" analysisConsent partialRecording={partialRecording}
    render={report => <CoachThenFullReport report={report} outdated={false} sessionId={sessionId} audioUrl={audioUrl} />} />
}

/** User-triggered analysis of the already consented, saved two-person recording. No microphone access. */
export default function RecordedConversationAnalysis({ sessionId, audioUrl = null }: { sessionId: string; audioUrl?: string | null }) {
  const { lang } = useLang()
  const [consent, setConsent] = useState(false)
  const [partial, setPartial] = useState(false)
  const [open, setOpen] = useState(false)
  const [latestVersion, setLatestVersion] = useState<number | null>(null)
  const ar = lang === 'ar'
  return <>
    <TranscriptCorrection sessionId={sessionId} onSaved={setLatestVersion} />
    <section aria-label={ar ? 'تحليل المحادثة باللهجة العراقية' : 'Iraqi conversation analysis'}
    style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
    <h3 style={{ fontSize: 16, color: 'var(--cyan)' }}>{ar ? 'فهم المحادثة وتدريبك' : 'Understand the conversation and practise'}</h3>
    <p style={{ fontSize: 16, lineHeight: 1.7, margin: '8px 0 12px' }}>{ar
      ? 'يعرض ما قاله الطبيب، وكيف رددت، وشيئًا واحدًا للتدريب. يحافظ على الاقتباسات الأصلية ويوضح أي معنى غير مؤكد، ولا يغيّر قياسات الصوت. صحّح أسماء المتحدثين والنص أعلاه أولاً إذا لزم.'
      : 'Shows what the doctor said, how you replied, and one thing to practise. It keeps original quotes, marks uncertain meanings, and keeps the voice measurements unchanged. Correct the speakers and text above first if needed.'}</p>
    {!open && <label style={{ display: 'block', marginBottom: 10, fontSize: 16 }}>
      <input type="checkbox" checked={partial} onChange={e => setPartial(e.target.checked)} /> {ar
        ? 'هذا التسجيل جزء من الزيارة فقط (ليس من البداية إلى النهاية).'
        : 'This recording is only part of the visit (not start to finish).'}
    </label>}
    {!open && <label style={{ display: 'block', marginBottom: 12, fontSize: 16 }}>
      <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> {ar
        ? 'أؤكد موافقة الطرفين على إرسال نص المحادثة إلى خدمة الذكاء الاصطناعي المهيأة (OpenAI أو Anthropic) للتحليل وحفظ التقرير. لا أدرج بيانات مرضى.'
        : 'Both participants agree to send the transcript to the configured AI service (OpenAI or Anthropic) for analysis and to save the report. I have excluded patient details.'}
    </label>}
    {!open ? <button disabled={!consent} type="button" onClick={() => setOpen(true)} style={{ cursor: 'pointer', padding: '12px 16px', borderRadius: 10,
      background: 'var(--cyan)', color: 'var(--on-accent)', border: '1px solid var(--cyan)', width: '100%' }}>
      {ar ? 'تحليل المحادثة بالذكاء الاصطناعي' : 'AI conversation analysis'}
    </button> : <SavedOrGenerate key={latestVersion ?? 0} sessionId={sessionId} latestVersion={latestVersion} audioUrl={audioUrl} partialRecording={partial} />}
  </section>
  </>
}
