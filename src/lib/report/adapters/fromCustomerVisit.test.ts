// src/lib/report/adapters/fromCustomerVisit.test.ts
import { describe, it, expect } from 'vitest'
import { adaptCustomerVisit } from './fromCustomerVisit'
import type { TranscriptSegmentRow } from './fromRoleplaySession'

const rows: TranscriptSegmentRow[] = [
  { segment_index: 0, speaker_role: 'rep', text: 'Thanks for seeing me today.', start_ms: 0, end_ms: 1500 },
]
const visit = {
  objective: 'Confirm switch to new formulation', product_context: 'Cardio line', retention_policy: 'discard_after_report' as const,
}

describe('adaptCustomerVisit', () => {
  it('carries the stated objective/product context through, never invents one', () => {
    const { context } = adaptCustomerVisit(rows, visit)
    expect(context.objective).toBe('Confirm switch to new formulation')
    expect(context.isSimulation).toBe(false)
  })
  it('flags a real customer session with no saved style profile', () => {
    const { context } = adaptCustomerVisit(rows, visit)
    expect(context.savedCounterpartStyle).toBeNull()
  })
})
