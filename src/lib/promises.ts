import { createClient } from '@/lib/supabase-browser'

/** Adds a promise the rep made to a doctor to the tracker (a manual visit entry with promise_made).
 * An identical open promise for the same doctor is reused, so adding twice never duplicates. */
export async function addPromise(doctorId: string, text: string): Promise<boolean> {
  const supabase = createClient()
  const promise = text.trim()
  if (!promise) return false
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: existing } = await supabase.from('doctor_visits').select('id')
    .eq('doctor_id', doctorId).eq('promise_made', promise).is('promise_done_at', null).limit(1)
  if (existing && existing.length > 0) return true
  const { error } = await supabase.from('doctor_visits').insert({ doctor_id: doctorId, rep_id: user.id, source: 'manual', promise_made: promise, note: 'From a coach debrief' })
  return !error
}
