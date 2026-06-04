import type { ObjectionCategory } from '@/lib/social-style'

// Objection category for each Level-2 (Crisis Mode) scenario, keyed by id so the
// metadata lives once and stays language-independent. Used by Visit Prep to
// match a rep's anticipated objection to the closest drill.
export const L2_OBJECTION: Record<number, ObjectionCategory> = {
  201: 'competitor', // rival showed "no better" data
  202: 'time',       // 20 patients waiting
  203: 'safety',     // side-effect complaint
  204: 'trust',      // panel dismissed her idea
  205: 'evidence',   // stability data mismatch
  206: 'logistics',  // product not moving on shelf
  207: 'time',       // rollout too fast
  208: 'competitor', // bigger offer elsewhere
  209: 'price',      // higher than generic
  210: 'evidence',   // not in the guideline
  211: 'evidence',   // patient bounced back
  212: 'safety',     // renal-impairment dosing
  213: 'trust',      // bad result posted online
  214: 'safety',     // polypharmacy in elderly
  215: 'logistics',  // late delivery
  216: 'evidence',   // missing impurity profile
  217: 'competitor', // symposium slot lost
  218: 'safety',     // packaging confused a patient
}
