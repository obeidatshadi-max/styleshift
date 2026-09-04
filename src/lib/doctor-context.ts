import type { DoctorVisit, StyleKey } from '@/types/game'

// Core drive per social style — shared doctor-persona copy used by every
// AI-generated doctor voice: the bespoke drill (generate-scenario) and the
// AI voice partner (open/turn).
export const DRIVE: Record<StyleKey, string> = {
  driver: 'Control & Achievement',
  expressive: 'Recognition & Ideas',
  amiable: 'Security & Harmony',
  analytical: 'Certainty & Accuracy',
}

// Turns a doctor's visit history into "the rep already knows this" context so
// a generated scenario or conversation echoes real objections/promises
// instead of generic style theory.
export function buildHistoryContext(visits: DoctorVisit[]): string {
  if (!visits.length) return ''
  const lines = visits.slice(0, 5).map(v => {
    const parts: string[] = []
    if (v.objection_raised) parts.push(`objection: "${v.objection_raised}"`)
    if (v.promise_made) parts.push(`rep promised: "${v.promise_made}"`)
    if (v.what_worked) parts.push(`worked well: "${v.what_worked}"`)
    if (!parts.length && v.note) parts.push(v.note)
    return parts.length ? `- ${parts.join('; ')}` : null
  }).filter((l): l is string => l !== null)
  if (!lines.length) return ''
  return `Past visit history with this doctor (most recent first) — use this to make the objection feel like a continuation, not a first meeting:\n${lines.join('\n')}`
}
