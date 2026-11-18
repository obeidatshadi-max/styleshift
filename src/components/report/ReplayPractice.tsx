'use client'
import { useState } from 'react'
import { useLang } from '@/lib/i18n'
import VoiceRecorder from '@/components/game/VoiceRecorder'
import type { CoachingPriorityPlan, KeyMoment } from '@/lib/conversation-coach/types'
import type { PracticeFeedback, PracticeResult } from '@/lib/conversation-coach/practice'

const T = {
  title: { en: 'Replay practice', ar: 'تمرين إعادة اللحظة' },
  note: {
    en: 'This is a practice attempt, not a conversation with a real doctor. A spoken reply is turned into text by OpenAI; the text is checked by the configured AI service. Only the result is saved, not your words.',
    ar: 'هذه محاولة تدريب، وليست محادثة مع طبيب حقيقي. الرد المنطوق يحوّله OpenAI إلى نص، ثم تفحصه خدمة الذكاء الاصطناعي المهيأة. تُحفظ النتيجة فقط، وليس كلامك.',
  },
  step1: { en: '1. Listen to the moment again', ar: '١. استمع للحظة مرة أخرى' },
  step2: { en: '2. The doctor said', ar: '٢. قال الطبيب' },
  step3: { en: '3. Say your better reply (or type it)', ar: '٣. قل ردك الأفضل (أو اكتبه)' },
  criterion: { en: 'You will be checked against', ar: 'ستُقيَّم مقابل' },
  play: { en: '▶ Play the original moment', ar: '▶ شغّل اللحظة الأصلية' },
  noAudio: { en: 'The original audio is not available here (it is not stored). Read the doctor\'s words below.', ar: 'الصوت الأصلي غير متاح هنا (لا يُحفظ). اقرأ كلام الطبيب أدناه.' },
  placeholder: { en: 'Your reply…', ar: 'ردك…' },
  check: { en: 'Get feedback', ar: 'احصل على ملاحظات' },
  checking: { en: 'Checking…', ar: 'جارٍ التحقق…' },
  again: { en: 'Try again', ar: 'حاول مرة أخرى' },
  worked: { en: 'What worked', ar: 'ما نجح' },
  change: { en: 'One change for next time', ar: 'تغيير واحد للمرة القادمة' },
  fromReply: { en: 'From your reply', ar: 'من ردك' },
  notSaved: { en: 'Feedback shown, but this attempt could not be saved to your progress.', ar: 'ظهرت الملاحظات، لكن لم يمكن حفظ المحاولة في تقدمك.' },
  failed: { en: 'Feedback could not be created. Try again.', ar: 'تعذر إنشاء الملاحظات. حاول مرة أخرى.' },
  notConfigured: { en: 'Practice feedback is not switched on yet.', ar: 'ملاحظات التدريب غير مفعّلة بعد.' },
} as const

const RESULT: Record<PracticeResult, { en: string; ar: string; color: string }> = {
  met: { en: 'Criterion met', ar: 'تحقق المعيار', color: 'var(--green)' },
  partly: { en: 'Partly met', ar: 'تحقق جزئيًا', color: 'var(--amber)' },
  not_met: { en: 'Not met yet', ar: 'لم يتحقق بعد', color: 'var(--amber)' },
  unclear: { en: 'Could not tell', ar: 'غير واضح', color: 'var(--ink-dim)' },
}

const card: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, padding: '16px 16px 18px', marginBottom: 14 }
const label: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--ink-dim)', marginTop: 12 }
const body: React.CSSProperties = { fontSize: 16, lineHeight: 1.6, margin: '4px 0' }

