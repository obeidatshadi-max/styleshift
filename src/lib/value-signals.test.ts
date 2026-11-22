import { describe, expect, it } from 'vitest'
import { buildsCommonGround, generalisesObjection, linksFeatureToBenefit, minimisesObjection } from './value-signals'
import { analyzeRepTurn, repTurnToDelta } from '@/agents/doctor/behavior'
import { buildDoctorReplyPrompt } from '@/agents/doctor/prompt'
import { buildAnalystPrompt } from '@/agents/behaviorAnalyst/prompt'
import { createEmptySession } from '@/schemas/session/factory'
import { defaultScoringConfig } from '@/scoring/config'
import { defaultCapabilityConfig, dimensionOfBehavior } from '@/scoring/capability'

const state = { trust: 50, skepticism: 50, engagement: 50, timePressure: 30 }

describe('point 7: feature linked to a patient benefit', () => {
  it.each([
    'It is taken once daily, which means your patients have one tablet less to remember.',
    'The pen has a fixed dose, so your patients do not have to calculate anything.',
    'مرة وحدة يوميا، يعني لمرضاك حبة أقل يتذكرونها',
  ])('%s', text => {
    expect(linksFeatureToBenefit(text)).toBe(true)
    expect(analyzeRepTurn(text).featureBenefit).toBe(true)
  })
  it('a feature alone or a benefit alone is not enough', () => {
    expect(linksFeatureToBenefit('It is a once daily tablet.')).toBe(false)
    expect(linksFeatureToBenefit('Your patients will feel better.')).toBe(false)
  })
  it('the doctor finds it useful', () => {
    expect(buildDoctorReplyPrompt(createEmptySession('s', 'r'), 'x', analyzeRepTurn('Once daily, which means your patients take fewer tablets.'), state))
      .toContain('linked a product feature to what it means for your patients')
  })
  it('scores, and feeds the new Customer Focus score', () => {
    expect(defaultScoringConfig.competencies.value_communication.behaviors.feature_benefit_linked.points).toBeGreaterThan(0)
    expect(dimensionOfBehavior(defaultCapabilityConfig).get('feature_benefit_linked')).toBe('customer_focus')
  })
})

describe('point 8: true objection model', () => {
  it('detects putting a side effect in proportion', () => {
    expect(minimisesObjection('I understand. It is usually mild and goes away within the first week.')).toBe(true)
    expect(minimisesObjection('Compared with the benefit of fewer attacks, most patients find it tolerable.')).toBe(true)
    expect(minimisesObjection('الغثيان بسيط ومؤقت ويختفي بعد أسبوع')).toBe(true)
    expect(minimisesObjection('Our product is very good.')).toBe(false)
  })
  it('detects a class-effect claim', () => {
    expect(generalisesObjection('All drugs in this class can cause some stomach upset at the start.')).toBe(true)
    expect(generalisesObjection('This is a class effect, not specific to our product.')).toBe(true)
    expect(generalisesObjection('كل الأدوية هذه المجموعة تسبب هذا في البداية')).toBe(true)
    expect(generalisesObjection('Our drug is in a new class.')).toBe(false)
  })
  it('gives no automatic bonus: the doctor judges honesty in context', () => {
    const minimised = repTurnToDelta(analyzeRepTurn('It is nothing, it goes away within days.'))
    const plain = repTurnToDelta(analyzeRepTurn('It is nothing, really.'))
    expect(minimised).toEqual(plain)
    const prompt = buildDoctorReplyPrompt(createEmptySession('s', 'r'), 'x', analyzeRepTurn('All drugs in this class do this.'), state)
    expect(prompt).toContain('ask what the source is')
  })
  it('credits a class-effect claim only with approved product information', () => {
    const s = createEmptySession('s', 'r')
    s.transcript = [
      { turnIndex: 0, role: 'doctor', text: 'Two patients had stomach upset.' },
      { turnIndex: 1, role: 'rep', text: 'All drugs in this class can cause that at the start.' },
    ] as typeof s.transcript
    const prompt = buildAnalystPrompt(s)
    expect(prompt).toContain('said the issue is shared by the drug class')
    expect(prompt).toContain('do not report "objection_generalized" or "unsupported_generalization" at all')
  })
})

describe('point 9: common ground', () => {
  it.each([
    'We both want your patients to reach their target without hypos.',
    'That is my goal too: fewer hospital visits for them.',
    'هدفنا واحد يا دكتور، نريد مرضاك بصحة أحسن',
  ])('%s', text => {
    expect(buildsCommonGround(text)).toBe(true)
    expect(analyzeRepTurn(text).commonGround).toBe(true)
  })
  it('warms the doctor', () => {
    expect(repTurnToDelta(analyzeRepTurn('We both want fewer readmissions.')).trustDelta)
      .toBeGreaterThan(repTurnToDelta(analyzeRepTurn('Readmissions are common.')).trustDelta)
  })
  it('is scored under adaptation and counted in Customer Focus', () => {
    expect(defaultScoringConfig.competencies.adaptation.behaviors.common_ground.points).toBeGreaterThan(0)
    expect(dimensionOfBehavior(defaultCapabilityConfig).get('common_ground')).toBe('customer_focus')
  })
})
