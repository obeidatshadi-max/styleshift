'use client'
import { useT, useLang } from '@/lib/i18n'
import { andButOnGoal, type LanguageSignals } from '@/lib/roleplay-language'

type Verdict = 'done' | 'partly' | 'missed'

const COLOR: Record<Verdict, string> = { done: 'var(--green)', partly: 'var(--amber)', missed: 'var(--amber)' }

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

  const cards: { key: string; title: string; verdict: Verdict; result: string; hint: string; extra?: string }[] = [
    {
      key: 'empathy', title: t('lang.empathy.title'),
      verdict: empathy.count > 0 ? 'done' : 'missed',
      result: empathy.count > 0 ? t('lang.empathy.done', { times: times(empathy.count) }) : t('lang.empathy.none'),
      hint: t('lang.empathy.hint'),
    },
    {
      key: 'paraphrasing', title: t('lang.paraphrasing.title'),
      verdict: paraphrasing.count > 0 ? 'done' : 'missed',
      result: paraphrasing.count > 0 ? t('lang.paraphrasing.done', { times: times(paraphrasing.count) }) : t('lang.paraphrasing.none'),
      hint: t('lang.paraphrasing.hint'),
    },
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
          <p style={{ fontSize: 11.5, color: 'var(--ink-dim)', lineHeight: 1.5 }}>{c.hint}</p>
          {c.extra && <p style={{ fontSize: 11, color: 'var(--ink-dim)', lineHeight: 1.5, marginTop: 4 }}>{c.extra}</p>}
        </div>
      ))}
      <p style={{ fontSize: 11, color: 'var(--ink-dim)', lineHeight: 1.5 }}>{t('lang.caveat')}</p>
    </div>
  )
}
