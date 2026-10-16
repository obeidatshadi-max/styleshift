import type { SupabaseClient } from '@supabase/supabase-js'
import { type Knowledge, vocabulary } from './core'

export const ihiaEnabled = () => process.env.IHIA_ENABLED === 'true'
export async function isReviewer(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db.from('ihia_reviewers').select('user_id').eq('user_id', userId).maybeSingle()
  return !error && !!data
}
export async function approvedKnowledge(db: SupabaseClient): Promise<Knowledge[]> {
  const { data, error } = await db.from('ihia_entries').select('*').eq('status', 'approved').order('id').limit(1000)
  if (error) throw new Error('knowledge_unavailable')
  return (data ?? []) as Knowledge[]
}
/** Voice remains usable with no IHIA configuration. Missing knowledge never becomes verified data. */
export async function voiceVocabulary(db: SupabaseClient): Promise<string | undefined> {
  if (!ihiaEnabled()) return undefined
  try { return vocabulary(await approvedKnowledge(db)) } catch { return undefined }
}
