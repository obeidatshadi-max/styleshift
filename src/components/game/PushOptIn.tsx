'use client'
import { useT } from '@/lib/i18n'
import { usePushReminders } from '@/hooks/usePushReminders'

/** Opt-in for the daily debrief reminder. Hidden where push cannot work. */
export default function PushOptIn() {
  const t = useT()
  const { state, enable, disable } = usePushReminders()
  if (state === 'unsupported') return null

  const message = state === 'on' ? t('push.on')
    : state === 'denied' ? t('push.denied')
    : state === 'needs-install' ? t('push.install')
    : state === 'error' ? t('push.error')
    : t('push.body')
  const btn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--line)', color: 'var(--ink-dim)', background: 'transparent', borderRadius: 10, padding: '9px 14px', touchAction: 'manipulation', flexShrink: 0 }

  return (
    <section role="region" aria-label={t('push.title')} style={{ border: '1px solid var(--line)', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 4 }}>🔔 {t('push.title')}</div>
        <div role={state === 'error' ? 'alert' : undefined} style={{ fontSize: 13, lineHeight: 1.5, color: state === 'error' ? 'var(--red)' : 'var(--ink-dim)' }}>{message}</div>
      </div>
      {(state === 'off' || state === 'error') && <button style={{ ...btn, borderColor: 'var(--cyan)', color: 'var(--cyan)' }} onClick={() => void enable()}>{t('push.enable')}</button>}
      {state === 'on' && <button style={btn} onClick={() => void disable()}>{t('push.disable')}</button>}
      {state === 'busy' && <span role="status" style={{ fontSize: 12, color: 'var(--ink-dim)' }}>…</span>}
    </section>
  )
}
