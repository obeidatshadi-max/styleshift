import type { MastermindInsight } from '@/lib/mastermind-coach'
import type { GravityMetricKey } from '@/lib/behavioral-gravity'
import type { ClearStep, ObjectionType } from '@/lib/voice-partner-core'

// Arabic wording for the deterministic Mastermind Coach insights. The English text is built
// server-side in mastermind-coach.ts; the structured evidence travels with every insight, so
// the Arabic text is rebuilt here from that evidence on the client. Numbers are never
// re-derived, only copied from the evidence. Same sentence logic as the English templates.
// Arabic is MSA like the rest of the app and has NOT been reviewed by a native speaker.

const OBJECTION_AR: Record<ObjectionType, string> = {
  wrong_info: 'معلومة خاطئة', doubt: 'الشك', true_objection: 'اعتراض حقيقي',
  indifference: 'اللامبالاة', false_objection: 'اعتراض غير حقيقي',
}
const STEP_AR: Record<ClearStep, string> = {
  clarify: 'التوضيح', listen: 'الإصغاء', empathy: 'التعاطف', answer: 'الإجابة', recheck: 'إعادة التحقق',
}
const METRIC_AR: Record<GravityMetricKey, string> = {
  avgRepTurnLength: 'طول ردودك', openQuestionRatio: 'نسبة الأسئلة المفتوحة', clearStepsPerTurn: 'خطوات CLEAR لكل رد',
}

// Isolated left-to-right so a percent sign stays after its number inside Arabic text.
const num = (n: number) => `⁦${n}⁩`
const pct = (n: number) => `⁦${n}%⁩`

function gravityAlternative(metric: GravityMetricKey, above: boolean, obj: string, step: string): string {
  switch (metric) {
    case 'avgRepTurnLength':
      return above
        ? `تميل إلى الإسهاب عندما يظهر «${obj}». خفّف السرعة واعتمد على «${step}» — دع الطبيب يكمل كلامه، ثم أعد صياغة ما سمعته قبل أن تردّ.`
        : `تميل إلى الصمت بدل الانخراط عندما يظهر «${obj}». اعتمد على «${step}» — اطرح سؤالاً مفتوحاً لتفهم ما وراء الاعتراض بدل التراجع.`
    case 'openQuestionRatio':
      return above
        ? `تعتمد كثيراً على الأسئلة المفتوحة دون إغلاق الحلقة. تابع بـ «${step}» — بعد أن تكشف الاهتمام الحقيقي، قدّم إجابة مباشرة مدعومة بالأدلة بدل الاستمرار في الاستقصاء.`
        : `تميل إلى الردود المغلقة والمباشرة بدل الأسئلة المفتوحة هنا. اعتمد على «${step}» — اسأل عمّا وراء الاعتراض قبل أن تحاول حلّه.`
    case 'clearStepsPerTurn':
      return above
        ? `تمرّ على خطوات CLEAR أكثر من المعتاد هنا، لكن ذلك لا يؤتي أثره. تمهّل عند «${step}» تحديداً — تأكد أنك تستوعب الاعتراض فعلاً، لا أنك تنتقل بين بنود قائمة.`
        : `تتخطى بعض خطوات CLEAR أكثر من المعتاد هنا. احرص على الختام بـ «${step}» — أكّد بصوت مسموع أنك عالجت الاهتمام فعلاً قبل الانتقال.`
  }
}

/** Arabic version of one insight. Falls back to the English insight when the evidence is incomplete. */
export function localizeInsightAr(insight: MastermindInsight): MastermindInsight {
  const e = insight.evidence
  const step = STEP_AR[insight.experiment.focusStep]

  if (insight.source === 'gravity') {
    if (!e.metric || e.deviationPct === undefined || e.winRate === undefined
      || e.baselineWinRate === undefined || e.winRateGapPts === undefined) return insight
    const obj = OBJECTION_AR[e.trigger]
    return {
      ...insight,
      observation: `عند ظهور «${obj}»، يتغيّر ${METRIC_AR[e.metric]} بشكل ملحوظ عمّا اعتدت عليه في تدريبك.`,
      pattern: `ظهر هذا في ${num(e.sessionCount)} من جلسات تدريبك مع هذا النوع من الاعتراض — ردّة فعل متكررة وليست حالة عابرة.`,
      impact: `نسبة فوزك في جلسات «${obj}» هي ${pct(e.winRate)}، أي أقل بـ ${num(e.winRateGapPts)} نقطة من متوسطك العام ${pct(e.baselineWinRate)}.`,
      alternative: gravityAlternative(e.metric, e.deviationPct >= 0, obj, step),
      experiment: { ...insight.experiment, label: `تدرّب على اعتراضات «${obj}» مع التركيز على خطوة «${step}»` },
    }
  }

  if (!e.provenContext || !e.underusedContext || e.provenRate === undefined || e.underusedRate === undefined
    || e.provenSessionCount === undefined || e.underusedSessionCount === undefined) return insight
  const proven = OBJECTION_AR[e.provenContext]
  const under = OBJECTION_AR[e.underusedContext]
  return {
    ...insight,
    observation: `تستخدم «${step}» بثبات عندما يظهر «${proven}»، لكنك نادراً ما تلجأ إليها عندما يظهر «${under}».`,
    pattern: `ظهرت في ${num(e.provenSessionCount)} جلسة «${proven}» (${pct(e.provenRate)})، وغابت تقريباً في ${num(e.underusedSessionCount)} جلسة «${under}» (${pct(e.underusedRate)}).`,
    impact: 'لم تُقارَن بالنتيجة — هذه قدرة مثبتة غير مستخدمة وليست فجوة مهارة، لذا تطبيقها دفعة خفيفة منخفضة المخاطر وليست تدريباً جديداً.',
    alternative: `استخدم «${step}» بوضوح في المرات القليلة القادمة التي يظهر فيها «${under}» — أنت تجيدها أصلاً في مواضع أخرى.`,
    experiment: { ...insight.experiment, label: `تدرّب على اعتراضات «${under}» مع استخدام خطوة «${step}» عمداً` },
  }
}

export function localizeInsight(insight: MastermindInsight, lang: 'en' | 'ar'): MastermindInsight {
  return lang === 'ar' ? localizeInsightAr(insight) : insight
}
