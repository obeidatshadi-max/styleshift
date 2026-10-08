import { createClient } from '@/lib/supabase-browser'

/** Adds a promise the rep made to a doctor to the tracker (a manual visit entry with promise_made).
 * An identical open promise for the same doctor is reused, so adding twice never duplicates. */
export async function addPromise(doctorId: string, text: string): Promise<boolean> {
  try {
    const supabase = createClient()
    const promise = text.trim()
    if (!promise) return false
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const { error } = await supabase.rpc('add_doctor_promise', { p_doctor_id: doctorId, p_text: promise })
    return !error
  } catch { return false }
}
