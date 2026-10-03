import type { DoctorInput, StyleKey } from '@/types/game'

export interface CompanyDoctorInput {
  profile: DoctorInput
  sourceNotes: string
  repIds: string[]
}

const STYLES: StyleKey[] = ['driver', 'expressive', 'amiable', 'analytical']
const MAX_FIELD = 2000

export function parseCompanyDoctorInput(value: unknown): CompanyDoctorInput | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const p = v.profile
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null
  const raw = p as Record<string, unknown>
  const str = (key: string, max = MAX_FIELD) => typeof raw[key] === 'string' && (raw[key] as string).length <= max
    ? (raw[key] as string).trim() || null : null
  if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 120 ||
    typeof raw.style !== 'string' || !STYLES.includes(raw.style as StyleKey) ||
    typeof v.sourceNotes !== 'string' || v.sourceNotes.length > 5000 ||
    !Array.isArray(v.repIds) || v.repIds.length < 1 || v.repIds.length > 100 ||
    v.repIds.some(id => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) return null
  if (raw.objections !== undefined && (!Array.isArray(raw.objections) || raw.objections.length > 8 ||
    raw.objections.some(o => typeof o !== 'string' || !o.trim() || o.length > 200))) return null
  if (raw.available_time_min !== undefined && raw.available_time_min !== null &&
    (!Number.isInteger(raw.available_time_min) || Number(raw.available_time_min) < 1 || Number(raw.available_time_min) > 120)) return null
  for (const key of ['specialty', 'workplace', 'key_phrases', 'objection_notes', 'hidden_concern', 'product_context', 'meeting_stage']) {
    if (raw[key] !== undefined && raw[key] !== null && (typeof raw[key] !== 'string' || raw[key].length > MAX_FIELD)) return null
  }
  for (const key of ['assertiveness', 'responsiveness']) {
    if (raw[key] !== undefined && raw[key] !== null && typeof raw[key] !== 'string') return null
  }
  if (raw.assertiveness != null && !['ask', 'tell'].includes(String(raw.assertiveness))) return null
  if (raw.responsiveness != null && !['controls', 'emotes'].includes(String(raw.responsiveness))) return null

  const profile: DoctorInput = {
    name: raw.name.trim(),
    specialty: str('specialty'), workplace: str('workplace'), style: raw.style as StyleKey,
    assertiveness: (raw.assertiveness ?? null) as DoctorInput['assertiveness'],
    responsiveness: (raw.responsiveness ?? null) as DoctorInput['responsiveness'],
    key_phrases: str('key_phrases'), objections: (raw.objections as string[] | undefined)?.map(s => s.trim()) ?? [],
    objection_notes: str('objection_notes'), notes: (v.sourceNotes as string).trim() || null,
    style_driver: null, style_expressive: null, style_amiable: null, style_analytical: null,
    hidden_concern: str('hidden_concern'), product_context: str('product_context'),
    meeting_stage: str('meeting_stage'), available_time_min: (raw.available_time_min as number | null | undefined) ?? null,
  }
  return { profile, sourceNotes: (v.sourceNotes as string).trim(), repIds: [...new Set(v.repIds as string[])] }
}

export function doctorRowForRep(profile: DoctorInput, repId: string) {
  return { ...profile, rep_id: repId, updated_at: new Date().toISOString() }
}
