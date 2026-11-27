/**
 * Every instruction that tells an AI prompt which language (and dialect) to write in.
 * One place, so a language change is one edit (architecture review 2026-11-27, F8).
 *
 * Two different Arabic registers are used on purpose:
 *  - SPOKEN lines (the AI doctor, and example wording a rep would say) use Iraqi dialect,
 *    because reps hear and say Iraqi Arabic in the field.
 *  - WRITTEN feedback uses clear Modern Standard Arabic by default. A rep can switch it to
 *    Iraqi with the feedback toggle; that rule (feedback-dialect.ts) is appended LAST to a
 *    prompt so it overrides the standard-Arabic line. feedbackLanguageRule() returns it.
 */
import { PLAIN_SPEECH_RULE } from '@/lib/plain-english'
import { feedbackDialectRule, type FeedbackDialect } from '@/lib/feedback-dialect'

export type Lang = 'en' | 'ar'

export function langName(lang: Lang): string {
  return lang === 'ar' ? 'Arabic' : 'English'
}

// Matches pipecat-agent/scenario.py's realtime dialect steering — the
// turn-based persona previously just said "Write ALL text in Arabic" (bare
// langName), which OpenAI TTS then rendered as generic MSA. Real Iraqi
// vocabulary examples, same as scenario.py, keep both surfaces consistent.
export const IRAQI_DIALECT_LINE = 'Write ALL text in natural spoken Iraqi Arabic (central/Baghdadi) — not Modern Standard Arabic, and not Gulf, Levantine, Egyptian or Maghrebi dialect. Prefer Iraqi forms: شنو (what), شلون (how), ليش (why), وين (where), هسه (now), أكو / ماكو (there is / there is not), كلش or هواية (very / a lot), أريد (I want), تعتقد or تحسب (you think). Never use Gulf أبي / أبغى / نبغي / وايد, Levantine بدي / بدّك / هلق / كتير / شو or the Levantine بـ verb prefix (say يسبب، يروحون، ياخذ — not بيسبب، بيروحون، بياخذ), Egyptian عايز / دلوقتي / أيوه / حاجة / إزاي / تفتكر, or Maghrebi ديال. Match this register: "شنو الفرق بينه وبين الدواء اللي أستخدمه هسه؟ كلش مشغول، اختصر." / "أكو عندي مرضى هواية ما يستجيبون زين، أريد شي أحسن مو أي شي." / "ماكو وقت اليوم، ارجع لي الخميس بعد العيادة."'

export const REPORT_LANGUAGE_RULE: Record<Lang, string> = {
  en: 'Write every free-text field in English. The reader is a sales rep who is NOT a native English speaker, so use plain, simple English: ' +
    'short sentences (about 15 words or fewer), one idea per sentence, common everyday words, and active voice ("you asked", not "a question was asked"). ' +
    'No idioms, metaphors, slang or phrasal verbs (write "find out", not "uncover"; "ask", not "probe"; "show", not "demonstrate"; "use", not "leverage"; "next step", not "way forward"). ' +
    'Avoid psychology or sales jargon such as "rapport", "objection handling", "value proposition" or "pain point"; say what happened in simple words instead. ' +
    'Talk to the rep as "you". Keep product names, medical terms, numbers and units exactly as given.',
  ar: 'Write every free-text field in Arabic (clear Modern Standard Arabic, natural for a pharmaceutical sales rep in Iraq). ' +
    'Keep drug and product names, numbers and units as given. JSON keys and enumerated values (such as "partial" or "inferred") stay in English exactly as listed below. ' +
    'Every field typed "string" is free text and MUST be Arabic, including "behavior", "whatHappened", "whyItMattered", "improvement", "interpretation", ' +
    '"practiceExercise", "successLooksLike", "mostUsefulAdjustment", "summary", "possibleMeanings", "missingContext", "clarifyingQuestion" and "precisionQuestion"; never answer a free-text field in English. ' +
    'Example wording for a rep to say ("betterPhrase", "betterResponseExample", "suggestedWordingNextVisit", "clarifyingQuestion", "precisionQuestion") may use natural Iraqi dialect.',
}

/** Who the prompt is for. Each role keeps the exact wording it had before this module existed. */
export type PromptRole =
  | 'doctor'       // AI doctor persona, spoken to the rep (voice partner and simulation)
  | 'coachAgent'   // simulation coach: written coaching, spoken example in Iraqi
  | 'report'       // role-play report and conversation coach (JSON free-text fields)
  | 'evaluator'    // session evaluator (every text field)
  | 'debrief'      // coach debrief after a real call
  | 'practice'     // conversation-coach practice feedback (whatWorked, oneChange)

export function promptLanguage(lang: Lang, role: PromptRole): string {
  const ar = lang === 'ar'
  switch (role) {
    case 'doctor': return ar ? IRAQI_DIALECT_LINE : `Write ALL text in English. ${PLAIN_SPEECH_RULE}`
    case 'coachAgent': return ar
      ? `Write all coaching text in Arabic. For the "betterResponseExample", ${IRAQI_DIALECT_LINE}`
      : 'Write all text in English.'
    case 'report': return REPORT_LANGUAGE_RULE[lang]
    case 'evaluator': return `Write every text field in ${langName(lang)}.`
    case 'debrief': return `Respond in ${langName(lang)}.`
    case 'practice': return ar ? 'Write whatWorked and oneChange in clear Arabic.' : 'Write whatWorked and oneChange in plain, simple English.'
  }
}

/** Append LAST to a written-feedback prompt: '' unless the rep chose Iraqi feedback in Arabic. */
export function feedbackLanguageRule(lang: Lang, dialect: FeedbackDialect): string {
  return feedbackDialectRule(lang, dialect)
}
