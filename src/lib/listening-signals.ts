// Wording signals in one rep line: question shape, paraphrase, "tell me more",
// naming a patient problem, and reuse of the doctor's own key words.
// Deterministic text checks (no model). One source for every place that needs
// them: the AI doctor's reactions, recorded-roleplay metrics and the analyst's
// measured hints. Arabic patterns cover MSA and common Iraqi forms and still
// need a native review.

const stripMarks = (s: string) => s.normalize('NFKC').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا')
const lower = (s: string) => stripMarks(s).toLowerCase()

// ── Question shape ─────────────────────────────────────────────────────────

const OPEN_AR = /^(?:و?(?:ماذا|كيف|متى|لماذا|اين|كم|شو|ايش|ليش|وين|مين|شلون|ازاي|ايه|شنو)|اخبرني|احكيلي|احكي لي|احجيلي|خبرني|اشرح لي|اشرحلي)(?![\p{L}\p{N}])/u
const CLOSED_AR = /^(?:هل|ممكن|بتقدر|تقدر|يمكنك)(?![\p{L}\p{N}])/u
const OPEN_EN = /^(?:what|how|why|when|where|which|who|tell me|walk me through|describe|explain|please (?:tell|describe|explain|share))\b/i
const CLOSED_EN = /^(?:can|could|would|will|do|does|did|is|are|have|has|should)\s+(?:you|we|i|it|this|that|there|your|the)\b/i
// "Could you tell me…", "Can you describe…", "Would you share…" ask for an open answer even though they start like a yes/no question.
const SOFT_OPEN_EN = /^(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:tell|describe|explain|share|walk me through|talk me through|help me understand|say more|give me an example|expand|elaborate)\b/i
const SOFT_OPEN_AR = /^(?:ممكن|تقدر|بتقدر|يمكنك)\s+(?:ت?حكيلي|ت?حجيلي|تشرح(?:لي)?|توضح(?:لي)?|تخبرني|تقولي|تعطيني مثال)(?![\p{L}\p{N}])/u
const LEAD_IN = /^(?:(?:دكتور|دكتورة|يا دكتور|يا دكتورة|طيب|تمام|زين|لو سمحت|شكرا|doctor|dr|sure|okay|ok|so|and|thanks|thank you|please)\s+)+/iu

function clauses(text: string): string[] {
  return stripMarks(text).trim().split(/[.!؟?،,;؛\n]+/).map(p => p.trim().replace(LEAD_IN, '')).filter(Boolean)
}

/** 'open' | 'closed' for a question-bearing line, null for a statement. Speech transcripts often drop "?",
 * so a line that starts like a question counts even without one. */
export function questionKind(text: string): 'open' | 'closed' | null {
  const hasMark = /[?؟]/.test(text)
  const parts = clauses(text)
  if (isClarifyRequest(text)) return 'open'
  if (parts.some(p => SOFT_OPEN_EN.test(p) || SOFT_OPEN_AR.test(p))) return 'open'
  if (parts.some(p => OPEN_AR.test(p) || OPEN_EN.test(p) || (/^من(?![\p{L}\p{N}])/u.test(p) && hasMark))) return 'open'
  if (parts.some(p => CLOSED_AR.test(p) || CLOSED_EN.test(p)) || hasMark) return 'closed'
  return null
}

// ── "Tell me more" and other requests to say more ──────────────────────────

const CLARIFY_EN = /\b(?:tell me (?:a (?:bit|little) )?more|say (?:a (?:bit|little) )?more|(?:can|could|would) you (?:please )?(?:explain|elaborate|expand)(?: (?:on|more))?|what do you mean|what did you mean|can you give (?:me )?an example|give me an example|go on)\b/i
const CLARIFY_AR = /(?:احكيلي|احكي لي|احجيلي|خبرني|اشرحلي|اشرح لي|وضحلي|وضح لي)\s+(?:اكثر|زياده|زيادة)|(?:شنو|شو|ماذا)\s+(?:تقصد|قصدك)|(?:ممكن|تقدر)\s+(?:توضح|تشرح)\s*(?:لي)?\s*(?:اكثر|زياده|زيادة)|(?:اعطيني|عطيني)\s+مثال|كمل|كمّل/u

/** "Tell me more", "What do you mean?", "Can you explain more?" — asks the doctor to keep talking. */
export function isClarifyRequest(text: string): boolean {
  const t = lower(text)
  return CLARIFY_EN.test(t) || CLARIFY_AR.test(t)
}

// ── Paraphrase lead-ins ────────────────────────────────────────────────────

