import { NextResponse } from 'next/server'
import { listAssignedForRep } from '@/lib/sim-scenarios'
import { scenarioApiContext } from '@/lib/sim-scenario-route'

/** Rep: approved scenarios assigned to me or to my whole company. Only the fields a rep needs to choose and start one. */
export async function GET() {
  const ctx = await scenarioApiContext()
  if ('response' in ctx) return ctx.response
  const scenarios = await listAssignedForRep(ctx.userId)
  return NextResponse.json(scenarios.map(s => ({
    id: s.id, name: s.name, description: s.description, therapeuticArea: s.therapeuticArea,
    difficulty: s.difficulty, language: s.language, availableTimeMin: s.availableTimeMin,
    specialty: s.physician.specialty, style: s.physician.style, visitPurpose: s.visitPurpose,
  })))
}