export default function ReplayPractice({ sessionId, priority, moment, onReplay }: {
  sessionId: string; priority: CoachingPriorityPlan; moment: KeyMoment | null; onReplay: (() => void) | null
}) {
  const { lang: appLang } = useLang()
  const lang = appLang === 'ar' ? 'ar' : 'en'
  const [attempt, setAttempt] = useState('')
  const [state, setState] = useState<'idle' | 'checking' | 'done' | 'error' | 'off'>('idle')
  const [feedback, setFeedback] = useState<(PracticeFeedback & { saved: boolean }) | null>(null)

  async function check() {
    setState('checking')
    try {
      const res = await fetch('/api/reports/replay-practice', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, attempt, lang }),
      })
      if (res.status === 503) { setState('off'); return }
      if (!res.ok) { setState('error'); return }
      setFeedback(await res.json())
      setState('done')
    } catch { setState('error') }
  }

  const r = feedback ? RESULT[feedback.result] : null
  return <div style={{ ...card, borderColor: 'var(--purple)' }}>
    <h3 style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--purple)', margin: '0 0 6px' }}>{T.title[lang]}</h3>
    <p style={{ fontSize: 14, color: 'var(--ink-dim)', margin: 0 }}>{T.note[lang]}</p>

    {moment && <>
      <div style={label}>{T.step1[lang]}</div>
      {onReplay
        ? <button type="button" onClick={onReplay} style={{ cursor: 'pointer', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--purple)', color: 'var(--purple)', background: 'transparent', width: '100%' }}>{T.play[lang]}</button>
        : <p style={{ fontSize: 14, color: 'var(--ink-dim)' }}>{T.noAudio[lang]}</p>}
      <div style={label}>{T.step2[lang]}</div>
      <p dir="auto" style={{ ...body, fontStyle: 'italic' }}>&ldquo;{moment.cue.quote}&rdquo;</p>
    </>}

    <div style={label}>{T.criterion[lang]}</div>
    <p dir="auto" style={{ ...body, fontWeight: 600 }}>{priority.successCriterion}</p>

    <div style={label}>{T.step3[lang]}</div>
    <VoiceRecorder onTranscript={text => setAttempt(a => (a ? `${a} ${text}` : text))} />
    <textarea dir="auto" value={attempt} onChange={e => setAttempt(e.target.value)} placeholder={T.placeholder[lang]} rows={3} maxLength={1500}
      style={{ width: '100%', marginTop: 8, padding: 10, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-subtle)', color: 'var(--ink)', fontSize: 16 }} />
    <button type="button" disabled={attempt.trim().length < 3 || state === 'checking'} onClick={check}
      style={{ marginTop: 8, width: '100%', cursor: 'pointer', padding: '12px 16px', borderRadius: 10, background: 'var(--purple)', border: '1px solid var(--purple)', color: 'var(--on-accent)', opacity: attempt.trim().length < 3 ? 0.5 : 1 }}>
      {state === 'checking' ? T.checking[lang] : T.check[lang]}
    </button>

    {state === 'error' && <p role="alert" style={{ color: 'var(--red)', marginTop: 8 }}>{T.failed[lang]}</p>}
    {state === 'off' && <p role="status" style={{ color: 'var(--ink-dim)', marginTop: 8 }}>{T.notConfigured[lang]}</p>}
    {state === 'done' && feedback && r && <div role="status" style={{ marginTop: 12, border: `1px solid ${r.color}`, borderRadius: 12, padding: 12 }}>
      <b style={{ color: r.color }}>{r[lang]}</b>
      {feedback.quote && <><div style={label}>{T.fromReply[lang]}</div><p dir="auto" style={{ ...body, fontStyle: 'italic' }}>&ldquo;{feedback.quote}&rdquo;</p></>}
      {feedback.whatWorked && <><div style={label}>{T.worked[lang]}</div><p dir="auto" style={body}>{feedback.whatWorked}</p></>}
      {feedback.oneChange && <><div style={label}>{T.change[lang]}</div><p dir="auto" style={body}>{feedback.oneChange}</p></>}
      {!feedback.saved && <p style={{ fontSize: 14, color: 'var(--amber)' }}>{T.notSaved[lang]}</p>}
      <button type="button" onClick={() => { setAttempt(''); setFeedback(null); setState('idle') }}
        style={{ marginTop: 8, cursor: 'pointer', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink)', width: '100%' }}>{T.again[lang]}</button>
    </div>}
  </div>
}
