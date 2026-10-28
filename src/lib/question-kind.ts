import type { ObjectionType } from '@/lib/voice-partner-core'

// "Three kinds of questions" (Paul & Elder, Miniature Guide to Critical
// Thinking, p.16 — paraphrased, not quoted). Before answering, work out which
// kind of question you were asked, because each wants a different answer:
//   knowledge  — one correct answer, settled by evidence      -> give the fact, or say you will confirm
//   preference — a personal taste, no right or wrong          -> ask what matters to them, do not argue
//   judgment   — competing views, better and worse answers    -> lay out criteria and their view first
//
// This is the DOCTOR-side classifier. voice-partner-questioning.ts already
// classifies the REP's questions; the two do not share types.
//
// The heuristic is deliberately conservative: it returns null instead of
// guessing, because a wrong "you answered the wrong kind" coaching line is
// worse than no line.

export type QuestionKind = 'knowledge' | 'preference' | 'judgment'
export const QUESTION_KINDS: readonly QuestionKind[] = ['knowledge', 'preference', 'judgment']

export function isQuestionKind(value: unknown): value is QuestionKind {
  return typeof value === 'string' && (QUESTION_KINDS as readonly string[]).includes(value)
}

// Checked in this order: a question that mentions a comparison is a judgment
// even if it also names a fact ("is it better than X at 10 mg?").
const CUES: ReadonlyArray<{ kind: QuestionKind; patterns: RegExp[] }> = [
  {
    kind: 'judgment',
    patterns: [
      /\b(better|best|worse|versus|vs\.?|compared? (to|with)|worth|should i|why (would|should) i|switch(ing)? (to|from)|trade-?off|pros and cons|which (one )?is (more|less))\b/i,
      /(أفضل|أحسن|مقارنة|بالمقارنة|هل يستحق|هل يجب|لماذا أغير|لماذا أبدل|الفرق بين)/,
    ],
  },
  {
    kind: 'preference',
    patterns: [
      /\b(do you (prefer|like)|your (favou?rite|preference)|which (do|would) you (prefer|like)|are you a fan)\b/i,
      /(هل تفضل|ما هو المفضل|المفضل لديك|هل تحب|هل يعجبك)/,
    ],
  },
  {
    kind: 'knowledge',
    patterns: [
      /\b(what('s| is) the (dose|dosage|price|half-?life|indication|contraindication)|how (many|much|long)|is it (approved|registered|available|safe|indicated)|side effects?|adverse|study|trial|data|evidence|mechanism|label)\b/i,
      /(كم (هي|هو)?|ما هي الجرعة|الجرعة|الأعراض الجانبية|دراسة|دراسات|هل هو معتمد|هل هو مسجل|هل هو متوفر|دليل|بيانات|آلية)/,
    ],
  },
]

/** Classify a doctor's question or objection text. null = not confident. */
export function classifyDoctorQuestion(text: string): QuestionKind | null {
  const t = (text ?? '').trim()
  if (!t) return null
  for (const { kind, patterns } of CUES) {
    if (patterns.some(p => p.test(t))) return kind
  }
  return null
}

/**
 * What kind of question each AI-Doctor objection type behaves like. This is a
 * coaching default, not a fact about any one doctor.
 *   wrong_info     — the doctor holds a mistaken fact          -> knowledge
 *   doubt          — unsure about the evidence                  -> knowledge
 *   true_objection — a real trade-off against the product       -> judgment
 *   indifference   — no strong view, "I just use what I use"    -> preference
 *   false_objection— an excuse covering something else          -> preference
 */
export const QUESTION_KIND_BY_OBJECTION: Record<ObjectionType, QuestionKind> = {
  wrong_info: 'knowledge',
  doubt: 'knowledge',
  true_objection: 'judgment',
  indifference: 'preference',
  false_objection: 'preference',
}

/** Doctor's question kind, preferring what their words show over the objection default. */
export function resolveQuestionKind(text: string, objectionType?: ObjectionType | null): QuestionKind | null {
  return classifyDoctorQuestion(text) ?? (objectionType ? QUESTION_KIND_BY_OBJECTION[objectionType] : null)
}
