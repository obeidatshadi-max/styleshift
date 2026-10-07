import { applyStateDelta, type PhysicianState, type StateDelta } from '@/lib/voice-partner-core'
import { countHedges } from '@/lib/hedging'

/** What the rep's line LOOKS like to a busy doctor — length and question
 * shape only. Deterministic, no LLM: this drives how the doctor reacts (state
 * shift + prompt cue), it is never shown to the rep and is not a score. */
export interface RepTurnShape {
  words: number
  askedQuestion: boolean
  askedOpenQuestion: boolean
  talkedTooLong: boolean
  /** "Why do you prescribe X?" / "What do you prescribe in this indication?" — probes the doctor's decisions. */
  forbiddenQuestion: boolean
  /** Asks about the doctor's selection criteria or their patients' challenges. */
  criteriaQuestion: boolean
  /** First rep line pitches the product ("Today I want to talk about…") instead of the doctor's patients. */
  productFirstOpening: boolean
  /** First rep line starts from the doctor's patients rather than the product. */
  problemFirstOpening: boolean
  /** Names the doctor's feeling: "It sounds like…", "It seems you…". */
  labeledFeeling: boolean
  /** Short echo of the doctor's last few words. */
  mirrored: boolean
  /** "I understand, but…" — an acknowledgement undone by "but". */
  usedBut: boolean
  /** Count of hedges/fillers/intensifiers in the rep's own words. Measurement only: not a doctor reaction or score. */
  hedgeCount: number
  /** Asks the doctor to make something specific: which patients, what exactly, compared with what, what stops you
   * (Structure of Magic I, pp. 47-51, 66). */
  specifyingQuestion: boolean
}

/** What the caller knows beyond the rep's own line. */
export interface RepTurnContext {
  /** True when the rep has not spoken yet in this session. */
  firstRepTurn?: boolean
  /** The doctor's most recent line, for detecting a mirrored echo. */
  lastDoctorText?: string
}

export const LONG_TURN_WORDS = 70
export const VERY_LONG_TURN_WORDS = 130

const OPEN_EN = /\b(what|how|why|tell me|walk me through|help me understand|could you (explain|share)|can you (explain|share)|when do you|which)\b/i
// Iraqi/Levantine/MSA interrogatives: شنو ليش شلون كيف شكو متى ماذا لماذا وين اي (which)
const OPEN_AR = /(شنو|ليش|شلون|كيف|شكو|متى|ماذا|لماذا|وين|أي |اي |احجيلي|اشرح)/

