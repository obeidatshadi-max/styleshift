'use client'

import { useEffect, useState } from 'react'
import { useLang } from '@/lib/i18n'

const KEY = 'styleshift_theme'

export default function ThemeToggle() {
  const { lang } = useLang()
  const [dark, setDark] = useState(false)
  useEffect(() => {
    // The bootstrap in layout sets the saved theme before the first paint.
    setDark(document.documentElement.dataset.theme === 'dark')
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.dataset.theme = next ? 'dark' : 'light'
    try { localStorage.setItem(KEY, next ? 'dark' : 'light') } catch { /* usable without storage */ }
  }

  const label = lang === 'ar'
    ? (dark ? 'استخدام المظهر الفاتح' : 'استخدام المظهر الداكن')
    : (dark ? 'Use light appearance' : 'Use dark appearance')
  return <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label} aria-pressed={dark}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      {dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></>
        : <path d="M20.5 14A8.8 8.8 0 0 1 10 3.5 8.8 8.8 0 1 0 20.5 14Z" />}
    </svg>
  </button>
}
