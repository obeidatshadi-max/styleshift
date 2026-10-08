/** Vague-language patterns and the questions that make them specific, adapted for doctor visits
 * from Bandler & Grinder 1975, The Structure of Magic I (Meta-Model, pp. 40-66). Read pages 1-66
 * only; the book's later Generalization section (pp. 80-107) is not used here.
 *
 * The book is about therapy. Applying it to a rep and a doctor is StyleShift's adaptation, kept in
 * the book's own spirit: questions that help the doctor be precise and respect their view
 * (p. 42), never verbal tricks. See docs/structure-of-magic-insights-2026-10-07.md. */

export const VAGUE_PATTERNS = [
  'deletion', 'unspecified_referent', 'unspecified_verb', 'nominalization',
  'impossibility', 'cause_effect', 'presupposition', 'missing_comparison',
] as const
export type VaguePattern = typeof VAGUE_PATTERNS[number]

export function isVaguePattern(value: unknown): value is VaguePattern {
  return typeof value === 'string' && (VAGUE_PATTERNS as readonly string[]).includes(value)
}

/** English prompt guidance for each pattern. Prompts only: rep-facing labels live in i18n
 * (`precision.pattern.*`). `doctorExample` is a StyleShift adaptation, not a book quote. */
export const PATTERN_GUIDE: Record<VaguePattern, { book: string; page: string; doctorExample: string; question: string }> = {
  deletion: {
    book: 'Something the sentence needs is left out ("I\'m upset" — about what?).',
    page: 'pp. 59-65', doctorExample: 'I have concerns.', question: 'Concerns about what, specifically?',
  },
  unspecified_referent: {
    book: 'A noun that points at no one in particular ("people", "everyone").',
    page: 'pp. 47-48', doctorExample: 'Patients don\'t tolerate it.', question: 'Which patients, specifically?',
  },
  unspecified_verb: {
    book: 'An action with no detail of how it happened ("he scares me" — how?).',
    page: 'pp. 48-49', doctorExample: 'It didn\'t work.', question: 'What did you see happen?',
  },
  nominalization: {
    book: 'An ongoing process frozen into a finished thing ("my decision").',
    page: 'pp. 43-44', doctorExample: 'My decision is made.', question: 'What would you need to see to revisit it?',
  },
  impossibility: {
    book: 'A limit stated as fixed ("I can\'t trust people").',
    page: 'pp. 50-51', doctorExample: 'I can\'t switch stable patients.', question: 'What stops you?',
  },
  cause_effect: {
    book: 'One thing said to cause a reaction automatically ("he makes me mad").',
    page: 'pp. 51-52', doctorExample: 'Side effects make them quit.', question: 'All of them? What is different about the ones who continue?',
  },
  presupposition: {
    book: 'A hidden assumption the sentence needs in order to make sense.',
    page: 'pp. 52-53', doctorExample: 'When the price comes down I\'ll look at it.', question: 'Is cost the main factor for you?',
  },
  missing_comparison: {
    book: 'A comparison with one side missing ("better" — than what?).',
    page: 'p. 66', doctorExample: 'The other drug is better.', question: 'Better in what way, and for which patients?',
  },
}

/** One-line prompt list of the patterns, for any model that must classify or produce them. */
export function patternPromptList(): string {
  return VAGUE_PATTERNS.map(p => `- "${p}": ${PATTERN_GUIDE[p].book} Doctor example: "${PATTERN_GUIDE[p].doctorExample}" → "${PATTERN_GUIDE[p].question}"`).join('\n')
}

/** Technique notes the coach may draw on for a coaching point about one of these behaviors.
 * The idea comes from the book; applying it to a doctor visit is StyleShift's adaptation. */
export const TECHNIQUE_NOTES: Partial<Record<string, string>> = {
  premature_pitch: 'Advice that lands in a gap of someone\'s picture tends to be resisted or not heard; hold the pitch until the doctor\'s picture of the problem is complete (Structure of Magic, p. 50).',
  product_first_opening: 'Advice that lands in a gap of someone\'s picture tends to be resisted or not heard; start from the doctor\'s patients so the product has somewhere to land (Structure of Magic, p. 50).',
  forbidden_question: 'Ask for "how" answers (what they look for, what they see in patients) rather than "why" justifications, which make people defend what they already do (Structure of Magic, p. 56).',
  argued_with_doctor: 'People make the best choices their current picture allows; an objection makes sense from inside the doctor\'s view, so explore it before answering it (Structure of Magic, p. 14).',
  accepted_vague_objection: 'A vague objection hides the real one. Ask for the missing piece — which patients, what exactly happened, compared with what — before answering (Structure of Magic, pp. 41, 47-49).',
  generic_claim: 'Separate what the doctor actually said from what you assumed they meant; tie the claim to their own words (Structure of Magic, pp. 58-59).',
  unsupported_claim: '"Better" needs a "than what": name the comparison and the evidence, or don\'t make the comparison (Structure of Magic, p. 66).',
  specifying_question: 'Keep asking "which, specifically?" until the doctor names a real patient type or event — that is where the need is (Structure of Magic, pp. 47-49).',
  what_stops_question: '"What stops you?" turns a fixed "can\'t" back into something the doctor can look at (Structure of Magic, pp. 50-51).',
  checked_interpretation: 'A guess is fine when the other person can check it: offer it tentatively and let the doctor confirm or correct it (Structure of Magic, p. 42).',
  clarification: 'Ask for the missing piece directly rather than guessing it (Structure of Magic, pp. 41-42).',
}
