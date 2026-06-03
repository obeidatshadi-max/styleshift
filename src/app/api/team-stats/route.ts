import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

export interface RepStat {
  id: string
  display_name: string | null
  xp: number
  last_visit: string | null
  total_sessions: number
  avg_accuracy: number
  flag: boolean
}

export interface TeamStats {
  reps: RepStat[]
  levelAccuracy: { level: number; title: string; avg: number }[]
  activity: { day: string; count: number }[]
  plan: string
  inviteCode: string
}

const LEVEL_TITLES: Record<number, string> = {
  1: 'Style Scan', 2: 'Crisis Mode', 3: 'Drive Decoder', 4: 'The Boardroom'
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: manager } = await admin
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single()

  if (!manager?.company_id || manager.role !== 'manager') {
    return NextResponse.json({ error: 'Not a manager' }, { status: 403 })
  }

  const companyId = manager.company_id

  const { data: company } = await admin
    .from('companies')
    .select('plan, invite_code')
    .eq('id', companyId)
    .single()

  const { data: reps } = await admin
    .from('profiles')
    .select('id, display_name, xp, last_visit')
    .eq('company_id', companyId)
    .eq('role', 'rep')
    .order('xp', { ascending: false })

  if (!reps?.length) {
    return NextResponse.json({
      reps: [],
      levelAccuracy: [1,2,3,4].map(l => ({ level: l, title: LEVEL_TITLES[l], avg: 0 })),
      activity: [],
      plan: company?.plan ?? 'free',
      inviteCode: company?.invite_code ?? '',
    })
  }

  const repIds = reps.map(r => r.id)

  const { data: sessions } = await admin
    .from('sessions')
    .select('rep_id, level, accuracy, completed_at')
    .in('rep_id', repIds)

  const allSessions = sessions ?? []

  const repStats: RepStat[] = reps.map(rep => {
    const repSessions = allSessions.filter(s => s.rep_id === rep.id)
    const avg = repSessions.length
      ? Math.round(repSessions.reduce((sum, s) => sum + s.accuracy, 0) / repSessions.length)
      : 0
    return {
      id: rep.id,
      display_name: rep.display_name,
      xp: rep.xp,
      last_visit: rep.last_visit,
      total_sessions: repSessions.length,
      avg_accuracy: avg,
      flag: avg > 0 && avg < 70,
    }
  })

  const levelAccuracy = [1,2,3,4].map(level => {
    const ls = allSessions.filter(s => s.level === level)
    const avg = ls.length
      ? Math.round(ls.reduce((sum, s) => sum + s.accuracy, 0) / ls.length)
      : 0
    return { level, title: LEVEL_TITLES[level], avg }
  })

  const today = new Date()
  const activity = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (6 - i))
    const day = d.toISOString().slice(0, 10)
    const count = allSessions.filter(s => s.completed_at?.startsWith(day)).length
    return { day, count }
  })

  return NextResponse.json({
    reps: repStats,
    levelAccuracy,
    activity,
    plan: company?.plan ?? 'free',
    inviteCode: company?.invite_code ?? '',
  })
}
