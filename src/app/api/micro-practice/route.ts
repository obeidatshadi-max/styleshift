import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { drillRegistry } from '@/lib/drill-templates'
import { historyByDrill, listAttempts, microPracticeEnabled } from '@/lib/drill-attempts'

/** The drill library for the rep's language, with their own history per drill. */
export async function GET(req: Request) {
  if (!microPracticeEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const requested = new URL(req.url).searchParams.get('lang') === 'ar' ? 'ar' : 'en'
  // Drills are written in English first. A rep whose language has none still gets the English
  // library (the card tells them so) rather than a card that silently disappears.
  const lang = drillRegistry.list({ lang: requested }).length ? requested : 'en'
  const history = historyByDrill(await listAttempts(supabase, user.id))
  const drills = drillRegistry.list({ lang }).map(t => ({
    id: t.id, type: t.type, difficulty: t.difficulty, durationMin: t.durationMin, physicianStyle: t.physicianStyle,
    objective: t.objective[lang] ?? '', history: history[t.id] ?? null,
  }))
  const prompts = Object.fromEntries(drillRegistry.list({ lang }).map(t => [t.id, t.prompt[lang] ?? '']))
  return NextResponse.json({ drills, prompts, drillLang: lang })
}
