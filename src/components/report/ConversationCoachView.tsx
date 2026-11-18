'use client'
import { useEffect, useRef, useState } from 'react'
import { useLang } from '@/lib/i18n'
import type {
  Addressed, ConfidenceLabel, ConversationCoach, CueType, KeyMoment, LanguageCategory, OpportunityMeasure, SegmentRef, Stage,
} from '@/lib/conversation-coach/types'
import ReplayPractice from './ReplayPractice'
import CoachProgress from './CoachProgress'

type L = 'en' | 'ar'
const T = {
  snapshot: { en: 'Conversation snapshot', ar: 'لمحة عن المحادثة' },
  limits: { en: 'Recording quality and limits', ar: 'جودة التسجيل وحدود التحليل' },
  checkWords: { en: 'Words the transcription service was unsure of (check them in the transcript above):', ar: 'كلمات لم تكن خدمة التفريغ متأكدة منها (راجعها في النص أعلاه):' },
  topic: { en: 'Main topic', ar: 'الموضوع الرئيسي' },
  priorities: { en: 'What the doctor said matters', ar: 'ما قال الطبيب إنه مهم' },
  approach: { en: 'Your approach', ar: 'أسلوبك' },
  nextStep: { en: 'Agreed next step', ar: 'الخطوة التالية المتفق عليها' },
  notObserved: { en: 'Not observed in this recording', ar: 'لم تظهر في هذا التسجيل' },
  moments: { en: 'Key moments', ar: 'لحظات مهمة' },
  noMoments: { en: 'Not enough clear evidence for key moments in this recording. That is a valid result, not a failure.', ar: 'لا توجد أدلة واضحة كافية للحظات مهمة في هذا التسجيل. هذه نتيجة مقبولة وليست فشلاً.' },
  doctor: { en: 'Doctor', ar: 'الطبيب' },
  you: { en: 'You', ar: 'أنت' },
  noReply: { en: 'No reply from you was found after this.', ar: 'لم نجد ردًا منك بعد هذا.' },
  observed: { en: 'Observed', ar: 'ما حدث' },
  reading: { en: 'Possible reading', ar: 'قراءة محتملة' },
  alternative: { en: 'Another possible reason', ar: 'سبب محتمل آخر' },
  evidenceStrength: { en: 'Evidence strength', ar: 'قوة الدليل' },
  next: { en: 'What the doctor said next', ar: 'ماذا قال الطبيب بعدها' },
  tryInstead: { en: 'You could try', ar: 'يمكنك أن تجرب' },
  tryNote: { en: 'A suggestion to practise, not a promise of how the doctor would react.', ar: 'اقتراح للتدريب، وليس وعدًا بكيف سيتفاعل الطبيب.' },
  practice: { en: 'Practice', ar: 'تمرين' },
  replay: { en: 'Replay this moment', ar: 'أعد الاستماع لهذه اللحظة' },
  replayGone: { en: 'Replay is available only on this device until you leave this screen (the audio is not stored).', ar: 'إعادة الاستماع متاحة فقط على هذا الجهاز حتى تغادر هذه الشاشة (الصوت لا يُحفظ).' },
  priority: { en: 'One thing to practise', ar: 'شيء واحد للتدريب' },
  why: { en: 'Why it matters here', ar: 'لماذا هو مهم هنا' },
  success: { en: 'Success looks like', ar: 'النجاح يعني' },
  patterns: { en: 'Communication patterns (details)', ar: 'أنماط التواصل (تفاصيل)' },
  measuredNote: { en: 'Measured by the app from the timing and words of the recording. No ideal values are implied.', ar: 'يقيسها التطبيق من توقيت التسجيل وكلماته. لا توجد قيم مثالية مفترضة.' },
  structure: { en: 'Conversation structure', ar: 'بنية المحادثة' },
  claims: { en: 'Evidence claims you made', ar: 'ادعاءات علمية ذكرتها' },
  claimNote: { en: 'Listed only. Scientific accuracy: not verified (no approved reference source was checked).', ar: 'مذكورة فقط. الدقة العلمية: لم يتم التحقق (لم تتم مراجعة مصدر معتمد).' },
  opportunities: { en: 'Skill opportunities in this recording', ar: 'فرص المهارة في هذا التسجيل' },
  na: { en: 'Not applicable (no opportunity in this recording)', ar: 'لا ينطبق (لا توجد فرصة في هذا التسجيل)' },
  language: { en: 'Language patterns', ar: 'أنماط اللغة' },
  languageNote: { en: 'Word counts only. They describe wording in this conversation, not a person\'s type or feelings.', ar: 'عدد كلمات فقط. تصف الصياغة في هذه المحادثة، وليس نوع الشخص أو مشاعره.' },
  delivery: { en: 'Your delivery', ar: 'طريقة إلقائك' },
  notMeasured: { en: 'Not measured', ar: 'غير مُقاس' },
  synthetic: { en: 'SYNTHETIC EXAMPLE — development fixture, not an analysis of a real conversation', ar: 'مثال مُصطنع — بيانات تطوير، وليس تحليلاً لمحادثة حقيقية' },
  insufficient: { en: 'The coaching part of the analysis did not return usable evidence. Measured data is still shown.', ar: 'جزء التدريب من التحليل لم يُرجع أدلة صالحة. البيانات المقاسة ما زالت معروضة.' },
} as const

