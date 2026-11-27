import { describe, expect, it } from 'vitest'
import { IRAQI_DIALECT_LINE, REPORT_LANGUAGE_RULE, feedbackLanguageRule, langName, promptLanguage } from './prompt-language'
import { PLAIN_SPEECH_RULE } from './plain-english'
import { IRAQI_FEEDBACK_RULE } from './feedback-dialect'
import { LANGUAGE_RULE } from './report/buildReportPrompt'
import { IRAQI_DIALECT_LINE as VP_IRAQI, langName as vpLangName } from './voice-partner-core'

// Each role must keep the exact wording its prompt builder wrote before prompt-language existed (F8 refactor).
describe('promptLanguage', () => {
  it('doctor: spoken Iraqi in Arabic, plain English otherwise', () => {
    expect(promptLanguage('ar', 'doctor')).toBe(IRAQI_DIALECT_LINE)
    expect(promptLanguage('en', 'doctor')).toBe(`Write ALL text in English. ${PLAIN_SPEECH_RULE}`)
  })

  it('coachAgent: written Arabic with an Iraqi spoken example', () => {
    expect(promptLanguage('ar', 'coachAgent')).toBe(`Write all coaching text in Arabic. For the "betterResponseExample", ${IRAQI_DIALECT_LINE}`)
    expect(promptLanguage('en', 'coachAgent')).toBe('Write all text in English.')
  })

  it('report, evaluator, debrief, practice', () => {
    expect(promptLanguage('ar', 'report')).toBe(REPORT_LANGUAGE_RULE.ar)
    expect(promptLanguage('en', 'report')).toBe(REPORT_LANGUAGE_RULE.en)
    expect(REPORT_LANGUAGE_RULE.ar).toMatch(/^Write every free-text field in Arabic \(clear Modern Standard Arabic/)
    expect(promptLanguage('ar', 'evaluator')).toBe('Write every text field in Arabic.')
    expect(promptLanguage('en', 'evaluator')).toBe('Write every text field in English.')
    expect(promptLanguage('ar', 'debrief')).toBe('Respond in Arabic.')
    expect(promptLanguage('en', 'debrief')).toBe('Respond in English.')
    expect(promptLanguage('ar', 'practice')).toBe('Write whatWorked and oneChange in clear Arabic.')
    expect(promptLanguage('en', 'practice')).toBe('Write whatWorked and oneChange in plain, simple English.')
  })

  it('old import paths still give the same text', () => {
    expect(LANGUAGE_RULE).toBe(REPORT_LANGUAGE_RULE)
    expect(VP_IRAQI).toBe(IRAQI_DIALECT_LINE)
    expect(vpLangName('ar')).toBe(langName('ar'))
  })

  it('feedbackLanguageRule adds the Iraqi override only for Arabic with Iraqi chosen', () => {
    expect(feedbackLanguageRule('ar', 'iraqi')).toContain(IRAQI_FEEDBACK_RULE)
    expect(feedbackLanguageRule('ar', 'msa')).toBe('')
    expect(feedbackLanguageRule('en', 'iraqi')).toBe('')
  })
})
