import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { adminContext, isUuid } from '@/lib/validation/pilot-admin-route'
import { respond } from '@/lib/validation/assessor-route'
import { runAnalysis } from '@/lib/validation/analysis-run'
import { loadAnalysisInput } from '@/lib/validation/analysis-loader'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const ctx = await adminContext()
  if ('response' in ctx) return ctx.response
  const search = new URL(req.url).searchParams
  return respond(() => runAnalysis(ctx.store, (pilotId, extras) => loadAnalysisInput(createAdminClient(), pilotId, extras), id, search))
}
