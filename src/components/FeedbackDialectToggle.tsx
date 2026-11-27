'use client'
import { useEffect, useState } from 'react'
import { useLang, useT } from '@/lib/i18n'
import { FEEDBACK_DIALECT_COOKIE, parseFeedbackDialect, type FeedbackDialect } from '@/lib/feedback-dialect'

function readCookie(): FeedbackDialect {
  const match = document.cookie.split('; ').find(c => c.startsWith(`${FEEDBACK_DIALECT_COOKIE}=`))
  return parseFeedbackDialect(match?.split('=')[1])
}

/** Arabic-only switch: coaching feedback in standard Arabic or Iraqi dialect. Hidden in English. */
export default function FeedbackDialectToggle() {
  const { lang } = useLang()
  const t = useT()
  const [dialect, setDialect] = useState<FeedbackDialect>('msa')

  useEffect(() => { setDialect(readCookie()) }, [])

  if (lang !== 'ar') return null

  function flip() {
    const next: FeedbackDialect = dialect === 'iraqi' ? 'msa' : 'iraqi'
    document.cookie = `${FEEDBACK_DIALECT_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    setDialect(next)
  }

  return (
    <button
      type="button"
      onClick={flip}
      aria-pressed={dialect === 'iraqi'}
      title={t('feedbackDialect.hint')}
      style={{
        fontSize: 14, color: 'var(--cyan)', background: 'var(--accent-soft)', border: '1px solid var(--cyan)',
        borderRadius: 20, padding: '6px 14px', cursor: 'pointer', touchAction: 'manipulation',
      }}
    >
      {t(dialect === 'iraqi' ? 'feedbackDialect.iraqi' : 'feedbackDialect.msa')}
    </button>
  )
}
