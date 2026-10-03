'use client'
import { useEffect, useRef, useState } from 'react'
import { useLang } from '@/lib/i18n'
import { useDoctors } from '@/hooks/useDoctors'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { parseDebriefResult, type DebriefInput, type DebriefResult } from '@/lib/coach-debrief'
import TextSimulation, { card, primaryBtn, ghostBtn } from './TextSimulation'
import type { Doctor } from '@/types/game'

interface Entry { id: string; created_at: string; input: DebriefInput; result: DebriefResult }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--line)', borderRadius: 10, padding: 12, background: 'var(--panel)', color: 'var(--ink)', font: 'inherit' }

export default function AICoach() {
  const { lang } = useLang()
  const ar = lang === 'ar'
  const copy = (en: string, arabic: string) => ar ? arabic : en
  const { doctors } = useDoctors()
  const [account, setAccount] = useState('')
  const [objective, setObjective] = useState('')
  const [result, setResult] = useState<DebriefResult | null>(null)
  const [answers, setAnswers] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saved, setSaved] = useState<boolean | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [historyError, setHistoryError] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [doctorId, setDoctorId] = useState('')
  const [practice, setPractice] = useState<Doctor | null>(null)
  const [recording, setRecording] = useState(false)
  const [micStarting, setMicStarting] = useState(false)
  const mounted = useRef(true)
  const requestRef = useRef<AbortController | null>(null)
  const recorder = useAudioRecorder(null, lang, () => setRecording(false))
  const locked = busy || recording || micStarting

  async function loadHistory() {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/coach-debrief')
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (mounted.current) { setEntries(data.entries); setHistoryError(false) }
    } catch { if (mounted.current) setHistoryError(true) }
    finally { if (mounted.current) setHistoryLoading(false) }
  }
  useEffect(() => {
    mounted.current = true
    void loadHistory()
    return () => { mounted.current = false; requestRef.current?.abort(); recorder.abort() }
  // recorder lifecycle is stable; cleanup only when leaving this section.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function revise() { setResult(null); setAnswers([]); setSaved(null); setActiveId(null); setError('') }
  async function startRecording() {
    setError(''); setMicStarting(true)
    const ok = await recorder.start()
    if (!mounted.current) { recorder.abort(); return }
    setMicStarting(false)
    if (ok) setRecording(true)
    else setError(copy('Microphone unavailable. You can type your account below.', 'الميكروفون غير متاح. يمكنك كتابة تفاصيل المكالمة أدناه.'))
  }
  async function transcribe() {
    const take = recorder.take()
    if (!take) return
    setBusy(true); setError('')
    const controller = new AbortController(); requestRef.current = controller
    const form = new FormData(); form.append('audio', take.blob)
    try {
      const res = await fetch('/api/transcribe', { method: 'POST', body: form, signal: controller.signal })
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (typeof data.text !== 'string' || !data.text.trim()) throw new Error()
      setAccount(prev => `${prev}${prev ? '\n' : ''}${data.text}`.slice(0, 12000)); revise()
    } catch { if (!controller.signal.aborted) setError(copy('Transcription unavailable. Please type your account or record again.', 'تعذر تفريغ الصوت. اكتب التفاصيل أو سجّل مجدداً.')) }
    finally { if (mounted.current) setBusy(false) }
  }
  async function coach(finish = false) {
    setBusy(true); setError('')
    const controller = new AbortController(); requestRef.current = controller
    try {
      const res = await fetch('/api/coach-debrief', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ account, objective, lang, finish, answers: (result?.questions ?? []).map((question, i) => ({ question, answer: answers[i] ?? '' })) }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      const parsed = parseDebriefResult(JSON.stringify(data.result), finish)
      if (!parsed) throw new Error()
      setResult(parsed); setActiveId(data.id ?? null); setSaved(parsed.report ? data.saved === true : null)
      if (parsed.report) void loadHistory()
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error && e.message === '429'
        ? copy('You have reached the hourly limit. Try again later.', 'وصلت للحد المسموح خلال الساعة. حاول لاحقاً.')
        : copy('Coaching is unavailable right now. Your text is still here; please retry.', 'التدريب غير متاح حالياً. نصك محفوظ هنا؛ حاول مجدداً.'))
    } finally { if (mounted.current) setBusy(false) }
  }
  async function remove(id: string) {
    if (!window.confirm(copy('Delete this saved debrief?', 'هل تريد حذف هذه المراجعة؟'))) return
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/coach-debrief?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setEntries(prev => prev.filter(e => e.id !== id))
      if (activeId === id) { revise(); setAccount(''); setObjective('') }
    } catch { setError(copy('Could not delete the debrief. Please retry.', 'تعذر حذف المراجعة. حاول مجدداً.')) }
    finally { setBusy(false) }
  }
  if (practice && result?.report) return <TextSimulation doctor={practice} initialPracticeFocus={result.report.practiceFocus} onDone={() => setPractice(null)} />
  const fields = [
    ['summary', copy('Your call, in brief', 'ملخص مكالمتك')],
    ['strength', copy('What to build on', 'ما يمكنك البناء عليه')],
    ['priority', copy('One thing to improve', 'نقطة واحدة للتحسين')],
    ['hypothesis', copy('A possible interpretation', 'تفسير محتمل')],
    ['betterResponse', copy('Try saying this', 'جرّب أن تقول')],
    ['nextAction', copy('Your next visit', 'زيارتك القادمة')],
  ] as const
  return <main dir={ar ? 'rtl' : 'ltr'} style={{ position: 'relative', zIndex: 1, maxWidth: 680, margin: '0 auto', padding: '24px 14px', color: 'var(--ink)', display: 'grid', gap: 18 }}>
    <header>
      <p style={{ color: 'var(--cyan)', fontFamily: 'var(--mono)', fontSize: 12 }}>{copy('REFLECT · LEARN · TRY AGAIN', 'راجع · تعلّم · جرّب مجدداً')}</p>
      <h1 style={{ margin: '8px 0', fontSize: 32 }}>{copy('AI Coach', 'المدرب الذكي')}</h1>
      <p style={{ color: 'var(--ink-dim)', lineHeight: 1.6 }}>{copy('Turn your last call into a better next visit. Tell your coach what happened, in your own words.', 'حوّل مكالمتك الأخيرة إلى زيارة أفضل. أخبر مدربك بما حدث بكلماتك.')}</p>
    </header>
    <section style={card} aria-label={copy('Call debrief', 'مراجعة المكالمة')}>
      <label style={{ display: 'grid', gap: 8, marginBottom: 18 }}>{copy('What was your goal? (optional)', 'ما هدف المكالمة؟ (اختياري)')}
        <input value={objective} maxLength={500} disabled={locked || !!result} onChange={e => setObjective(e.target.value)} style={inputStyle} />
      </label>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-dim)' }}>{copy('Record your own recollection after the call, up to 3 minutes. Audio is sent for transcription; your reviewed text is sent for AI coaching. Saved debriefs are private to your account.', 'سجّل ما تتذكره بعد المكالمة، حتى ٣ دقائق. يُرسل الصوت للتفريغ، ثم النص الذي تراجعه للتدريب بالذكاء الاصطناعي. المراجعات المحفوظة خاصة بحسابك.')}</p>
      {!result && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <button style={ghostBtn} disabled={busy || micStarting || !!recorder.previewUrl} onClick={recording ? async () => { await recorder.stop(); setRecording(false) } : startRecording}>
          {recording ? copy('Stop recording', 'إيقاف التسجيل') : micStarting ? copy('Opening microphone…', 'فتح الميكروفون…') : copy('Record what happened', 'سجّل ما حدث')}
        </button>
        {recording && <span role="status">{copy('Recording…', 'جارٍ التسجيل…')}</span>}
        {recorder.previewUrl && <>
          <audio controls src={recorder.previewUrl} style={{ width: '100%' }} />
          <button disabled={busy} style={ghostBtn} onClick={transcribe}>{copy('Transcribe recording', 'تفريغ التسجيل')}</button>
          <button disabled={busy} style={ghostBtn} onClick={recorder.discard}>{copy('Discard recording', 'إلغاء التسجيل')}</button>
        </>}
      </div>}
      <label style={{ display: 'grid', gap: 8 }}>{copy('What happened? Review or edit before coaching.', 'ماذا حدث؟ راجع النص أو عدّله قبل التدريب.')}
        <textarea rows={7} maxLength={12000} value={account} disabled={locked || !!result} onChange={e => setAccount(e.target.value)} style={inputStyle} placeholder={copy('What did the doctor say? How did you respond? What was agreed?', 'ماذا قال الطبيب؟ كيف رددت؟ وما الذي اتفقتما عليه؟')} />
      </label>
      {!result && <button style={{ ...primaryBtn, marginTop: 16 }} disabled={locked || !!recorder.previewUrl || account.trim().length < 20} onClick={() => coach()}>{copy('Get coaching', 'احصل على التدريب')}</button>}
      {result && <button disabled={locked} style={{ ...ghostBtn, marginTop: 12 }} onClick={revise}>{copy('Edit my account', 'تعديل روايتي')}</button>}
    </section>
    {busy && <p role="status">{copy('Working on your debrief…', 'جارٍ إعداد مراجعتك…')}</p>}
    {error && <p role="alert">{error}</p>}
    {!!result?.questions.length && <section style={card}>
      <h2>{copy('A little more context', 'قليل من التفاصيل')}</h2>
      {result.questions.map((q, i) => <label key={q} style={{ display: 'grid', gap: 8, marginBottom: 16 }}>{q}<textarea rows={3} maxLength={2000} style={inputStyle} disabled={locked} value={answers[i] ?? ''} onChange={e => setAnswers(prev => result.questions.map((_, n) => n === i ? e.target.value : prev[n] ?? ''))} /></label>)}
      <button disabled={locked} style={primaryBtn} onClick={() => coach(true)}>{copy('Coach me with these details', 'درّبني بناءً على هذه التفاصيل')}</button>
      <p style={{ color: 'var(--ink-dim)', fontSize: 13 }}>{copy('You can leave an answer blank if you do not remember.', 'يمكنك ترك الإجابة فارغة إذا كنت لا تتذكر.')}</p>
    </section>}
    {result?.report && <section style={{ display: 'grid', gap: 12 }} aria-label={copy('Your coaching', 'تدريبك')}>
      <p>{copy('Based on your account — interpretations are possibilities to explore.', 'بناءً على روايتك — التفسيرات احتمالات يمكن استكشافها.')}</p>
      {fields.map(([key, title]) => <article key={key} style={card}><h2 style={{ fontSize: 17, color: key === 'priority' ? 'var(--cyan)' : 'var(--ink)' }}>{title}</h2><p style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{result.report![key]}</p></article>)}
      <p role="status">{saved ? copy('Saved privately to your account.', 'حُفظت بشكل خاص في حسابك.') : copy('Coaching is ready, but could not be saved. Keep a copy before leaving.', 'التدريب جاهز لكن تعذر حفظه. احتفظ بنسخة قبل المغادرة.')}</p>
      <div style={card}>
        <h2 style={{ fontSize: 18 }}>{copy('Practice this with AI Doctor', 'تدرّب على ذلك مع الطبيب الذكي')}</h2>
        <p style={{ lineHeight: 1.6 }}>{result.report.practiceFocus}</p>
        <label style={{ display: 'grid', gap: 8 }}>{copy('Choose a practice doctor', 'اختر طبيباً للتدريب')}<select style={inputStyle} value={doctorId} onChange={e => setDoctorId(e.target.value)}><option value="">{copy('Select a doctor', 'اختر طبيباً')}</option>{doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        {!doctors.length && <p>{copy('Add a doctor in AI Doctor first, then return here to practice your coaching focus.', 'أضف طبيباً في قسم الطبيب الذكي، ثم عد للتدرب على نقطة التحسين.')}</p>}
        <button style={{ ...primaryBtn, marginTop: 12 }} disabled={!doctorId || locked} onClick={() => setPractice(doctors.find(d => d.id === doctorId) ?? null)}>{copy('Practice this moment', 'تدرّب على هذا الموقف')}</button>
      </div>
      <button disabled={locked} style={ghostBtn} onClick={() => { revise(); setAccount(''); setObjective('') }}>{copy('Debrief another call', 'راجع مكالمة أخرى')}</button>
    </section>}
    <section style={card}>
      <h2 style={{ fontSize: 19 }}>{copy('Recent debriefs', 'المراجعات الأخيرة')}</h2>
      {historyLoading ? <p role="status">{copy('Loading history…', 'تحميل السجل…')}</p> : historyError ? <p>{copy('History is unavailable.', 'السجل غير متاح.')} <button style={ghostBtn} onClick={loadHistory}>{copy('Retry', 'إعادة المحاولة')}</button></p> : !entries.length ? <p style={{ color: 'var(--ink-dim)' }}>{copy('Your completed coaching will appear here.', 'ستظهر مراجعاتك المكتملة هنا.')}</p> : entries.map(entry => <div key={entry.id} style={{ borderTop: '1px solid var(--line)', padding: '14px 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button disabled={locked || !!recorder.previewUrl} style={{ ...ghostBtn, flex: 1, textAlign: 'start', letterSpacing: 0, textTransform: 'none' }} onClick={() => { setAccount(entry.input.account); setObjective(entry.input.objective); setResult(entry.result); setSaved(true); setActiveId(entry.id); setAnswers([]); setError('') }}>
          <span style={{ display: 'block', marginBottom: 6 }}>{new Date(entry.created_at).toLocaleDateString(ar ? 'ar' : 'en')}</span>{entry.input.objective || entry.input.account.slice(0, 85)}
        </button>
        <button disabled={locked} style={ghostBtn} onClick={() => remove(entry.id)} aria-label={copy('Delete debrief', 'حذف المراجعة')}>{copy('Delete', 'حذف')}</button>
      </div>)}
    </section>
  </main>
}
