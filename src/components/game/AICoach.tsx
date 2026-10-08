'use client'
import { useEffect, useRef, useState } from 'react'
import { useLang } from '@/lib/i18n'
import { useDoctors } from '@/hooks/useDoctors'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { DEBRIEF_FOCUSES, parseDebriefResult, type ActionStatus, type DebriefFocus, type DebriefInput, type DebriefResult } from '@/lib/coach-debrief'
import { addPromise } from '@/lib/promises'
import { readCoachDrafts, writeCoachDrafts, type CoachDraft } from '@/lib/coach-drafts'
import TextSimulation, { card, primaryBtn, ghostBtn } from './TextSimulation'
import type { Doctor } from '@/types/game'

interface Entry { id: string; created_at: string; doctor_id: string | null; doctor_name: string | null; input: DebriefInput; result: DebriefResult }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--line)', borderRadius: 10, padding: 12, background: 'var(--panel)', color: 'var(--ink)', font: 'inherit' }
const emptyReflections = { wentWell: '', changeNextTime: '', objectiveReview: '' }
const FOCUS_LABEL: Record<DebriefFocus, (copy: (en: string, ar: string) => string) => string> = {
  opening: copy => copy('Opening', 'الافتتاح'),
  questions: copy => copy('Questions', 'الأسئلة'),
  objections: copy => copy('Objections', 'الاعتراضات'),
  closing: copy => copy('Closing', 'الإغلاق'),
}
type MicTarget = 'account' | keyof typeof emptyReflections
const REFLECTION_MAX = 2000
const ACCOUNT_MAX = 12000

