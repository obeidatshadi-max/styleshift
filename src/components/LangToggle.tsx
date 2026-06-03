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
        fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase',
        color: 'var(--cyan)', background: 'rgba(56,214,255,.08)', border: '1px solid var(--cyan)',
        borderRadius: 20, padding: '6px 14px', cursor: 'pointer', touchAction: 'manipulation',
      }}
    >
      🌐 {t('toggle.switchTo')}
    </button>
  )
}