const ADDRESSED_TEXT: Record<Addressed, { en: string; ar: string; color: string }> = {
  addressed: { en: 'Addressed the cue', ar: 'تعامل مع الإشارة', color: 'var(--green)' },
  partly: { en: 'Partly addressed', ar: 'تعامل جزئيًا', color: 'var(--amber)' },
  not_addressed: { en: 'Did not address the cue', ar: 'لم يتعامل مع الإشارة', color: 'var(--amber)' },
  unclear: { en: 'Unclear', ar: 'غير واضح', color: 'var(--ink-dim)' },
}
const CUE_TEXT: Record<CueType, { en: string; ar: string }> = {
  concern: { en: 'Concern', ar: 'قلق' }, question: { en: 'Question', ar: 'سؤال' },
  evidence_request: { en: 'Evidence request', ar: 'طلب دليل' }, time_pressure: { en: 'Time pressure', ar: 'ضيق وقت' },
  interest: { en: 'Interest', ar: 'اهتمام' }, practical_issue: { en: 'Practical issue', ar: 'مسألة عملية' }, other: { en: 'Cue', ar: 'إشارة' },
}
const CONF_TEXT: Record<ConfidenceLabel, { en: string; ar: string }> = {
  high: { en: 'high', ar: 'عالية' }, medium: { en: 'medium', ar: 'متوسطة' }, low: { en: 'low', ar: 'منخفضة' }, insufficient: { en: 'insufficient', ar: 'غير كافية' },
}
const STAGE_TEXT: Record<Stage, { en: string; ar: string }> = {
  opening: { en: 'Opening and purpose', ar: 'الافتتاح والهدف' }, needs_discovery: { en: 'Needs discovery', ar: 'اكتشاف الاحتياجات' },
  product_evidence: { en: 'Product or evidence discussion', ar: 'نقاش المنتج أو الأدلة' }, concerns: { en: 'Concerns and objections', ar: 'المخاوف والاعتراضات' },
  closing: { en: 'Closing and follow-up', ar: 'الختام والمتابعة' },
}
const OPP_TEXT: Record<OpportunityMeasure['key'], { en: string; ar: string }> = {
  concerns_clarified: { en: 'Concerns clarified before answering', ar: 'مخاوف وضّحتها قبل الإجابة' },
  follow_up_questions: { en: 'Follow-up questions', ar: 'أسئلة متابعة' },
  listening_summaries: { en: 'Listening summaries', ar: 'تلخيصات تدل على الاستماع' },
  next_step_agreed: { en: 'Next step agreed', ar: 'خطوة تالية متفق عليها' },
}
const LANG_TEXT: Record<LanguageCategory, { en: string; ar: string }> = {
  certainty: { en: 'Certainty', ar: 'يقين' }, qualification: { en: 'Qualification (maybe, I think)', ar: 'تحفّظ (ربما، أظن)' },
  generalization: { en: 'Generalisation (always, never)', ar: 'تعميم (دائمًا، أبدًا)' }, obligation: { en: 'Obligation (must, should)', ar: 'إلزام (لازم، يجب)' },
  choice: { en: 'Choice language', ar: 'لغة الاختيار' }, risk_concern: { en: 'Risk and concern', ar: 'خطر وقلق' },
  evidence_request: { en: 'Evidence requests', ar: 'طلب أدلة' }, practical_concern: { en: 'Cost, access, adherence, follow-up', ar: 'سعر، توفر، التزام، متابعة' },
  conditional_interest: { en: 'Conditional interest', ar: 'اهتمام مشروط' }, commitment: { en: 'Explicit commitments', ar: 'التزامات صريحة' },
  sensory_predicate: { en: 'Sensory wording (I see, sounds, I feel)', ar: 'كلمات حسية (أشوف، أسمع، أحس)' },
}
const DELIVERY_TEXT = {
  speaking_rate: { en: 'Speaking rate', ar: 'سرعة الكلام' }, pauses_and_fillers: { en: 'Pauses and fillers', ar: 'توقفات وكلمات حشو' },
  pitch_range: { en: 'Pitch range', ar: 'مدى النبرة' }, intensity: { en: 'Loudness changes', ar: 'تغيّر علو الصوت' },
} as const

