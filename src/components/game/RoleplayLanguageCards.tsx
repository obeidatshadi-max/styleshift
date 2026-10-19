'use client'
import { useT, useLang } from '@/lib/i18n'
import { andButOnGoal, neededVerdict, type LanguageSignals } from '@/lib/roleplay-language'

type Verdict = 'done' | 'partly' | 'missed' | 'na'

const COLOR: Record<Verdict, string> = { done: 'var(--green)', partly: 'var(--amber)', missed: 'var(--amber)', na: 'var(--ink-dim)' }

/**
 * Four word-level skills from the rep's own speech: empathy, paraphrasing,
 * "and" vs "but", and building on the partner's positive remarks. Each one
 * says plainly whether the rep did it, with an example of what to say.
 */
export default function RoleplayLanguageCards({ signals }: { signals: LanguageSignals }) {
  const t = useT()
  const { lang } = useLang()
  const times = (n: number) => (n === 1 ? t('lang.timesOne') : t('lang.times', { n }))

  const { empathy, paraphrasing, andBut, buildOnPositive: build } = signals
  const noAndBut = andBut.and + andBut.but === 0

  /** Empathy / paraphrasing: judged on the moments that called for it when the session has that data. */
  const whenNeeded = (skill: 'empathy' | 'paraphrasing', s: { count: number; needed?: number; met?: number }) => {
    if (s.needed === undefined) {
      return { verdict: (s.count > 0 ? 'done' : 'missed') as Verdict, result: s.count > 0 ? t(`lang.${skill}.done`, { times: times(s.count) }) : t(`lang.${skill}.none`), extent: undefined }
    }
    const v = neededVerdict(s.needed, s.met)
    if (v === 'none') return { verdict: 'na' as Verdict, result: t(`lang.${skill}.noMoment`), extent: undefined }
    const met = s.met ?? 0
    return {
      verdict: v as Verdict,
      result: t(`lang.${skill}.needed`, { needed: times(s.needed), met: times(met) }),
      extent: { met, needed: s.needed },
    }
  }
  const emp = whenNeeded('empathy', empathy)
  const para = whenNeeded('paraphrasing', paraphrasing)

  const cards: { key: string; title: string; verdict: Verdict; result: string; hint: string; extra?: string; extent?: { met: number; needed: number } }[] = [
    { key: 'empathy', title: t('lang.empathy.title'), verdict: emp.verdict, result: emp.result, extent: emp.extent, hint: t('lang.empathy.hint') },
    { key: 'paraphrasing', title: t('lang.paraphrasing.title'), verdict: para.verdict, result: para.result, extent: para.extent, hint: t('lang.paraphrasing.hint'),
      extra: paraphrasing.confirmed === undefined || paraphrasing.count === 0 ? undefined : t('lang.paraphrasing.confirmed', { times: times(paraphrasing.confirmed) }) },
    {
      key: 'andBut', title: t('lang.andBut.title'),
      verdict: noAndBut || andButOnGoal(andBut) ? 'done' : 'missed',
      result: noAndBut ? t('lang.andBut.none') : t('lang.andBut.result', { and: andBut.and, but: andBut.but }),
      hint: t('lang.andBut.hint'),
      extra: lang === 'ar' ? t('lang.andBut.arNote') : undefined,
    },
    {
      key: 'build', title: t('lang.build.title'),
      verdict: build.positives === 0 ? 'done' : build.builtOn === build.positives ? 'done' : build.builtOn > 0 ? 'partly' : 'missed',
      result: build.positives === 0 ? t('lang.build.none') : t('lang.build.result', { positives: build.positives, built: build.builtOn }),
      hint: t('lang.build.hint'),
    },
  ]

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 8 }}>{t('lang.title')}</div>
      {cards.map(c => (
        <div key={c.key} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 5, gap: 10 }}>
            <span>{c.title}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 700, color: COLOR[c.verdict], whiteSpace: 'nowrap' }}>{t(`lang.verdict.${c.verdict}`)}</span>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 5 }}>{c.result}</p>
          {c.extent && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: COLOR[c.verdict], marginBottom: 3 }}>{t('lang.extent', c.extent)}</div>
              <div style={{ height: 5, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.round((c.extent.met / c.extent.needed) * 100)}%`, height: '100%', background: COLOR[c.verdict] }} />
              </div>
            </div>
          )}
          <p style={{ fontSize: 11.5, color: 'var(--ink-dim)', lineHeight: 1.5 }}>{c.hint}</p>
          {c.extra && <p style={{ fontSize: 11, color: 'var(--ink-dim)', lineHeight: 1.5, marginTop: 4 }}>{c.extra}</p>}
        </div>
      ))}
      <p style={{ fontSize: 11, color: 'var(--ink-dim)', lineHeight: 1.5 }}>{t('lang.caveat')}</p>
    </div>
  )
}
