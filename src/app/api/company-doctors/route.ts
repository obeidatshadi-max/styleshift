import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { doctorRowForRep, parseCompanyDoctorInput } from '@/lib/company-doctors'

async function managerContext() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('company_id,role').eq('id', user.id).single()
  if (profile?.role !== 'manager' || !profile.company_id)
    return { response: NextResponse.json({ error: 'manager_required' }, { status: 403 }) }
  return { admin, userId: user.id, companyId: profile.company_id as string }
}

export async function GET() {
  const ctx = await managerContext()
  if ('response' in ctx) return ctx.response
  const { data: profiles, error } = await ctx.admin.from('company_doctor_profiles')
    .select('id,name,profile,source_notes,created_at').eq('company_id', ctx.companyId).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'profiles_unavailable' }, { status: 503 })
  const ids = (profiles ?? []).map(p => p.id)
  if (!ids.length) return NextResponse.json({ profiles: [] })
  const { data: assignments } = await ctx.admin.from('company_doctor_assignments')
    .select('profile_id,rep_id,rep_doctor_id').eq('company_id', ctx.companyId).in('profile_id', ids)
  const repIds = [...new Set((assignments ?? []).map(a => a.rep_id))]
  const { data: reps } = repIds.length
    ? await ctx.admin.from('profiles').select('id,display_name').in('id', repIds)
    : { data: [] }
  const repById = new Map((reps ?? []).map(rep => [rep.id, rep.display_name]))
  return NextResponse.json({ profiles: (profiles ?? []).map(profile => ({
    ...profile,
    assignedReps: (assignments ?? []).filter(a => a.profile_id === profile.id)
      .map(a => ({ id: a.rep_id, name: repById.get(a.rep_id) ?? 'Rep' })),
  })) })
}

/** Save a company-owned profile and materialize rep-owned copies for AI Doctor. */
export async function POST(req: Request) {
  const ctx = await managerContext()
  if ('response' in ctx) return ctx.response
  const input = parseCompanyDoctorInput(await req.json().catch(() => null))
  if (!input) return NextResponse.json({ error: 'invalid_profile' }, { status: 400 })

  const { data: targets, error: targetError } = await ctx.admin.from('profiles').select('id')
    .eq('company_id', ctx.companyId).eq('role', 'rep').in('id', input.repIds)
  if (targetError || targets?.length !== input.repIds.length)
    return NextResponse.json({ error: 'invalid_recipients' }, { status: 400 })

  const { data: source, error: sourceError } = await ctx.admin.from('company_doctor_profiles').insert({
    company_id: ctx.companyId, created_by: ctx.userId, name: input.profile.name,
    profile: input.profile, source_notes: input.sourceNotes,
  }).select('id').single()
  if (sourceError || !source) return NextResponse.json({ error: 'save_failed' }, { status: 503 })

  const doctorIds: string[] = []
  let failed = false
  for (const repId of input.repIds) {
    const { data: doctor, error: doctorError } = await ctx.admin.from('doctors')
      .insert(doctorRowForRep(input.profile, repId)).select('id').single()
    if (doctorError || !doctor) { failed = true; break }
    doctorIds.push(doctor.id)
    const { error: assignmentError } = await ctx.admin.from('company_doctor_assignments').insert({
      profile_id: source.id, company_id: ctx.companyId, rep_id: repId,
      rep_doctor_id: doctor.id, assigned_by: ctx.userId,
    })
    if (assignmentError) { failed = true; break }
  }

  if (failed) {
    await ctx.admin.from('company_doctor_assignments').delete().eq('profile_id', source.id)
    if (doctorIds.length) await ctx.admin.from('doctors').delete().in('id', doctorIds)
    await ctx.admin.from('company_doctor_profiles').delete().eq('id', source.id)
    return NextResponse.json({ error: 'assignment_failed' }, { status: 503 })
  }
  return NextResponse.json({ ok: true, profileId: source.id, assignedCount: doctorIds.length })
}
