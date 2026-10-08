import { createDrillRegistry } from '@/lib/drill-registry'

/**
 * The shipped micro-practice library: 15 drills as pure data, one per drill
 * type. A new drill is a new entry here - no runner, route or UI change.
 *
 * ENGLISH ONLY (languages: ['en']). Doctor lines are deliberately generic: no
 * product names, figures, studies or clinical claims, so nothing here can
 * teach or reward an invented fact. Iraqi Arabic versions must be written or
 * reviewed by a native speaker before 'ar' is added to a drill's languages.
 */
const common = { version: 1, languages: ['en'], retry: { maxAttempts: 5, hintAfterAttempts: 2 }, arabicReviewed: false }
const c = (behavior: string, weight: number, required: boolean, metFeedback: string, missedFeedback: string) =>
  ({ behavior, weight, required, metFeedback: { en: metFeedback }, missedFeedback: { en: missedFeedback } })

export const DRILL_TEMPLATES: unknown[] = [
  {
    ...common, id: 'precision-questioning-1', type: 'precision_questioning', difficulty: 'standard', durationMin: 3,
    physicianStyle: 'analytical', expectedResponse: 'question', passMark: 0.6,
    objective: { en: 'Turn a vague statement into a precise question.' },
    prompt: { en: 'The doctor says: "Results with the current treatment are mixed."' },
    hint: { en: 'Ask about one specific thing: which patients, which result, compared with what.' },
    criteria: [
      c('clarification', 2, true, 'You asked the doctor to be more specific.', 'Ask what "mixed" means for their patients before saying anything about your product.'),
      c('open_question', 1, false, 'Your question invited the doctor to explain.', 'Use a question that cannot be answered yes or no.'),
      c('leading_question', 1, false, 'You did not steer the doctor toward your answer.', 'Your question pushed toward a preferred answer; ask without a built-in conclusion.'),
    ],
  },
  {
    ...common, id: 'clarification-1', type: 'clarification', difficulty: 'easy', durationMin: 2,
    physicianStyle: null, expectedResponse: 'short_text', passMark: 0.6,
    objective: { en: 'Check what you heard before you respond.' },
    prompt: { en: 'The doctor says: "Patients just do not stay on these treatments."' },
    hint: { en: 'Say back what you understood, then ask what is behind it.' },
    criteria: [
      c('paraphrasing', 1, false, 'You restated the concern in your own words.', 'Restate the concern first so the doctor knows you heard it.'),
      c('clarification', 2, true, 'You asked what is behind the statement.', 'Ask what makes patients stop, rather than assuming.'),
      c('premature_pitch', 1, false, 'You stayed in listening mode.', 'You moved to your product before the cause was clear.'),
    ],
  },
  {
    ...common, id: 'objection-exploration-1', type: 'objection_exploration', difficulty: 'standard', durationMin: 3,
    physicianStyle: null, expectedResponse: 'short_text', passMark: 0.6,
    objective: { en: 'Explore an objection instead of arguing with it.' },
    prompt: { en: 'The doctor says: "Honestly, I am not convinced my patients need this."' },
    hint: { en: 'Acknowledge it, then ask which patients they have in mind.' },
    criteria: [
      c('objection_acknowledged', 2, true, 'You acknowledged the objection first.', 'Acknowledge the objection before you respond to it.'),
      c('clarification', 1, false, 'You asked what sits behind the objection.', 'Ask what would make it relevant, or what they have seen.'),
      c('argued_with_doctor', 1, false, 'You did not argue the point.', 'You countered the doctor head-on; explore first.'),
    ],
  },
  {
    ...common, id: 'buying-signal-1', type: 'buying_signal_recognition', difficulty: 'standard', durationMin: 3,
    physicianStyle: 'amiable', expectedResponse: 'short_text', passMark: 0.6,
    objective: { en: 'Notice interest and move toward a next step.' },
    prompt: { en: 'The doctor says: "That could help a few of my patients. What would starting look like?"' },
    hint: { en: 'The doctor asked about starting. Answer simply, then propose one concrete next step.' },
    criteria: [
      c('next_step_proposed', 2, true, 'You proposed a concrete next step.', 'The doctor signalled interest - propose a specific next step.'),
      c('benefit_tied_to_need', 1, false, 'You tied it to the patients the doctor mentioned.', 'Link your answer to the patients the doctor just described.'),
      c('generic_claim', 1, false, 'You stayed specific.', 'You added a broad claim the doctor did not ask for.'),
    ],
  },
  {
    ...common, id: 'opening-1', type: 'opening_a_visit', difficulty: 'standard', durationMin: 2,
    physicianStyle: 'driver', expectedResponse: 'spoken_statement', passMark: 0.6,
    objective: { en: 'Open with the doctor\'s patients, not your product.' },
    prompt: { en: 'The doctor looks up from a chart: "I have about three minutes. Go ahead."' },
    hint: { en: 'Start from a patient type or problem this doctor will recognise.' },
    criteria: [
      c('problem_first_opening', 2, true, 'You opened with a patient problem.', 'Open with a specific patient type or problem relevant to this doctor.'),
      c('product_first_opening', 1, false, 'You did not lead with the product.', 'You opened by announcing the product.'),
      c('open_question', 1, false, 'You ended with a question.', 'Finish your opening with an open question.'),
    ],
  },
  {
    ...common, id: 'needs-discovery-1', type: 'needs_discovery', difficulty: 'easy', durationMin: 3,
    physicianStyle: null, expectedResponse: 'question', passMark: 0.6,
    objective: { en: 'Find out what matters before presenting anything.' },
    prompt: { en: 'The doctor says: "Fine. Tell me why you are here."' },
    hint: { en: 'Ask what they look for when choosing a treatment.' },
    criteria: [
      c('open_question', 2, true, 'You asked an open question.', 'Ask an open question about their patients or priorities.'),
      c('criteria_question', 1, false, 'You asked what they look for in a treatment.', 'Ask what they look for when choosing a treatment.'),
      c('premature_pitch', 1, false, 'You did not pitch yet.', 'You pitched before understanding their situation.'),
    ],
  },
  {
    ...common, id: 'evidence-response-1', type: 'evidence_response', difficulty: 'standard', durationMin: 3,
    physicianStyle: 'analytical', expectedResponse: 'short_text', passMark: 0.6,
    objective: { en: 'Answer an evidence challenge without overclaiming.' },
    prompt: { en: 'The doctor says: "Where is the evidence for that? I want to see it, not hear it."' },
    hint: { en: 'Point to the approved evidence you have, say what it does and does not show, and offer to bring the source.' },
    criteria: [
      c('objection_acknowledged', 1, false, 'You acknowledged the challenge.', 'Acknowledge the request for evidence first.'),
      c('evidence_referenced', 2, true, 'You referred to evidence rather than reassurance.', 'Refer to the approved evidence instead of reassuring.'),
      c('unsupported_claim', 1, false, 'You made no unsupported claim.', 'You asserted a benefit without pointing to evidence.'),
    ],
  },
  {
    ...common, id: 'comparison-correction-1', type: 'unsupported_comparison_correction', difficulty: 'hard', durationMin: 3,
    physicianStyle: 'analytical', expectedResponse: 'short_text', passMark: 0.6,
    objective: { en: 'Correct an overstated comparison honestly.' },
    prompt: { en: 'The doctor says: "A minute ago you said yours is better than the other brand. On what basis?"' },
    hint: { en: 'If you cannot support it, say so, restate what you can support, and offer to follow up.' },
    criteria: [
      c('objection_acknowledged', 2, true, 'You owned the challenge instead of defending it.', 'Own the question first - the doctor is right to ask.'),
      c('unsupported_claim', 1, false, 'You did not repeat the claim.', 'You repeated a comparison without support.'),
      c('next_step_proposed', 1, false, 'You offered a follow-up.', 'Offer to come back with the source.'),
    ],
  },
  {
    ...common, id: 'price-objection-1', type: 'price_objection', difficulty: 'standard', durationMin: 3,
    physicianStyle: 'driver', expectedResponse: 'short_text', passMark: 0.6,
    objective: { en: 'Handle price by understanding it, not by defending it.' },
    prompt: { en: 'The doctor says: "It costs more than what we use now. Why would I switch?"' },
    hint: { en: 'Ask what the cost question is really about before you talk about value.' },
    criteria: [
      c('objection_acknowledged', 2, true, 'You acknowledged the cost concern.', 'Acknowledge the cost concern first.'),
      c('clarification', 1, false, 'You asked what the concern is about.', 'Ask whether this is about the patient, the budget, or something else.'),
      c('argued_with_doctor', 1, false, 'You did not argue.', 'You argued instead of exploring.'),
    ],
  },
  {
    ...common, id: 'safety-concern-1', type: 'safety_concern', difficulty: 'standard', durationMin: 3,
    physicianStyle: 'amiable', expectedResponse: 'short_text', passMark: 0.6,
    objective: { en: 'Respond to a safety worry with care and honesty.' },
    prompt: { en: 'The doctor says: "I am worried about side effects, especially in my older patients."' },
    hint: { en: 'Show you take it seriously, ask which side effects concern them, and use only approved safety information.' },
    criteria: [
      c('empathy_statement', 1, false, 'You acknowledged the worry.', 'Acknowledge how seriously the doctor takes this.'),
      c('clarification', 2, true, 'You asked what specifically worries them.', 'Ask which side effects or which patients concern them.'),
      c('unsupported_claim', 1, false, 'You did not reassure without evidence.', 'You reassured without referring to approved safety information.'),
    ],
  },
  {
    ...common, id: 'competitor-challenge-1', type: 'competitor_challenge', difficulty: 'standard', durationMin: 3,
    physicianStyle: 'driver', expectedResponse: 'short_text', passMark: 0.6,
    objective: { en: 'Respond to a competitor without attacking it.' },
    prompt: { en: 'The doctor says: "My patients do fine on the other brand. I see no reason to change."' },
    hint: { en: 'Find out which patients are not doing fine before comparing anything.' },
    criteria: [
      c('clarification', 2, true, 'You asked about patients who are not doing fine.', 'Ask whether any patients are not doing as well as hoped.'),
      c('need_uncovered', 1, false, 'You uncovered a specific need.', 'Draw out a specific patient type or need.'),
      c('argued_with_doctor', 1, false, 'You did not push back.', 'You countered the doctor\'s view head-on.'),
    ],
  },
  {
    ...common, id: 'commitment-closing-1', type: 'commitment_closing', difficulty: 'standard', durationMin: 2,
    physicianStyle: 'expressive', expectedResponse: 'spoken_statement', passMark: 0.6,
    objective: { en: 'Close with a clear, agreed next step.' },
    prompt: { en: 'The doctor says: "Interesting. We will see."' },
    hint: { en: 'Summarise what you agreed, then propose one specific next step with a time.' },
    criteria: [
      c('summarized', 1, false, 'You summarised what was agreed.', 'Summarise what was understood before closing.'),
      c('next_step_proposed', 2, true, 'You proposed a concrete next step.', 'Propose a specific next step, not "we will be in touch".'),
      c('premature_close', 1, false, 'You did not force the close.', 'You asked for a commitment before the doctor\'s concern was covered.'),
    ],
  },
  {
    ...common, id: 'difficult-analytical-1', type: 'difficult_analytical_doctor', difficulty: 'hard', durationMin: 4,
    physicianStyle: 'analytical', expectedResponse: 'short_text', passMark: 0.6,
    objective: { en: 'Stay precise and keep asking questions when an analytical doctor challenges you.' },
    prompt: { en: 'The doctor says: "Before I take any of this seriously, explain how you know it applies to my patients."' },
    hint: { en: 'Match their precision: ask which patients, then answer only what you can support.' },
    criteria: [
      c('style_matched', 2, true, 'Your depth and pace fitted this doctor.', 'Slow down and be precise; this doctor wants accuracy over enthusiasm.'),
      c('clarification', 1, false, 'You kept asking rather than explaining.', 'Ask which patients they mean before explaining.'),
      c('unsupported_claim', 1, false, 'You made no unsupported claim.', 'You asserted something you did not support.'),
    ],
  },
  {
    ...common, id: 'resistant-driver-1', type: 'resistant_driver_doctor', difficulty: 'hard', durationMin: 3,
    physicianStyle: 'driver', expectedResponse: 'spoken_statement', passMark: 0.6,
    objective: { en: 'Be brief and direct with a doctor who has no patience.' },
    prompt: { en: 'The doctor says: "Get to the point. What exactly do you want from me?"' },
    hint: { en: 'One sentence on why it matters to their patients, one clear ask.' },
    criteria: [
      c('style_matched', 2, true, 'You were brief and direct.', 'Cut it down: one reason, one ask.'),
      c('next_step_proposed', 1, false, 'You made a clear ask.', 'State exactly what you want from the doctor.'),
      c('hedged_delivery', 1, false, 'Your delivery was confident.', 'Hedges and fillers weakened your message.'),
    ],
  },
  {
    ...common, id: 'trust-recovery-1', type: 'trust_recovery', difficulty: 'hard', durationMin: 4,
    physicianStyle: 'amiable', expectedResponse: 'short_text', passMark: 0.6,
    objective: { en: 'Repair trust after a missed promise.' },
    prompt: { en: 'The doctor says: "Last time you promised to follow up and I never heard from you."' },
    hint: { en: 'Own it without excuses, then make one small commitment you can keep.' },
    criteria: [
      c('objection_acknowledged', 2, true, 'You owned the missed promise.', 'Acknowledge what went wrong before anything else.'),
      c('empathy_statement', 1, false, 'You recognised the impact on the doctor.', 'Recognise how this affected the doctor.'),
      c('next_step_proposed', 1, false, 'You committed to something specific.', 'Offer one concrete action you can keep.'),
    ],
  },
]

/** Validated at import: a malformed template fails the build/tests, never a rep's session. */
export const drillRegistry = createDrillRegistry(DRILL_TEMPLATES)
