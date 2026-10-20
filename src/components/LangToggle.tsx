'use client'
import { useLang, useT } from '@/lib/i18n'

/** Small EN/AR language switch. Label shows the language you switch TO. */
export default function LangToggle() {
  const { toggle } = useLang()
  const t = useT()
  return (
    <button
      onClick={toggle}
      aria-label="Switch language"
      style={{
        fontFamily: 'var(--mono)', fontSize: 14, letterSpacing: 'normal', textTransform: 'none',
        color: 'var(--cyan)', background: 'var(--accent-soft)', border: '1px solid var(--cyan)',
        borderRadius: 20, padding: '6px 14px', cursor: 'pointer', touchAction: 'manipulation',
      }}
    >
      {t('toggle.switchTo')}
    </button>
  )
}