export default function AICoach({ initialDoctorId = '' }: { initialDoctorId?: string } = {}) {
  const { lang } = useLang()
  const ar = lang === 'ar'
  const copy = (en: string, arabic: string) => ar ? arabic : en
  const { doctors, savePlan } = useDoctors()
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
  const [actionStatus, setActionStatus] = useState<ActionStatus | null>(null)
  const [focus, setFocus] = useState<DebriefFocus | null>(null)
  const [addedPromises, setAddedPromises] = useState<string[]>([])
  const [promiseError, setPromiseError] = useState(false)
  const [visitDate, setVisitDate] = useState('')
  const [practiceDoctorId, setPracticeDoctorId] = useState('')
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null)
  const [draftOwner, setDraftOwner] = useState<string | null>(null)
  const [draftWarning, setDraftWarning] = useState(false)
  const [latestForDoctor, setLatestForDoctor] = useState<{ doctorId: string; action?: string } | null>(null)
  const drafts = useRef<Record<string, CoachDraft>>({})
  const hydratedOwner = useRef<string | null>(null)
  const requestKey = useRef<{ id: string; fingerprint: string } | null>(null)
  const transcribing = useRef(false)
  const snapshot = useRef<CoachDraft | null>(null)
  snapshot.current = { doctorId, account, objective, successMeasure, visitDate, reflections, focus, actionStatus, result, saved, activeId, recoveryToken, request: requestKey.current }

  function restore(draft: CoachDraft) {
    setDoctorId(draft.doctorId); setAccount(draft.account); setObjective(draft.objective); setSuccessMeasure(draft.successMeasure)
    setVisitDate(draft.visitDate || ''); setReflections(draft.reflections); setFocus(draft.focus); setActionStatus(draft.actionStatus)
    setResult(draft.result); setSaved(draft.saved); setActiveId(draft.activeId); setRecoveryToken(draft.recoveryToken)
    requestKey.current = draft.request; setPracticeDoctorId('')
  }
  useEffect(() => {
    if (!draftOwner || !snapshot.current) return
    if (saved) delete drafts.current[doctorId]
    else drafts.current[doctorId] = snapshot.current
    setDraftWarning(!writeCoachDrafts(draftOwner, { selected: doctorId, drafts: drafts.current }))
  }, [draftOwner, doctorId, account, objective, successMeasure, visitDate, reflections, focus, actionStatus, result, saved, activeId, recoveryToken])

  const mounted = useRef(true)
  const requestRef = useRef<AbortController | null>(null)
  const targetRef = useRef<MicTarget | null>(null)
  // The 3-minute auto-stop fires from inside the recorder, so it must also finish the job the
  // Stop button would: a reflection answer is transcribed straight into its own field.
  const recorder = useAudioRecorder(null, lang, () => { setRecording(false); if (targetRef.current && targetRef.current !== 'account') void transcribe() })
  const locked = busy || recording || micStarting
  // History is newest-first, so the first match is the latest debrief for this doctor.
  const previousAction = latestForDoctor?.doctorId === doctorId ? latestForDoctor.action : doctorId ? entries.find(e => e.doctor_id === doctorId && e.result?.report?.nextAction)?.result.report?.nextAction : undefined
  useEffect(() => {
    if (!doctorId) return
    const controller = new AbortController()
    void fetch(`/api/coach-debrief?doctorId=${encodeURIComponent(doctorId)}`, { signal: controller.signal })
      .then(async res => { if (!res.ok) throw new Error(); return res.json() })
      .then(data => { if (!controller.signal.aborted) setLatestForDoctor({ doctorId, action: data.entries?.[0]?.result?.report?.nextAction }) })
      .catch(() => { /* keep the recent-history fallback when unavailable */ })
    return () => controller.abort()
  }, [doctorId, activeId])

  async function loadHistory() {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/coach-debrief')
      const data = await res.json()
      if (mounted.current && data.ownerId && hydratedOwner.current !== data.ownerId) {
        hydratedOwner.current = data.ownerId
        const cached = readCoachDrafts(data.ownerId)
        drafts.current = cached?.drafts ?? {}
        const selected = initialDoctorId || snapshot.current?.doctorId || cached?.selected || ''
        if (cached?.drafts[selected] && !snapshot.current?.account) restore(cached.drafts[selected])
        setDraftOwner(data.ownerId)
      }
      if (!res.ok) throw new Error()
      if (mounted.current) { setEntries(data.entries); setHistoryError(false) }
    } catch { if (mounted.current) { setHistoryError(true); if (!hydratedOwner.current) setDraftWarning(true) } }
    finally { if (mounted.current) setHistoryLoading(false) }
  }
  useEffect(() => {
    mounted.current = true
    void loadHistory()
    return () => { mounted.current = false; requestRef.current?.abort(); recorder.abort() }
  // recorder lifecycle is stable; cleanup only when leaving this section.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep drafts attached to their doctor, including automatically filled plans.
  function chooseDoctor(id: string) {
    if (snapshot.current && !saved) drafts.current[doctorId] = snapshot.current
    recorder.discard(); targetRef.current = null; setMicTarget(null); setError(''); setPracticeDoctorId('')
    const cached = drafts.current[id]
    if (cached) { restore(cached); return }
    const plan = doctors.find(d => d.id === id)
    restore({ doctorId: id, account: '', objective: plan?.plan_objective ?? '', successMeasure: plan?.plan_success_measure ?? '',
      visitDate: '', reflections: emptyReflections, focus: null, actionStatus: null, result: null, saved: null, activeId: null, recoveryToken: null, request: null })
  }
  // Arriving from a Home nudge selects that doctor once their profile list has loaded.
  const appliedInitial = useRef(false)
  useEffect(() => {
    if (appliedInitial.current || !initialDoctorId || !doctors.some(d => d.id === initialDoctorId)) return
    appliedInitial.current = true
    chooseDoctor(initialDoctorId)
  // chooseDoctor only reads state that is still empty on arrival.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDoctorId, doctors])
  async function trackPromise(text: string) {
    setPromiseError(false)
    if (await addPromise(doctorId, text)) setAddedPromises(prev => [...prev, `${doctorId}:${text}`])
    else setPromiseError(true)
  }
  function revise() { setResult(null); setSaved(null); setActiveId(null); setRecoveryToken(null); requestKey.current = null; setError(''); setActionStatus(null); setFocus(null) }
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
    if (transcribing.current) return
    const take = recorder.take(true)
    if (!take) return
    transcribing.current = true
    setBusy(true); setError('')
    const controller = new AbortController(); requestRef.current = controller
    const form = new FormData(); form.append('audio', take.blob); form.append('lang', lang)
    try {
      const res = await fetch('/api/transcribe', { method: 'POST', body: form, signal: controller.signal })
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (typeof data.text !== 'string' || !data.text.trim()) throw new Error()
      if (!mounted.current) return
      const append = (prev: string, max: number) => `${prev}${prev ? '\n' : ''}${data.text}`.slice(0, max)
      if (target === 'account') setAccount(prev => append(prev, ACCOUNT_MAX))
      else setReflections(prev => ({ ...prev, [target]: append(prev[target], REFLECTION_MAX) }))
      recorder.discard(); targetRef.current = null; setMicTarget(null)
    } catch { if (!controller.signal.aborted) setError(copy('Transcription unavailable. Your recording is still here; retry or discard it.', 'تعذّر تفريغ الصوت. تسجيلك محفوظ هنا؛ أعد المحاولة أو ألغِه.')) }
    finally { transcribing.current = false; if (mounted.current) setBusy(false) }
  }
  async function coach(saveOnly = false) {
    setBusy(true); setError('')
    const input = { doctorId, account, objective, successMeasure, lang, reflections, ...(visitDate ? { visitDate } : {}), ...(focus ? { focus } : {}), ...(previousAction && actionStatus ? { previousAction: { text: previousAction, status: actionStatus } } : {}) }
    const fingerprint = JSON.stringify(input)
    if (!requestKey.current || requestKey.current.fingerprint !== fingerprint) requestKey.current = { id: crypto.randomUUID(), fingerprint }
    // Persist the operation ID before the request, including the lost-response case.
    if (draftOwner && snapshot.current) {
      drafts.current[doctorId] = { ...snapshot.current, request: requestKey.current }
      setDraftWarning(!writeCoachDrafts(draftOwner, { selected: doctorId, drafts: drafts.current }))
    }
    const controller = new AbortController(); requestRef.current = controller
    try {
      const res = await fetch('/api/coach-debrief', {
        method: saveOnly ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify(saveOnly ? { recoveryToken } : { ...input, requestId: requestKey.current.id }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      const parsed = parseDebriefResult(JSON.stringify(data.result))
      if (!parsed) throw new Error()
      setResult(parsed); setActiveId(data.id ?? null); setSaved(data.saved === true); setRecoveryToken(data.recoveryToken ?? null)
      // The plan has been debriefed, so clear it; a plan the rep edited away from stays put.
      const planned = doctors.find(d => d.id === doctorId)
      if (data.saved === true && planned?.plan_objective && planned.plan_objective === objective.trim() && (planned.plan_success_measure ?? '') === successMeasure.trim()) void savePlan(planned.id, null)
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
    ['wentWell', copy('1. What good things did you do? (optional)', '١. ما الأشياء الجيدة التي قمت بها؟ (اختياري)'), copy('What did you do that helped the conversation?', 'ما الذي قمت به وساعد في الحوار؟')],
    ['changeNextTime', copy('2. What would you change or what did you miss? (optional)', '٢. ما الذي ستغيّره أو ما الذي فاتك؟ (اختياري)'), copy('What could you improve in the next call?', 'ما الذي يمكنك تحسينه في المكالمة القادمة؟')],
    ['objectiveReview', copy('3. Did you achieve your call objective? What evidence shows it? (optional)', '٣. هل حققت هدف المكالمة؟ ما الدليل؟ (اختياري)'), copy('State what happened that supports your answer. It is okay if the evidence is unclear.', 'اذكر ما حدث ويدعم إجابتك. لا بأس إن لم يكن الدليل واضحاً.'),],
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
        <select aria-label={copy('Choose a doctor', 'اختر طبيباً')} value={doctorId} disabled={locked || !!result || !!recorder.previewUrl} onChange={e => chooseDoctor(e.target.value)} style={inputStyle}>
          <option value="">{copy('Select a doctor', 'اختر طبيباً')}</option>{doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <label style={{ display: 'grid', gap: 8, marginBottom: 18 }}>{copy('Visit date (optional)', 'تاريخ الزيارة (اختياري)')}<input type="date" value={visitDate} disabled={locked || !!result} onChange={e => setVisitDate(e.target.value)} style={inputStyle} /></label>
      {!result && previousAction && <div role="group" aria-label={copy('Last planned action', 'الإجراء المخطط له سابقاً')} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 18, display: 'grid', gap: 10 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-dim)' }}>{copy('Last time you planned:', 'خطتك في المرة السابقة:')}</p>
        <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{previousAction}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {([['done', copy('Done', 'تم'), ], ['partly', copy('Partly', 'جزئياً')], ['not_done', copy('Not yet', 'لم يتم بعد')]] as const).map(([value, label]) =>
            <button key={value} type="button" aria-pressed={actionStatus === value} disabled={locked}
              style={{ ...ghostBtn, ...(actionStatus === value ? { borderColor: 'var(--cyan)', color: 'var(--cyan)' } : {}) }}
              onClick={() => setActionStatus(actionStatus === value ? null : value)}>{label}</button>)}
        </div>
      </div>}
      {!result && <div role="group" aria-label={copy('Coaching focus (optional)', 'محور التدريب (اختياري)')} style={{ marginBottom: 18 }}>
        <p style={{ margin: '0 0 8px' }}>{copy('Coaching focus (optional)', 'محور التدريب (اختياري)')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DEBRIEF_FOCUSES.map(value => <button key={value} type="button" aria-pressed={focus === value} disabled={locked}
            style={{ ...ghostBtn, ...(focus === value ? { borderColor: 'var(--cyan)', color: 'var(--cyan)' } : {}) }}
            onClick={() => setFocus(focus === value ? null : value)}>{FOCUS_LABEL[value](copy)}</button>)}
        </div>
      </div>}
      <label style={{ display: 'grid', gap: 8, marginBottom: 18 }}>{copy('What was your call objective? (optional)', 'ما هدف المكالمة؟ (اختياري)')}
        <input value={objective} maxLength={500} disabled={locked || !!result} onChange={e => setObjective(e.target.value)} style={inputStyle} />
      </label>
      <label style={{ display: 'grid', gap: 8, marginBottom: 18 }}>{copy('How would you measure success? (optional)', 'كيف ستقيس النجاح؟ (اختياري)')}
        <input value={successMeasure} maxLength={500} disabled={locked || !!result} onChange={e => setSuccessMeasure(e.target.value)} style={inputStyle} placeholder={copy('e.g. a specific next step is agreed', 'مثل: الاتفاق على خطوة تالية محددة')} />
      </label>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-dim)' }}>{copy('Record your own recollection after the call, up to 3 minutes. Audio is sent for transcription; review the text before coaching. Unsaved drafts stay in this browser tab on this device. Saved debriefs are private to your account.', 'سجّل ما تتذكره بعد المكالمة لمدة تصل إلى ٣ دقائق. يُرسل الصوت للتفريغ؛ راجع النص قبل التدريب. تبقى المسودات غير المحفوظة في علامة التبويب على هذا الجهاز. المراجعات المحفوظة خاصة بحسابك.')}</p>
      {!result && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <button style={ghostBtn} disabled={busy || micStarting || !!recorder.previewUrl || (recording && micTarget !== 'account')} onClick={recording ? () => void stopRecording() : () => void startRecording('account')}>
          {recording && micTarget === 'account' ? copy('Stop recording', 'إيقاف التسجيل') : micStarting && micTarget === 'account' ? copy('Opening microphone…', 'جارٍ فتح الميكروفون…') : copy('Record my recollection', 'سجّل ما تتذكره')}
        </button>
        {recording && micTarget === 'account' && <span role="status">{copy('Recording…', 'جارٍ التسجيل…')}</span>}
        {recorder.previewUrl && <>
          <audio controls src={recorder.previewUrl} aria-label={copy('Review call recollection', 'استمع إلى ملخص المكالمة')} style={{ width: '100%' }} />
          <button disabled={busy} style={ghostBtn} onClick={() => void transcribe()}>{copy('Transcribe recording', 'فرّغ التسجيل')}</button>
          <button disabled={busy} style={ghostBtn} onClick={() => { recorder.discard(); targetRef.current = null; setMicTarget(null) }}>{copy('Discard recording', 'إلغاء التسجيل')}</button>
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
      {!result && <button style={{ ...primaryBtn, marginTop: 16 }} disabled={locked || !!recorder.previewUrl || !doctorId || account.trim().length < 20} onClick={() => void coach()}>{copy('Get coaching', 'احصل على التدريب')}</button>}
      {result && <button disabled={locked} style={{ ...ghostBtn, marginTop: 12 }} onClick={revise}>{copy('Edit my debrief', 'تعديل مراجعتي')}</button>}
    </section>
    {draftWarning && <p role="alert">{copy('This browser could not keep a recovery draft. Keep a copy before leaving.', 'تعذّر حفظ مسودة للاستعادة في هذا المتصفح. احتفظ بنسخة قبل المغادرة.')}</p>}
    {busy && <p role="status">{copy('Working on your debrief…', 'جارٍ إعداد مراجعتك…')}</p>}
    {error && <p role="alert">{error}</p>}
    {result?.report && <section style={{ display: 'grid', gap: 12 }} aria-label={copy('Your coaching', 'تدريبك')}>
      <p>{copy(`Based on your account with ${selectedDoctor?.name ?? 'this doctor'} — interpretations are possibilities to explore.`, `بناءً على روايتك للمكالمة مع ${selectedDoctor?.name ?? 'هذا الطبيب'} — التفسيرات احتمالات للنقاش.`)}</p>
      {fields.map(([key, title]) => <article key={key} style={card}><h2 style={{ fontSize: 17, color: key === 'priority' ? 'var(--cyan)' : 'var(--ink)' }}>{title}</h2><p style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{(result.report as unknown as Record<string, string>)[key] ?? copy('Not included in this older saved debrief.', 'لم تُسجّل في هذه المراجعة القديمة.')}</p></article>)}
      {!!result.promises?.length && <article style={card} aria-label={copy('Promises I spotted', 'وعود لاحظتُها')}>
        <h2 style={{ fontSize: 17 }}>{copy('Promises I spotted', 'وعود لاحظتُها')}</h2>
        <p style={{ lineHeight: 1.6, color: 'var(--ink-dim)', fontSize: 13 }}>{copy('Add the ones you really made, so you do not forget them.', 'أضف ما وعدت به فعلاً حتى لا تنساه.')}</p>
        {result.promises.map(text => {
          const added = addedPromises.includes(`${doctorId}:${text}`)
          return <div key={text} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--line)', padding: '10px 0' }}>
            <span style={{ flex: 1, lineHeight: 1.6 }}>{text}</span>
            <button style={ghostBtn} disabled={added || !doctorId} onClick={() => void trackPromise(text)}>{added ? copy('Added', 'تمت الإضافة') : copy('Add to my promises', 'أضف إلى وعودي')}</button>
          </div>
        })}
        {promiseError && <p role="alert">{copy('Could not add the promise. Please try again.', 'تعذّرت إضافة الوعد. حاول مجدداً.')}</p>}
      </article>}
      <p role="status">{saved ? copy('Saved privately to your account.', 'حُفظت بشكل خاص في حسابك.') : copy('Coaching is ready, but could not be saved. Keep a copy before leaving.', 'التدريب جاهز لكن تعذّر حفظه. احتفظ بنسخة قبل المغادرة.')}</p>
      {!saved && recoveryToken && <button disabled={locked} style={primaryBtn} onClick={() => void coach(true)}>{copy('Retry saving', 'إعادة محاولة الحفظ')}</button>}
      <div style={card}>
        <h2 style={{ fontSize: 18 }}>{copy('Practice this with AI Doctor', 'تدرّب على ذلك مع الطبيب الذكي')}</h2>
        <p style={{ lineHeight: 1.6 }}>{result.report.practiceFocus}</p>
        <label style={{ display: 'grid', gap: 8 }}>{copy('Practice with this doctor', 'تدرّب مع هذا الطبيب')}<select style={inputStyle} value={practiceDoctorId || doctorId} onChange={e => setPracticeDoctorId(e.target.value)}><option value="">{copy('Select a doctor', 'اختر طبيباً')}</option>{doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <button style={{ ...primaryBtn, marginTop: 12 }} disabled={!doctorId || locked} onClick={() => setPractice(doctors.find(d => d.id === (practiceDoctorId || doctorId)) ?? null)}>{copy('Practice this moment', 'تدرّب على هذا الموقف')}</button>
      </div>
      <button disabled={locked} style={ghostBtn} onClick={() => { delete drafts.current[doctorId]; revise(); setDoctorId(''); setAccount(''); setObjective(''); setSuccessMeasure(''); setVisitDate(''); setReflections(emptyReflections) }}>{copy('Debrief another call', 'راجع مكالمة أخرى')}</button>
    </section>}
    <section style={card}>
      <h2 style={{ fontSize: 19 }}>{copy('Recent debriefs', 'المراجعات الأخيرة')}</h2>
      {historyLoading ? <p role="status">{copy('Loading history…', 'تحميل السجل…')}</p> : historyError ? <p>{copy('History is unavailable.', 'السجل غير متاح.')} <button style={ghostBtn} onClick={() => void loadHistory()}>{copy('Retry', 'إعادة المحاولة')}</button></p> : !entries.length ? <p style={{ color: 'var(--ink-dim)' }}>{copy('Your completed coaching will appear here.', 'ستظهر مراجعاتك المكتملة هنا.')}</p> : entries.map(entry => <div key={entry.id} style={{ borderTop: '1px solid var(--line)', padding: '14px 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button disabled={locked || !!recorder.previewUrl || (!!account && !saved)} style={{ ...ghostBtn, flex: 1, textAlign: 'start', letterSpacing: 0, textTransform: 'none' }} onClick={() => { setAccount(entry.input.account); setObjective(entry.input.objective); setSuccessMeasure(entry.input.successMeasure ?? ''); setReflections(entry.input.reflections ?? emptyReflections); setDoctorId(entry.doctor_id ?? entry.input.doctorId); setVisitDate(entry.input.visitDate ?? ''); setRecoveryToken(null); setPracticeDoctorId(''); setFocus(entry.input.focus ?? null); setResult(entry.result); setSaved(true); setActiveId(entry.id); setError('') }}>
          <span style={{ display: 'block', marginBottom: 6 }}>{new Date(entry.created_at).toLocaleDateString(ar ? 'ar' : 'en')} · {entry.doctor_name ?? ''}</span>{entry.input.objective || entry.input.account.slice(0, 85)}
        </button>
        <button disabled={locked} style={ghostBtn} onClick={() => void remove(entry.id)} aria-label={copy('Delete debrief', 'حذف المراجعة')}>{copy('Delete', 'حذف')}</button>
      </div>)}
    </section>
  </main>
}
