import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { loadRepData, practiceMyDoctorEnabled, prepare } from '@/lib/practice-my-doctor'

/**
 * What a "Practice my doctor" simulation would assume, shown BEFORE it starts:
 * the doctor (the suggested next visit unless one is chosen), the facts the rep
 * recorded, the inferences drawn from them, the invented practice challenge,
 * and what is not known. Read-only; uses only the rep's own records.
 */
export async function GET(req: Request) {
  if (!practiceMyDoctorEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const doctorId = url.searchParams.get('doctorId') || undefined
  const seed = url.searchParams.get('seed') || crypto.randomUUID()
  const data = await loadRepData(supabase, user.id)
  const doctors = data.doctors.map(d => ({ id: d.id, name: d.name }))
  const prepared = prepare(data, { doctorId, seed, nowMs: Date.now() })
  if (!prepared) return NextResponse.json({ doctors, prepared: null })
  return NextResponse.json({
    doctors, seed, reason: prepared.reason,
    doctor: { id: prepared.doctor.id, name: prepared.doctor.name, style: prepared.doctor.style },
    context: prepared.context,
  })
}