const card: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, padding: '16px 16px 18px', marginBottom: 14 }
const h: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--cyan)', margin: '0 0 10px' }
const label: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--ink-dim)', marginTop: 10 }
const body: React.CSSProperties = { fontSize: 16, lineHeight: 1.6, margin: '4px 0' }
const mmss = (s: number | null) => s === null ? '' : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function Quote({ seg, who, lang }: { seg: SegmentRef; who: 'doctor' | 'you'; lang: L }) {
  return <p dir="auto" style={{ ...body, fontStyle: 'italic', color: 'var(--ink-dim)', paddingInlineStart: 10, borderInlineStart: '2px solid var(--line)' }}>
    <b style={{ fontStyle: 'normal', color: 'var(--ink)' }}>{T[who][lang]}{seg.startSec !== null ? ` · ${mmss(seg.startSec)}` : ''}:</b> &ldquo;{seg.quote}&rdquo;
  </p>
}

function Details({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return <div style={{ ...card, padding: 0 }}>
    <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}
      style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--cyan)', fontFamily: 'var(--mono)', fontSize: 14, textAlign: 'start' }}>
      <span>{title}</span><span>{open ? '−' : '+'}</span>
    </button>
    {open && <div style={{ padding: '0 16px 16px' }}>{children}</div>}
  </div>
}

/** Plays one segment of the in-memory recording: seek to the start, stop at the end. */
function useSegmentPlayer(audioUrl: string | null) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const stopAt = useRef<number | null>(null)
  useEffect(() => {
    if (!audioUrl) return
    const a = new Audio(audioUrl)
    const onTime = () => { if (stopAt.current !== null && a.currentTime >= stopAt.current) { a.pause(); stopAt.current = null } }
    a.addEventListener('timeupdate', onTime)
    audio.current = a
    return () => { a.pause(); a.removeEventListener('timeupdate', onTime); audio.current = null }
  }, [audioUrl])
  return (start: number, end: number) => {
    const a = audio.current
    if (!a) return
    a.currentTime = Math.max(0, start - 0.3)
    stopAt.current = end + 0.3
    void a.play().catch(() => {})
  }
}

