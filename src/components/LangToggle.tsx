'use client'
import { preloadArabic, useLang, useT } from '@/lib/i18n'

/** Small EN/AR language switch. Label shows the language you switch TO. */
export default function LangToggle() {
  const { lang, toggle } = useLang()
  // Start fetching the Arabic text as soon as the rep reaches for the switch.
  const prefetch = () => { if (lang === 'en') void preloadArabic().catch(() => {}) }
  const t = useT()
  return (
    <button
      onClick={toggle}
      onPointerEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
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