// Workshop rules (3P selling model): two questions to avoid, two to ask, start from the customer's
// patients not the product, label feelings, and never undo an acknowledgement with "but".
// Heuristics over the rep's wording only — they steer how the doctor FEELS, they are never shown as a score.
const FORBIDDEN_EN = /\bwhy (do|are|did|would) you (prescrib|use|choos|prefer|recommend|start|favou?r)\w*|\bwhat (do|would|did) you (usually |normally )?(prescrib|use|choos)\w* (in|for) (this|these|such|that|those)\b/i
const FORBIDDEN_AR = /(ليش|لماذا|ليه)\s+(تكتب|تصرف|تستخدم|تفضل|تعطي|تصف|تختار)|(شنو|ماذا)\s+(تكتب|تصرف|تستخدم|تصف)\s+(في|بهذي|بهاي|لهذي|لهذه|بهذه|لهاي)/
const CRITERIA_EN = /\b(what|which)\b[^?.!]{0,40}\b(criteria|factors)\b|\bwhat (challenges|problems|difficulties|issues)\b[^?.!]{0,40}\b(patients?|they)\b/i
const CRITERIA_AR = /(شنو|ماذا|شكو)\s+(المعايير|العوامل)|(شنو|ماذا)\s+(التحديات|المشاكل|الصعوبات)/
const PRODUCT_FIRST_EN = /\b(today )?i (want|would like) to (talk|tell|speak|present|introduce|discuss|remind)\b|\bi(?:'m| am) here to (remind|tell|present|introduce|talk)\b|\bremind you (why|of)\b/i
const PRODUCT_FIRST_AR = /(اليوم\s+)?(أريد|اريد|أحب|حاب|جيت)\s+(أن\s+|ان\s+)?(أحجي|أتحدث|اتحدث|أحكي|أذكرك|اذكرك|أعرّف|أعرف)/
const PATIENT_WORDS = /\bpatients?\b|مريض|مرضى|مرضاك|مرضاكم/i
const LABEL_EN = /\b(it (sounds|seems|looks|feels|appears) like|sounds like you|you seem|you sound)\b/i
const LABEL_AR = /(يبدو|يظهر|أحس|أشعر|اشعر)\s+(لي\s+)?(إن|ان|أن|أنك|انك|إنك)|شكلك|واضح\s+(إنك|انك)/
const BUT_EN = /\b(i understand|i agree|i see|that'?s true|that'?s fair|you'?re right|understood)\b[^.?!]{0,30}[,;]?\s+but\b/i
const BUT_AR = /(أفهم|أتفهم|معك حق|صحيح)[^.؟!]{0,30}\s(لكن|بس)\s/

// "Which patients, specifically?", "What exactly happened?", "Compared with what?", "What stops you?" —
// the Meta-Model recovery questions (Structure of Magic I, pp. 47-51, 66). Arabic forms need native review.
const SPECIFYING_EN = /\b(which|what|who|how|where|when)\b[^?.!]{0,50}\b(specifically|exactly|in particular)\b|\bwhich (patients?|ones?|cases?|side effects?|data|study|studies)\b|\bcompared (to|with) what\b|\bthan what\b|\bwhat (stops|is stopping|keeps) you\b|\bwhat (would|might) happen if\b|\bwhat did you (see|notice)\b/i
const SPECIFYING_AR = /(بالضبط|بالتحديد|تحديداً|تحديدا)|(أي|اي|ياهم|منو)\s+(المرضى|مرضى|مريض)|(شنو|ماذا|شو)\s+(اللي\s+)?(يمنعك|يوقفك)|(شنو|ماذا)\s+(يصير|سيحدث|يحدث)\s+(لو|إذا|اذا)|مقارنة\s+(ب|مع)\s*(شنو|ماذا)/

const normalizeWords = (text: string) => text.toLowerCase().replace(/[.,!?؟،;:"'()]/g, ' ').split(/\s+/).filter(Boolean)

/** True when a short rep line repeats the last two words of the doctor's line (the workshop's "repeat the last words"). */
function echoesDoctor(repText: string, doctorText: string | undefined): boolean {
  if (!doctorText) return false
  const rep = normalizeWords(repText)
  const tail = normalizeWords(doctorText).slice(-2)
  if (rep.length === 0 || rep.length > 10 || tail.length === 0) return false
  return rep.join(' ').includes(tail.join(' '))
}

export function analyzeRepTurn(text: string, context: RepTurnContext = {}): RepTurnShape {
  const trimmed = text.trim()
  const words = trimmed ? trimmed.split(/\s+/).length : 0
  const askedQuestion = /[?؟]/.test(trimmed)
  const askedOpenQuestion = askedQuestion && (OPEN_EN.test(trimmed) || OPEN_AR.test(trimmed))
  const productFirst = !!context.firstRepTurn && (PRODUCT_FIRST_EN.test(trimmed) || PRODUCT_FIRST_AR.test(trimmed))
  return {
    words, askedQuestion, askedOpenQuestion, talkedTooLong: words >= LONG_TURN_WORDS,
    forbiddenQuestion: FORBIDDEN_EN.test(trimmed) || FORBIDDEN_AR.test(trimmed),
    criteriaQuestion: askedQuestion && (CRITERIA_EN.test(trimmed) || CRITERIA_AR.test(trimmed)),
    productFirstOpening: productFirst,
    problemFirstOpening: !!context.firstRepTurn && !productFirst && PATIENT_WORDS.test(trimmed),
    labeledFeeling: LABEL_EN.test(trimmed) || LABEL_AR.test(trimmed),
    mirrored: echoesDoctor(trimmed, context.lastDoctorText),
    usedBut: BUT_EN.test(trimmed) || BUT_AR.test(trimmed),
    hedgeCount: countHedges(trimmed).count,
    specifyingQuestion: askedQuestion && (SPECIFYING_EN.test(trimmed) || SPECIFYING_AR.test(trimmed)),
  }
}

/** How this rep line shifts the doctor's feelings. A long monologue drains
 * engagement/trust; a genuine open question restores them; a closed question
 * is mildly neutral-positive. Bounded to the same -10..+10 range the state
 * engine already enforces. */
export function repTurnToDelta(shape: RepTurnShape): StateDelta {
  const adds: StateDelta[] = []
  // A prescribing question or a feeling label is only a wording signal.
  // Contextual fit is handled by the doctor prompt, not an automatic bonus/penalty.
  if (shape.criteriaQuestion) adds.push({ trustDelta: 2, skepticismDelta: -2, engagementDelta: 3 })
  if (shape.specifyingQuestion) adds.push({ trustDelta: 2, skepticismDelta: -1, engagementDelta: 3 })
  if (shape.productFirstOpening) adds.push({ trustDelta: -1, skepticismDelta: 1, engagementDelta: -4 })
  if (shape.problemFirstOpening) adds.push({ trustDelta: 2, skepticismDelta: -1, engagementDelta: 4 })
  if (shape.mirrored) adds.push({ trustDelta: 1, skepticismDelta: 0, engagementDelta: 3 })
  if (shape.usedBut) adds.push({ trustDelta: -2, skepticismDelta: 2, engagementDelta: -1 })
  // applyStateDelta clamps each total to the engine's -10..+10 range.
  return adds.reduce<StateDelta>((sum, d) => ({
    trustDelta: sum.trustDelta + d.trustDelta,
    skepticismDelta: sum.skepticismDelta + d.skepticismDelta,
    engagementDelta: sum.engagementDelta + d.engagementDelta,
  }), lengthAndQuestionDelta(withoutFalseOpenQuestion(shape)))
}

/** These phrases need contextual interpretation before receiving open-question credit. */
export function withoutFalseOpenQuestion(shape: RepTurnShape): RepTurnShape {
  return shape.forbiddenQuestion || shape.labeledFeeling ? { ...shape, askedOpenQuestion: false } : shape
}

function lengthAndQuestionDelta(shape: RepTurnShape): StateDelta {
  if (shape.words >= VERY_LONG_TURN_WORDS) {
    return { trustDelta: -3, skepticismDelta: 3, engagementDelta: shape.askedOpenQuestion ? -6 : -10 }
  }
  if (shape.talkedTooLong) {
    return { trustDelta: -2, skepticismDelta: 2, engagementDelta: shape.askedOpenQuestion ? -2 : -7 }
  }
  if (shape.askedOpenQuestion) return { trustDelta: 4, skepticismDelta: -3, engagementDelta: 8 }
  if (shape.askedQuestion) return { trustDelta: 1, skepticismDelta: 0, engagementDelta: 2 }
  return { trustDelta: 0, skepticismDelta: 0, engagementDelta: 0 }
}

export function nextPhysicianState(state: PhysicianState, shape: RepTurnShape): PhysicianState {
  return applyStateDelta(state, repTurnToDelta(shape))
}