function MomentCard({ m, lang, play }: { m: KeyMoment; lang: L; play: ((s: number, e: number) => void) | null }) {
  const f = m.finding
  const a = ADDRESSED_TEXT[m.addressed]
  const canReplay = play && f.start_time !== null && f.end_time !== null
  return <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 6 }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{mmss(f.start_time)}</span>
      <span style={{ fontSize: 13, border: '1px solid var(--line)', borderRadius: 20, padding: '1px 8px' }}>{CUE_TEXT[m.cueType][lang]}</span>
      <span style={{ fontSize: 13, border: `1px solid ${a.color}`, color: a.color, borderRadius: 20, padding: '1px 8px' }}>{a[lang]}</span>
    </div>
    <Quote seg={m.cue} who="doctor" lang={lang} />
    {m.response ? <Quote seg={m.response} who="you" lang={lang} /> : <p dir="auto" style={{ ...body, color: 'var(--ink-dim)' }}>{T.noReply[lang]}</p>}
    <div style={label}>{T.observed[lang]}</div>
    <p dir="auto" style={body}>{f.observation}</p>
    {f.interpretation && <>
      <div style={label}>{T.reading[lang]}</div>
      <p dir="auto" style={body}>{f.interpretation}</p>
      {f.alternative_explanation && <p dir="auto" style={{ ...body, color: 'var(--ink-dim)' }}>{T.alternative[lang]}: {f.alternative_explanation}</p>}
    </>}
    <p dir="auto" style={{ fontSize: 14, color: 'var(--ink-dim)', margin: '6px 0' }}>
      {T.evidenceStrength[lang]}: {CONF_TEXT[f.confidence_label][lang]}{f.confidence_reason ? ` — ${f.confidence_reason}` : ''}
    </p>
    {f.limitations.length > 0 && <ul style={{ fontSize: 14, color: 'var(--amber)', margin: '4px 0', paddingInlineStart: 18 }}>{f.limitations.map(l => <li key={l} dir="auto">{l}</li>)}</ul>}
    {m.whatHappenedNext && <><div style={label}>{T.next[lang]}</div><Quote seg={m.whatHappenedNext} who="doctor" lang={lang} /></>}
    {f.suggested_response && <>
      <div style={label}>{T.tryInstead[lang]}</div>
      <p dir="auto" style={{ ...body, fontWeight: 600 }}>&ldquo;{f.suggested_response}&rdquo;</p>
      <p style={{ fontSize: 13, color: 'var(--ink-dim)', margin: 0 }}>{T.tryNote[lang]}</p>
    </>}
    {f.practice_task && <><div style={label}>{T.practice[lang]}</div><p dir="auto" style={body}>{f.practice_task}</p></>}
    {canReplay && <button type="button" onClick={() => play!(f.start_time!, f.end_time!)}
      style={{ marginTop: 8, cursor: 'pointer', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'transparent', width: '100%' }}>
      ▶ {T.replay[lang]} ({mmss(f.start_time)}–{mmss(f.end_time)})
    </button>}
  </div>
}

function Opportunity({ o, lang }: { o: OpportunityMeasure; lang: L }) {
  const value = o.notApplicable ? T.na[lang]
    : o.denominator === null ? String(o.numerator)
    : o.key === 'next_step_agreed' ? (o.numerator ? (lang === 'ar' ? 'نعم' : 'Yes') : (lang === 'ar' ? 'لا' : 'No'))
    : (lang === 'ar' ? `${o.numerator} من ${o.denominator}` : `${o.numerator} of ${o.denominator}`)
  return <div style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 16 }}><span>{OPP_TEXT[o.key][lang]}</span><b style={{ fontFamily: 'var(--mono)' }}>{value}</b></div>
    <p style={{ fontSize: 14, color: 'var(--ink-dim)', margin: '2px 0 0' }}>{o.definition}</p>
  </div>
}

