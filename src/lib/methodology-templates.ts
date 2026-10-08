/**
 * Starting points for the Methodology Builder: generic four-stage structures
 * expressed over StyleShift's fixed behavior ontology. They are NOT copies of
 * any vendor's licensed material - a company edits the stage names, wording
 * and behaviors to match its own model. Every template is validated by tests.
 */
const stage = (id: string, order: number, name: string, description: string, expected: string[], prohibited: string[], weight: number, evidence: string[], prompts: string[]) => ({
  id, order, name: { en: name }, description: { en: description }, optional: false,
  expectedBehaviors: expected, prohibitedBehaviors: prohibited, requiredEvidence: evidence, weight,
  coachingPrompts: prompts.map(en => ({ en })),
})

export interface MethodologyTemplate { id: string; label: string; body: unknown }

export const METHODOLOGY_TEMPLATES: MethodologyTemplate[] = [
  {
    id: 'opening_explore_position_commit',
    label: 'Opening, Explore, Position, Commit',
    body: {
      name: 'Opening, Explore, Position, Commit', version: 1,
      stages: [
        stage('opening', 1, 'Opening', 'Start from the doctor\'s patients, not the product.',
          ['problem_first_opening', 'open_question'], ['product_first_opening'], 1,
          ['A patient type or problem named in the first minute'], ['What patient situation would make this doctor lean in?']),
        stage('explore', 2, 'Explore', 'Understand the situation before presenting anything.',
          ['clarification', 'need_uncovered', 'specifying_question', 'criteria_question', 'paraphrasing'],
          ['premature_pitch', 'leading_question', 'forbidden_question', 'interruption'], 2,
          ['At least one specific need or criterion in the doctor\'s own words'], ['Which vague word could you ask about before moving on?']),
        stage('position', 3, 'Position', 'Link approved evidence to what the doctor said matters.',
          ['benefit_tied_to_need', 'evidence_referenced', 'objection_acknowledged'],
          ['generic_claim', 'unsupported_claim', 'argued_with_doctor', 'ignored_objection'], 2,
          ['Each claim tied to a stated need or to approved evidence'], ['Which of the doctor\'s words does this benefit answer?']),
        stage('commit', 4, 'Commit', 'Close on a clear, agreed next step.',
          ['next_step_proposed', 'agreement_then_commitment', 'summarized'], ['no_next_step', 'premature_close'], 1.5,
          ['A specific next step with a time'], ['What exactly will happen next, and when?']),
      ],
      terminology: {
        clarification: { en: 'Explore the need' }, need_uncovered: { en: 'Surface the need' }, problem_first_opening: { en: 'Patient-first opening' },
        next_step_proposed: { en: 'Propose the commitment' }, premature_pitch: { en: 'Pitching before exploring' },
      },
      dimensionTerms: {},
    },
  },
  {
    id: 'connect_understand_evidence_agree',
    label: 'Connect, Understand, Evidence, Agree',
    body: {
      name: 'Connect, Understand, Evidence, Agree', version: 1,
      stages: [
        stage('connect', 1, 'Connect', 'Show you hear the doctor before you ask or tell.',
          ['empathy_statement', 'labeled_emotion', 'paraphrasing'], ['interruption'], 1,
          ['The doctor\'s concern restated before any answer'], ['How did you show you heard the concern?']),
        stage('understand', 2, 'Understand', 'Ask until the real need is clear.',
          ['open_question', 'clarification', 'what_stops_question', 'checked_interpretation'], ['premature_pitch', 'accepted_vague_objection'], 2,
          ['The reason behind the doctor\'s position'], ['What have you assumed that you have not yet checked?']),
        stage('evidence', 3, 'Evidence', 'Support what you say with approved evidence.',
          ['evidence_referenced', 'benefit_tied_to_need', 'resolution_checked'], ['unsupported_claim', 'generic_claim', 'used_but_contradiction'], 2,
          ['Approved evidence named, with the limits of what it shows'], ['Which claim would you struggle to source?']),
        stage('agree', 4, 'Agree', 'Leave with an agreement both sides can name.',
          ['next_step_proposed', 'summarized', 'agreement_then_commitment'], ['premature_close', 'no_next_step'], 1.5,
          ['An agreed next step the doctor confirmed'], ['Would the doctor describe the next step the way you would?']),
      ],
      terminology: { empathy_statement: { en: 'Acknowledge' }, clarification: { en: 'Go deeper' }, summarized: { en: 'Confirm the agreement' } },
      dimensionTerms: {},
    },
  },
  {
    id: 'situation_problem_implication_need',
    label: 'Situation, Problem, Implication, Need (SPIN-style)',
    body: {
      name: 'Situation, Problem, Implication, Need', version: 1,
      stages: [
        stage('situation', 1, 'Situation', 'Learn the relevant facts about the doctor\'s practice, briefly.',
          ['open_question', 'criteria_question'], ['forbidden_question', 'leading_question'], 1,
          ['Only the situation facts that were needed'], ['Which of your questions could you have skipped?']),
        stage('problem', 2, 'Problem', 'Find the difficulty or dissatisfaction.',
          ['clarification', 'need_uncovered'], ['accepted_vague_objection', 'premature_pitch'], 2,
          ['A named difficulty in the doctor\'s words'], ['What is the difficulty, in the doctor\'s own words?']),
        stage('implication', 3, 'Implication', 'Explore what the problem leads to.',
          ['what_stops_question', 'specifying_question'], ['interruption'], 2,
          ['A consequence the doctor stated'], ['What does this problem lead to for the patient?']),
        stage('need_payoff', 4, 'Need-payoff', 'Let the doctor say what a solution would be worth.',
          ['benefit_tied_to_need', 'next_step_proposed'], ['generic_claim', 'no_next_step'], 1.5,
          ['The doctor describing the value in their own terms'], ['Who said why this matters, you or the doctor?']),
      ],
      terminology: { need_uncovered: { en: 'Develop the problem' }, what_stops_question: { en: 'Implication question' } },
      dimensionTerms: {},
    },
  },
]
