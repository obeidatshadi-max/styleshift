'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 420, margin: '0 auto', padding: '80px 20px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.3em', color: 'var(--cyan)', textTransform: 'uppercase', marginBottom: 16 }}>
        StyleShift
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, color: 'var(--ink)' }}>Something went wrong</h1>
      <p style={{ color: 'var(--ink-dim)', fontSize: 13.5, lineHeight: 1.5, marginBottom: 20 }}>
        This page hit an unexpected error. Trying again usually fixes it.
      </p>
      {error.digest && (
        <p style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-dim)', marginBottom: 20 }}>
          Reference: {error.digest}
        </p>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button
          onClick={() => unstable_retry()}
          style={{
            cursor: 'pointer', background: 'var(--cyan)', color: '#04121c', border: '1px solid var(--cyan)',
            borderRadius: 10, padding: '12px 20px', fontFamily: 'var(--mono)', fontSize: 12,
            letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 700,
          }}
        >
          Try again
        </button>
        <a
          href="/"
          style={{
            cursor: 'pointer', background: 'transparent', color: 'var(--cyan)', border: '1px solid var(--cyan)',
            borderRadius: 10, padding: '12px 20px', fontFamily: 'var(--mono)', fontSize: 12,
            letterSpacing: '.12em', textTransform: 'uppercase', textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
          }}
        >
          Go home
        </a>
      </div>
    </div>
  )
}