export default function ConversationCoachView({ coach, sessionId, audioUrl }: { coach: ConversationCoach; sessionId: string; audioUrl: string | null }) {
  const { lang: appLang } = useLang()
  const lang: L = appLang === 'ar' ? 'ar' : 'en'
  const play = useSegmentPlayer(audioUrl)
  const q = coach.quality
  const s = coach.snapshot
  const priorityMoment = coach.keyMoments.find(m => m.id === coach.priority?.momentId) ?? null
  const rep = coach.interaction.speakers.find(x => x.role === 'rep')
  const doc = coach.interaction.speakers.find(x => x.role === 'counterpart')

  return <section aria-label={T.snapshot[lang]} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
    {coach.synthetic && <p role="note" style={{ ...card, borderColor: 'var(--purple)', color: 'var(--purple)', fontFamily: 'var(--mono)', fontSize: 14 }}>{T.synthetic[lang]}</p>}

    {/* A. Snapshot */}
    <div style={card}>
      <h3 style={h}>{T.snapshot[lang]}</h3>
      {q.limitations.length > 0 && <div style={{ border: '1px solid var(--amber)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
        <div style={{ ...label, marginTop: 0, color: 'var(--amber)' }}>{T.limits[lang]}</div>
        <ul style={{ margin: '4px 0 0', paddingInlineStart: 18, fontSize: 15, lineHeight: 1.5 }}>{q.limitations.map(l => <li key={l} dir="auto">{l}</li>)}</ul>
        {q.uncertainWords.length > 0 && <>
          <p style={{ fontSize: 14, margin: '8px 0 4px' }}>{T.checkWords[lang]}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{q.uncertainWords.map((w, i) =>
            <span key={i} dir="auto" style={{ fontSize: 14, border: '1px solid var(--line)', borderRadius: 8, padding: '2px 8px' }}>
              {w.word}{w.startSec !== null ? ` · ${mmss(w.startSec)}` : ''}
            </span>)}</div>
        </>}
      </div>}
      {coach.insufficientEvidence && <p dir="auto" style={{ ...body, color: 'var(--ink-dim)' }}>{T.insufficient[lang]}</p>}
      {s.mainTopic && <><div style={label}>{T.topic[lang]}</div><p dir="auto" style={body}>{s.mainTopic}</p></>}
      {s.doctorPriorities.length > 0 && <><div style={label}>{T.priorities[lang]}</div>
        {s.doctorPriorities.map((p, i) => <div key={i}><p dir="auto" style={{ ...body, fontWeight: 600 }}>{p.text}</p><Quote seg={p.evidence} who="doctor" lang={lang} /></div>)}</>}
      {s.repApproach && <><div style={label}>{T.approach[lang]}</div><p dir="auto" style={body}>{s.repApproach}</p></>}
      <div style={label}>{T.nextStep[lang]}</div>
      {s.nextStep.agreed ? <>{s.nextStep.text && <p dir="auto" style={body}>{s.nextStep.text}</p>}{s.nextStep.evidence.map(e => <Quote key={e.segmentIndex} seg={e} who={e.speakerRole === 'rep' ? 'you' : 'doctor'} lang={lang} />)}</>
        : <p dir="auto" style={{ ...body, color: 'var(--ink-dim)' }}>{T.notObserved[lang]}</p>}
    </div>

    {/* D. One coaching priority (shown before the moments: the one thing to take away) */}
    {coach.priority && <div style={{ ...card, borderColor: 'var(--cyan)' }}>
      <h3 style={h}>{T.priority[lang]}</h3>
      <p dir="auto" style={{ ...body, fontWeight: 700 }}>{coach.priority.behavior}</p>
      {coach.priority.whyItMatters && <><div style={label}>{T.why[lang]}</div><p dir="auto" style={body}>{coach.priority.whyItMatters}</p></>}
      <div style={label}>{T.success[lang]}</div><p dir="auto" style={body}>{coach.priority.successCriterion}</p>
    </div>}

    {/* B. Key moments */}
    <div style={card}>
      <h3 style={h}>{T.moments[lang]}</h3>
      {coach.keyMoments.length === 0 && <p dir="auto" style={{ ...body, color: 'var(--ink-dim)' }}>{T.noMoments[lang]}</p>}
      {coach.keyMoments.map(m => <MomentCard key={m.id} m={m} lang={lang} play={audioUrl ? play : null} />)}
      {coach.keyMoments.length > 0 && !audioUrl && <p style={{ fontSize: 14, color: 'var(--ink-dim)' }}>{T.replayGone[lang]}</p>}
    </div>

    {/* E. Replay practice */}
    {coach.priority && !coach.synthetic && <ReplayPractice sessionId={sessionId} priority={coach.priority} moment={priorityMoment}
      onReplay={audioUrl && priorityMoment && priorityMoment.finding.start_time !== null && priorityMoment.finding.end_time !== null
        ? () => play(priorityMoment.finding.start_time!, priorityMoment.finding.end_time!) : null} />}

    {/* C. Communication patterns, collapsed */}
    <Details title={T.patterns[lang]}>
      <p style={{ fontSize: 14, color: 'var(--ink-dim)' }}>{T.measuredNote[lang]}</p>
      {coach.interaction.available && rep && doc && <table style={{ width: '100%', fontSize: 15, borderCollapse: 'collapse', margin: '8px 0' }}>
        <thead><tr><th></th><th style={{ textAlign: 'start' }}>{T.you[lang]}</th><th style={{ textAlign: 'start' }}>{T.doctor[lang]}</th></tr></thead>
        <tbody>
          <tr><td>{lang === 'ar' ? 'حصة وقت الكلام' : 'Share of talk time'}</td><td>{Math.round(rep.share * 100)}%</td><td>{Math.round(doc.share * 100)}%</td></tr>
          <tr><td>{lang === 'ar' ? 'مرات الكلام' : 'Speaking turns'}</td><td>{rep.turns}</td><td>{doc.turns}</td></tr>
          <tr><td>{lang === 'ar' ? 'أطول مرة كلام' : 'Longest turn'}</td><td>{rep.longestTurnSec}s</td><td>{doc.longestTurnSec}s</td></tr>
        </tbody>
      </table>}
      <p style={{ fontSize: 15, margin: '6px 0' }}>{lang === 'ar'
        ? `تبدّل المتحدث: ${coach.interaction.speakerChanges}. التداخل حسب أوقات التفريغ: ${coach.interaction.overlaps ?? T.notMeasured.ar} (التداخل لا يعني دائمًا مقاطعة).`
        : `Speaker changes: ${coach.interaction.speakerChanges}. Overlaps by transcript timing: ${coach.interaction.overlaps ?? T.notMeasured.en} (overlap is not always an interruption).`}</p>
      <p style={{ fontSize: 15, margin: '6px 0' }}>{lang === 'ar'
        ? `أسئلتك: ${coach.interaction.repQuestions.total} (مفتوحة ${coach.interaction.repQuestions.open}، مغلقة ${coach.interaction.repQuestions.closed}، موجِّهة ${coach.interaction.repQuestions.leading}، متابعة ${coach.interaction.repQuestions.followUp}). مصنفة من الصياغة فقط.`
        : `Your questions: ${coach.interaction.repQuestions.total} (open ${coach.interaction.repQuestions.open}, closed ${coach.interaction.repQuestions.closed}, leading ${coach.interaction.repQuestions.leading}, follow-up ${coach.interaction.repQuestions.followUp}). Sorted from wording only.`}</p>

      <div style={label}>{T.opportunities[lang]}</div>
      {coach.opportunities.map(o => <Opportunity key={o.key} o={o} lang={lang} />)}

      <div style={label}>{T.delivery[lang]}</div>
      {coach.delivery.map(d => <div key={d.key} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
          <span>{DELIVERY_TEXT[d.key][lang]}</span><b style={{ fontFamily: 'var(--mono)' }}>{d.available && d.value !== null ? `${d.value} ${d.unit}` : T.notMeasured[lang]}</b>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-dim)', margin: '2px 0 0' }}>{d.method}</p>
      </div>)}

      <div style={label}>{T.structure[lang]}</div>
      {coach.structure.stages.map(st => <p key={st.stage} style={{ fontSize: 15, margin: '4px 0' }}>
        {st.observed ? '✓' : '–'} {STAGE_TEXT[st.stage][lang]}: {st.observed ? (lang === 'ar' ? 'ظهرت' : 'observed') : T.notObserved[lang]}
      </p>)}

      <div style={label}>{T.language[lang]}</div>
      <p style={{ fontSize: 13, color: 'var(--ink-dim)' }}>{T.languageNote[lang]}</p>
      {coach.language.map(p => <div key={`${p.speaker}-${p.category}`} style={{ fontSize: 15, margin: '6px 0' }}>
        <b>{p.speaker === 'rep' ? T.you[lang] : T.doctor[lang]}</b> · {LANG_TEXT[p.category][lang]}: {p.count}
        {p.examples[0] && <p dir="auto" style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--ink-dim)', margin: '2px 0' }}>&ldquo;{p.examples[0].quote}&rdquo;</p>}
      </div>)}

      {coach.evidenceClaims.length > 0 && <>
        <div style={label}>{T.claims[lang]}</div>
        <p style={{ fontSize: 13, color: 'var(--ink-dim)' }}>{T.claimNote[lang]}</p>
        {coach.evidenceClaims.map(c => <Quote key={c.segment.segmentIndex} seg={c.segment} who="you" lang={lang} />)}
      </>}
    </Details>

    {!coach.synthetic && <CoachProgress />}
  </section>
}
