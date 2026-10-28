import { describe, it, expect } from 'vitest'
import { OBJECTION_TYPES } from './voice-partner-core'
import {
  QUESTION_KINDS, isQuestionKind, classifyDoctorQuestion,
  QUESTION_KIND_BY_OBJECTION, resolveQuestionKind,
} from './question-kind'

describe('isQuestionKind', () => {
  it('accepts each kind and rejects others', () => {
    for (const k of QUESTION_KINDS) expect(isQuestionKind(k)).toBe(true)
    expect(isQuestionKind('other')).toBe(false)
    expect(isQuestionKind(null)).toBe(false)
  })
})

describe('classifyDoctorQuestion', () => {
  it('detects knowledge questions in English and Arabic', () => {
    expect(classifyDoctorQuestion('What is the dose for elderly patients?')).toBe('knowledge')
    expect(classifyDoctorQuestion('Is it approved for children?')).toBe('knowledge')
    expect(classifyDoctorQuestion('ما هي الجرعة للمرضى كبار السن؟')).toBe('knowledge')
  })

  it('detects preference questions', () => {
    expect(classifyDoctorQuestion('Do you prefer the tablet or the syrup?')).toBe('preference')
    expect(classifyDoctorQuestion('هل تفضل الحبوب أم الشراب؟')).toBe('preference')
  })

  it('detects judgment questions', () => {
    expect(classifyDoctorQuestion('Why should I switch from what I use now?')).toBe('judgment')
    expect(classifyDoctorQuestion('Is yours better than the leading brand?')).toBe('judgment')
    expect(classifyDoctorQuestion('لماذا أغير الدواء الذي أصفه؟')).toBe('judgment')
  })

  it('treats a comparison that names a fact as judgment, not knowledge', () => {
    expect(classifyDoctorQuestion('Is it better than X at 10 mg dose data?')).toBe('judgment')
  })

  it('returns null rather than guessing', () => {
    expect(classifyDoctorQuestion('')).toBeNull()
    expect(classifyDoctorQuestion('   ')).toBeNull()
    expect(classifyDoctorQuestion('Hmm, I am busy today.')).toBeNull()
    expect(classifyDoctorQuestion(undefined as unknown as string)).toBeNull()
  })
})

describe('QUESTION_KIND_BY_OBJECTION', () => {
  it('covers every objection type with a valid kind', () => {
    for (const o of OBJECTION_TYPES) expect(isQuestionKind(QUESTION_KIND_BY_OBJECTION[o])).toBe(true)
  })
})

describe('resolveQuestionKind', () => {
  it('prefers the words over the objection default', () => {
    expect(resolveQuestionKind('Do you prefer the tablet?', 'wrong_info')).toBe('preference')
  })

  it('falls back to the objection default when the words are unclear', () => {
    expect(resolveQuestionKind('Hmm.', 'true_objection')).toBe('judgment')
  })

  it('is null with no text signal and no objection', () => {
    expect(resolveQuestionKind('Hmm.')).toBeNull()
    expect(resolveQuestionKind('Hmm.', null)).toBeNull()
  })
})
