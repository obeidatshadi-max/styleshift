import type { ObjectionCategory } from '@/lib/social-style'

// Cognitive biases that typically drive each objection category — not the
// rep's bias, the DOCTOR's. Recognizing which bias is actually behind an
// objection changes the counter: arguing data against an anchoring-driven
// price objection just re-anchors it; the fix is to move the anchor first.
export type BiasKey =
  | 'confirmation_bias' | 'anchoring_bias' | 'availability_bias'
  | 'social_proof_bias' | 'status_quo_bias' | 'authority_bias' | 'negativity_bias'

export const BIAS_FOR_CATEGORY: Record<ObjectionCategory, BiasKey> = {
  evidence: 'confirmation_bias',
  price: 'anchoring_bias',
  safety: 'availability_bias',
  competitor: 'social_proof_bias',
  time: 'status_quo_bias',
  trust: 'authority_bias',
  logistics: 'negativity_bias',
}

export function biasForCategory(category: ObjectionCategory): BiasKey {
  return BIAS_FOR_CATEGORY[category]
}
