import { describe, expect, it } from 'vitest'
import { doctorRowForRep, parseCompanyDoctorInput } from './company-doctors'
const repId = '00000000-0000-4000-8000-000000000001'
const input = {
  profile: { name: 'Dr. Example', specialty: 'Cardiology', style: 'analytical', objections: ['Evidence'], product_context: 'Approved label only' },
  sourceNotes: 'Prefers concise, evidence-led discussions.', repIds: [repId],
}
describe('shared doctor profile input', () => {
  it('normalizes a manager briefing into the rep-owned AI Doctor profile shape', () => {
    const parsed = parseCompanyDoctorInput(input)
    expect(parsed?.profile).toMatchObject({ name: 'Dr. Example', style: 'analytical', notes: input.sourceNotes, objections: ['Evidence'] })
    expect(parsed?.repIds).toEqual([repId])
    expect(doctorRowForRep(parsed!.profile, repId)).toMatchObject({ rep_id: repId, product_context: 'Approved label only' })
  })
  it('rejects missing style, recipients, malformed recipients and oversized briefing text', () => {
    for (const value of [
      { ...input, profile: { ...input.profile, style: null } },
      { ...input, repIds: [] }, { ...input, repIds: ['not-a-uuid'] }, { ...input, sourceNotes: 'x'.repeat(5001) },
    ]) expect(parseCompanyDoctorInput(value)).toBeNull()
  })
})
