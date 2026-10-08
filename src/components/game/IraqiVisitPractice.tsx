'use client'
import { useLang, useT } from '@/lib/i18n'
import { IRAQI_VISIT_SCENARIOS } from '@/lib/iraqi-visit-scenarios'

export function IraqiVisitPractice({ onPractice }: { onPractice: (focus: string) => void }) {
  const { lang } = useLang()
  const t = useT()
  return <details>
    <summary style={{ cursor: 'pointer', padding: '14px 0', color: 'var(--cyan)' }}>{t('practice.context.title')}</summary>
    <p style={{ fontSize: 13, color: 'var(--ink-dim)', lineHeight: 1.6 }}>{t('practice.context.intro')}</p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {IRAQI_VISIT_SCENARIOS.map(scenario => <button key={scenario.id} type="button"
        onClick={() => onPractice(scenario[lang].focus)}
        style={{ textAlign: 'start', cursor: 'pointer', color: 'var(--ink)', background: 'transparent', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', fontSize: 14, lineHeight: 1.5 }}>
        {scenario[lang].title}
      </button>)}
    </div>
  </details>
}
