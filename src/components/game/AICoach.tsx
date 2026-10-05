'use client'
import { useEffect, useRef, useState } from 'react'
import { useLang } from '@/lib/i18n'
import { useDoctors } from '@/hooks/useDoctors'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { parseDebriefResult, type DebriefInput, type DebriefResult } from '@/lib/coach-debrief'
import TextSimulation, { card, primaryBtn, ghostBtn } from './TextSimulation'
import type { Doctor } from '@/types/game'

interface Entry { id: string; created_at: string; doctor_id: string | null; doctor_name: string | null; input: DebriefInput; result: DebriefResult }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--line)', borderRadius: 10, padding: 12, background: 'var(--panel)', color: 'var(--ink)', font: 'inherit' }
const emptyReflections = { wentWell: '', changeNextTime: '', objectiveReview: '' }
type MicTarget = 'account' | keyof typeof emptyReflections
const REFLECTION_MAX = 2000
const ACCOUNT_MAX = 12000

export default function AICoach() {
  const { lang } = useLang()
  const ar = lang === 'ar'
  const copy = (en: string, arabic: string) => ar ? arabic : en
  const { doctors } = useDoctors()
  const [doctorId, setDoctorId] = useState('')
  const [account, setAccount] = useState('')
  const [objective, setObjective] = useState('')
  const [successMeasure, setSuccessMeasure] = useState('')
  const [reflections, setReflections] = useState(emptyReflections)
  const [result, setResult] = useState<DebriefResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saved, setSaved] = useState<boolean | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [historyError, setHistoryError] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [practice, setPractice] = useState<Doctor | null>(null)
  const [recording, setRecording] = useState(false)
  const [micStarting, setMicStarting] = useState(false)
  const [micTarget, setMicTarget] = useState<MicTarget | null>(null)
  const mounted = useRef(true)
  const requestRef = useRef<AbortController | null>(null)
  const targetRef = useRef<MicTarget | null>(null)
  // The 3-minute auto-stop fires from inside the recorder, so it must also finish the job the
  // Stop button would: a reflection answer is transcribed straight into its own field.
  const recorder = useAudioRecorder(null, lang, () => { setRecording(false); if (targetRef.current && targetRef.current !== 'account') void transcribe() })
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

  function revise() { setResult(null); setSaved(null); setActiveId(null); setError('') }
  async function startRecording(target: MicTarget = 'account') {
    setError(''); setMicStarting(true); targetRef.current = target; setMicTarget(target)
    const ok = await recorder.start()
    if (!mounted.current) { recorder.abort(); return }
    setMicStarting(false)
    if (ok) { setRecording(true); return }
    targetRef.current = null; setMicTarget(null)
    setError(copy('Microphone unavailable. You can type your answer instead.', 'تعذّر تشغيل الميكروفون. يمكنك الكتابة بدلاً من ذلك.'))
  }
  async function stopRecording() {
    await recorder.stop()
    setRecording(false)
    // Short reflection answers skip the listen-back step: transcribe straight into the field, where it stays editable.
    if (targetRef.current && targetRef.current !== 'account') await transcribe()
  }
  async function transcribe() {
    const target = targetRef.current ?? 'account'
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
      const append = (prev: string, max: number) => `${prev}${prev ? '\n' : ''}${data.text}`.slice(0, max)
      if (target === 'account') setAccount(prev => append(prev, ACCOUNT_MAX))
      else setReflections(prev => ({ ...prev, [target]: append(prev[target], REFLECTION_MAX) }))
    } catch { if (!controller.signal.aborted) setError(copy('Transcription unavailable. Please type your account or record again.', 'تعذّر تفريغ الصوت. اكتب ملخصك أو سجّل مجدداً.')) }
    finally { if (mounted.current) { setBusy(false); setMicTarget(null) } targetRef.current = null }
  }
  async function coach() {
    setBusy(true); setError('')
    const controller = new AbortController(); requestRef.current = controller
    try {
      const res = await fetch('/api/coach-debrief', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ doctorId, account, objective, successMeasure, lang, reflections }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      const parsed = parseDebriefResult(JSON.stringify(data.result))
      if (!parsed) throw new Error()
      setResult(parsed); setActiveId(data.id ?? null); setSaved(data.saved === true)
      void loadHistory()
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error && e.message === '429'
        ? copy('You have reached the hourly limit. Try again later.', 'وصلت للحد المسموح خلال الساعة. حاول لاحقاً.')
        : copy('Coaching is unavailable right now. Your text is still here; please retry.', 'التدريب غير متاح حالياً. إجاباتك ما زالت هنا؛ حاول مجدداً.'))
    } finally { if (mounted.current) setBusy(false) }
  }
  async function remove(id: string) {
    if (!window.confirm(copy('Delete this saved debrief?', 'هل تريد حذف هذه المراجعة؟'))) return
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/coach-debrief?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setEntries(prev => prev.filter(e => e.id !== id))
      if (activeId === id) { revise(); setAccount(''); setObjective(''); setSuccessMeasure(''); setReflections(emptyReflections) }
    } catch { setError(copy('Could not delete the debrief. Please retry.', 'تعذّر حذف المراجعة. حاول مجدداً.')) }
    finally { setBusy(false) }
  }
  if (practice && result?.report) return <TextSimulation doctor={practice} initialPracticeFocus={result.report.practiceFocus} onDone={() => setPractice(null)} />

  const reflectionsFields = [
    ['wentWell', copy('1. What good things did you do?', '١. ما الأشياء الجيدة التي قمت بها؟'), copy('What did you do that helped the conversation?', 'ما الذي قمت به وساعد في الحوار؟')],
    ['changeNextTime', copy('2. What would you change or what did you miss?', '٢. ما الذي ستغيّره أو ما الذي فاتك؟'), copy('What could you improve in the next call?', 'ما الذي يمكنك تحسينه في المكالمة القادمة؟')],
    ['objectiveReview', copy('3. Did you achieve your call objective? What evidence shows it?', '٣. هل حققت هدف المكالمة؟ ما الدليل؟'), copy('State what happened that supports your answer. It is okay if the evidence is unclear.', 'اذكر ما حدث ويدعم إجابتك. لا بأس إن لم يكن الدليل واضحاً.'),],
  ] as const
  const fields = [
    ['summary', copy('Your call, in brief', 'ملخص مكالمتك')],
    ['strength', copy('What to build on', 'ما يمكنك البناء عليه')],
    ['priority', copy('One thing to improve', 'نقطة واحدة للتحسين')],
    ['hypothesis', copy('A possible interpretation', 'تفسير محتمل')],
    ['betterResponse', copy('Try saying this', 'جرّب أن تقول')],
    ['objectiveReview', copy('Objective and evidence', 'الهدف والدليل')],
    ['nextAction', copy('Your next visit', 'زيارتك القادمة')],
  ] as const
  const selectedDoctor = doctors.find(d => d.id === doctorId)
  return <main dir={ar ? 'rtl' : 'ltr'} style={{ position: 'relative', zIndex: 1, maxWidth: 680, margin: '0 auto', padding: '24px 14px', color: 'var(--ink)', display: 'grid', gap: 18 }}>
    <header>
      <p style={{ color: 'var(--cyan)', fontFamily: 'var(--mono)', fontSize: 12 }}>{copy('REFLECT · LEARN · TRY AGAIN', 'راجِع · تعلّم · جرّب مجدداً')}</p>
      <h1 style={{ margin: '8px 0', fontSize: 32 }}>{copy('AI Coach', 'المدرب الذكي')}</h1>
      <p style={{ color: 'var(--ink-dim)', lineHeight: 1.6 }}>{copy('Reflect on a call with a specific doctor, then practice one improvement with the same AI Doctor.', 'راجع مكالمتك مع طبيب محدد، ثم تدرب على تحسين واحد مع الطبيب الذكي نفسه.')}</p>
    </header>
    {!doctors.length && <section style={card}>
      <p>{copy('No doctor profiles yet. Ask your manager to assign a doctor profile, or add one in Visit Prep before starting a debrief.', 'لا توجد ملفات أطباء بعد. اطلب من مديرك تعيين ملف طبيب، أو أضف ملفاً من التحضير للزيارة قبل البدء.')}</p>
    </section>}
    <section style={card} aria-label={copy('Call debrief', 'مراجعة المكالمة')}>
      <label style={{ display: 'grid', gap: 8, marginBottom: 18 }}>{copy('Which doctor was the call with?', 'مع أي طبيب كانت المكالمة؟')}
        <select aria-label={copy('Choose a doctor', 'اختر طبيباً')} value={doctorId} disabled={locked || !!result} onChange={e => setDoctorId(e.target.value)} style={inputStyle}>
          <option value="">{copy('Select a doctor', 'اختر طبيباً')}</option>{doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <label style={{ display: 'grid', gap: 8, marginBottom: 18 }}>{copy('What was your call objective?', 'ما هدف المكالمة؟')}
        <input value={objective} maxLength={500} disabled={locked || !!result} onChange={e => setObjective(e.target.value)} style={inputStyle} />
      </label>
      <label style={{ display: 'grid', gap: 8, marginBottom: 18 }}>{copy('How would you measure success?', 'كيف ستقيس النجاح؟')}
        <input value={successMeasure} maxLength={500} disabled={locked || !!result} onChange={e => setSuccessMeasure(e.target.value)} style={inputStyle} placeholder={copy('e.g. a specific next step is agreed', 'مثل: الاتفاق على خطوة تالية محددة')} />
      </label>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-dim)' }}>{copy('Record your own recollection after the call, up to 3 minutes. Audio is sent for transcription; review the text before coaching. Saved debriefs are private to your account.', 'سجّل ما تتذكره بعد المكالمة لمدة تصل إلى ٣ دقائق. يُرسل الصوت للتفريغ؛ راجع النص قبل التدريب. المراجعات المحفوظة خاصة بحسابك.')}</p>
      {!result && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <button style={ghostBtn} disabled={busy || micStarting || !!recorder.previewUrl || (recording && micTarget !== 'account')} onClick={recording ? () => void stopRecording() : () => void startRecording('account')}>
          {recording && micTarget === 'account' ? copy('Stop recording', 'إيقاف التسجيل') : micStarting && micTarget === 'account' ? copy('Opening microphone…', 'جارٍ فتح الميكروفون…') : copy('Record my recollection', 'سجّل ما تتذكره')}
        </button>
        {recording && micTarget === 'account' && <span role="status">{copy('Recording…', 'جارٍ التسجيل…')}</span>}
        {recorder.previewUrl && <>
          <audio controls src={recorder.previewUrl} aria-label={copy('Review call recollection', 'استمع إلى ملخص المكالمة')} style={{ width: '100%' }} />
          <button disabled={busy} style={ghostBtn} onClick={() => { targetRef.current = 'account'; void transcribe() }}>{copy('Transcribe recording', 'فرّغ التسجيل')}</button>
          <button disabled={busy} style={ghostBtn} onClick={recorder.discard}>{copy('Discard recording', 'إلغاء التسجيل')}</button>
        </>}
      </div>}
      <label style={{ display: 'grid', gap: 8 }}>{copy('What happened? Review or edit before coaching.', 'ماذا حدث؟ راجع النص أو عدّله قبل التدريب.')}
        <textarea rows={5} maxLength={12000} value={account} disabled={locked || !!result} onChange={e => setAccount(e.target.value)} style={inputStyle} placeholder={copy('What did the doctor say? How did you respond? What was agreed?', 'ماذا قال الطبيب؟ كيف رددت؟ وما الذي اتفقتما عليه؟')} />
      </label>
      {!result && reflectionsFields.map(([key, label, hint]) => {
        const mine = micTarget === key
        const micLabel = recording && mine ? copy('Stop and transcribe', 'إيقاف وتفريغ')
          : micStarting && mine ? copy('Opening microphone…', 'جارٍ فتح الميكروفون…')
          : busy && mine ? copy('Transcribing…', 'جارٍ التفريغ…')
          : copy('Answer by voice', 'أجب بالصوت')
        return <div key={key} style={{ display: 'grid', gap: 8, marginTop: 18 }}>
          <label style={{ display: 'grid', gap: 8 }}>{label}
            <textarea rows={3} maxLength={REFLECTION_MAX} value={reflections[key]} disabled={locked} onChange={e => setReflections(prev => ({ ...prev, [key]: e.target.value }))} style={inputStyle} placeholder={hint} />
          </label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" data-testid={`mic-${key}`} style={ghostBtn} disabled={busy || micStarting || !!recorder.previewUrl || (recording && !mine)} onClick={recording && mine ? () => void stopRecording() : () => void startRecording(key)}>🎙 {micLabel}</button>
            {recording && mine && <span role="status">{copy('Recording… up to 3 minutes', 'جارٍ التسجيل… حتى ٣ دقائق')}</span>}
          </div>
        </div>
      })}
      {!result && <button style={{ ...primaryBtn, marginTop: 16 }} disabled={locked || !doctorId || account.trim().length < 20 || !objective.trim() || !successMeasure.trim() || Object.values(reflections).some(v => !v.trim())} onClick={() => void coach()}>{copy('Get coaching', 'احصل على التدريب')}</button>}
      {result && <button disabled={locked} style={{ ...ghostBtn, marginTop: 12 }} onClick={revise}>{copy('Edit my debrief', 'تعديل مراجعتي')}</button>}
    </section>
    {busy && <p role="status">{copy('Working on your debrief…', 'جارٍ إعداد مراجعتك…')}</p>}
    {error && <p role="alert">{error}</p>}
    {result?.report && <section style={{ display: 'grid', gap: 12 }} aria-label={copy('Your coaching', 'تدريبك')}>
      <p>{copy(`Based on your account with ${selectedDoctor?.name ?? 'this doctor'} — interpretations are possibilities to explore.`, `بناءً على روايتك للمكالمة مع ${selectedDoctor?.name ?? 'هذا الطبيب'} — التفسيرات احتمالات للنقاش.`)}</p>
      {fields.map(([key, title]) => <article key={key} style={card}><h2 style={{ fontSize: 17, color: key === 'priority' ? 'var(--cyan)' : 'var(--ink)' }}>{title}</h2><p style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{(result.report as unknown as Record<string, string>)[key] ?? copy('Not included in this older saved debrief.', 'لم تُسجّل في هذه المراجعة القديمة.')}</p></article>)}
      <p role="status">{saved ? copy('Saved privately to your account.', 'حُفظت بشكل خاص في حسابك.') : copy('Coaching is ready, but could not be saved. Keep a copy before leaving.', 'التدريب جاهز لكن تعذّر حفظه. احتفظ بنسخة قبل المغادرة.')}</p>
      <div style={card}>
        <h2 style={{ fontSize: 18 }}>{copy('Practice this with AI Doctor', 'تدرّب على ذلك مع الطبيب الذكي')}</h2>
        <p style={{ lineHeight: 1.6 }}>{result.report.practiceFocus}</p>
        <label style={{ display: 'grid', gap: 8 }}>{copy('Practice with this doctor', 'تدرّب مع هذا الطبيب')}<select style={inputStyle} value={doctorId} onChange={e => setDoctorId(e.target.value)}><option value="">{copy('Select a doctor', 'اختر طبيباً')}</option>{doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <button style={{ ...primaryBtn, marginTop: 12 }} disabled={!doctorId || locked} onClick={() => setPractice(doctors.find(d => d.id === doctorId) ?? null)}>{copy('Practice this moment', 'تدرّب على هذا الموقف')}</button>
      </div>
      <button disabled={locked} style={ghostBtn} onClick={() => { revise(); setDoctorId(''); setAccount(''); setObjective(''); setSuccessMeasure(''); setReflections(emptyReflections) }}>{copy('Debrief another call', 'راجع مكالمة أخرى')}</button>
    </section>}
    <section style={card}>
      <h2 style={{ fontSize: 19 }}>{copy('Recent debriefs', 'المراجعات الأخيرة')}</h2>
      {historyLoading ? <p role="status">{copy('Loading history…', 'تحميل السجل…')}</p> : historyError ? <p>{copy('History is unavailable.', 'السجل غير متاح.')} <button style={ghostBtn} onClick={() => void loadHistory()}>{copy('Retry', 'إعادة المحاولة')}</button></p> : !entries.length ? <p style={{ color: 'var(--ink-dim)' }}>{copy('Your completed coaching will appear here.', 'ستظهر مراجعاتك المكتملة هنا.')}</p> : entries.map(entry => <div key={entry.id} style={{ borderTop: '1px solid var(--line)', padding: '14px 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button disabled={locked || !!recorder.previewUrl} style={{ ...ghostBtn, flex: 1, textAlign: 'start', letterSpacing: 0, textTransform: 'none' }} onClick={() => { setAccount(entry.input.account); setObjective(entry.input.objective); setSuccessMeasure(entry.input.successMeasure ?? ''); setReflections(entry.input.reflections ?? emptyReflections); setDoctorId(entry.doctor_id ?? entry.input.doctorId); setResult(entry.result); setSaved(true); setActiveId(entry.id); setError('') }}>
          <span style={{ display: 'block', marginBottom: 6 }}>{new Date(entry.created_at).toLocaleDateString(ar ? 'ar' : 'en')} · {entry.doctor_name ?? ''}</span>{entry.input.objective || entry.input.account.slice(0, 85)}
        </button>
        <button disabled={locked} style={ghostBtn} onClick={() => void remove(entry.id)} aria-label={copy('Delete debrief', 'حذف المراجعة')}>{copy('Delete', 'حذف')}</button>
      </div>)}
    </section>
  </main>
}