const PARAPHRASE_EN = /\b(?:what i (?:understand|understood|am hearing|'m hearing|hear)|if i (?:understand|understood|heard) (?:you |that |this )?(?:correctly|right|well)|so you(?:'re| are) saying|so what you(?:'re| are) saying|you(?:'re| are) saying that|in other words|so you mean|you mean that|let me (?:make sure|check|see if) (?:that )?i understand|if i (?:may|can) summari[sz]e|to summari[sz]e what you said|so for you,? the (?:main|biggest|real))\b/i
const PARAPHRASE_AR = /(?:اللي|الذي|ما)\s+فهمته|فهمت\s+منك|فهمت\s+من\s+كلامك|اذا\s+فهمتك\s+(?:صح|صحيح)|لو\s+فهمتك\s+(?:صح|صحيح)|يعني\s+(?:حضرتك|انت|انتي)?\s*تقصد|قصدك\s+(?:ان|انه)|تقصد\s+(?:ان|انه)|بمعنى\s+(?:اخر|ثاني)|بعبارة\s+اخرى|خليني\s+اتاكد|خلني\s+اتاكد/u

/** The rep restates the doctor's point in their own words ("What I understand from you is…"). */
export function isParaphrase(text: string): boolean {
  const t = lower(text)
  return PARAPHRASE_EN.test(t) || PARAPHRASE_AR.test(t)
}

// ── Naming a real patient problem ──────────────────────────────────────────

const PATIENT_EN = /\bpatients?\b/i
const PATIENT_AR = /مريض|مرضى|مرضاك|مرضاكم|المرضى/u
const PROBLEM_EN = /\b(?:struggl\w*|problems?|difficult\w*|hard time|side effects?|adherence|complian\w*|stop(?:s|ped)? (?:taking|their|the)|drop(?:s|ped)? out|not (?:well )?controlled|uncontrolled|poorly controlled|complain\w*|relaps\w*|hypos?|hypoglyc\w*|burden|forget\w*|miss(?:es|ed)? (?:doses|their)|get(?:s|ting)? worse|worsen\w*|pain|readmi\w*|not reach\w*|fail\w*)\b/i
const PROBLEM_AR = /مشكل|مشاكل|صعوب|يعان|اعراض جانبي|عرض جانبي|يوقفون|يتركون|يقطعون|ينسون|غير مسيطر|ما مسيطر|مو مسيطر|انتكاس|يشتك|يتعب|(?:^|\s)(?:الم|وجع|الام)(?=\s|$)|نوبات|يرجعون للمستشفى/u

/** A statement that names a concrete problem the doctor's patients have (not a question asking about it). */
export function namesPatientProblem(text: string): boolean {
  const t = lower(text)
  return (PATIENT_EN.test(t) && PROBLEM_EN.test(t)) || (PATIENT_AR.test(t) && PROBLEM_AR.test(t))
}

// ── Reusing the doctor's own key words ─────────────────────────────────────

const STOP = new Set([
  'about', 'after', 'again', 'because', 'before', 'being', 'could', 'doctor', 'every', 'going', 'have', 'here', 'just', 'like',
  'little', 'maybe', 'more', 'much', 'only', 'other', 'really', 'should', 'something', 'still', 'than', 'that', 'their', 'them',
  'then', 'there', 'these', 'they', 'thing', 'think', 'this', 'those', 'through', 'very', 'what', 'when', 'where', 'which',
  'while', 'will', 'with', 'would', 'your', 'yours', 'patient', 'patients', 'know', 'want', 'need', 'from', 'were', 'been',
  'دكتور', 'المرضى', 'مرضى', 'المريض', 'مريض', 'هذا', 'هذه', 'هاي', 'هذي', 'اللي', 'الذي', 'التي', 'يعني', 'كلش', 'شوية',
  'بعدين', 'لكن', 'عندي', 'عندك', 'عندهم', 'حتى', 'كذلك', 'ايضا', 'هواي', 'اكثر',
])
function keyWords(text: string): Set<string> {
  const words = lower(text).replace(/[.,!?؟،;:"'()«»]/g, ' ').split(/\s+/).filter(Boolean)
  return new Set(words.filter(w => !STOP.has(w) && (/[a-z]/.test(w) ? w.length >= 5 : w.length >= 4)))
}

/** The doctor's key words (5+ letters, or 4+ in Arabic, not filler) that the rep reused in their reply. */
export function reusedKeyWords(repText: string, doctorText: string | undefined): string[] {
  if (!doctorText) return []
  const doctor = keyWords(doctorText)
  return [...keyWords(repText)].filter(w => doctor.has(w))
}
