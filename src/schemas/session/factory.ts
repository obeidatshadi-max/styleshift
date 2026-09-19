import type { StyleShiftSession } from '@/schemas/session'
import { DEFAULT_DIFFICULTY } from '@/lib/voice-partner-core'

const EVEN = { driver: 0.25, expressive: 0.25, amiable: 0.25, analytical: 0.25 }

/** A valid, empty session for tests and for the orchestrator to fill in. */
export function createEmptySession(sessionId: string, repId: string): StyleShiftSession {
  return {
    sessionId, lang: 'en', status: 'in_progress', startedAt: null, endedAt: null,
    rep: { repId, displayName: null, companyId: null, spsTopKey: null, spsProfile: null },
    physician: {
      doctorId: null, name: '', workplace: null, keyPhrases: null, hiddenConcern: null,
      notes: null, meetingStage: null, availableTimeMin: null, initialState: null,
    },
    specialty: null,
    socialStyle: { primary: null, weights: EVEN, dominant: null, source: 'unknown', assertiveness: null, responsiveness: null },
    difficulty: DEFAULT_DIFFICULTY,
    objections: { activeType: null, onProfile: [], notes: null },
    product: { name: null, context: null },
    learningObjectives: [],
    transcript: [],
    observations: [], scores: null, coaching: [],
  }
}
