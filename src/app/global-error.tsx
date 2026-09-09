'use client'

// Catches a failure in the root layout itself — the one place a normal
// error.tsx boundary can't reach. Must define its own <html>/<body> and
// stay dependency-light (no globals.css import, no app providers): its
// entire job is to still render if something upstream is broken.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <html lang="en">
      <body style={{
        margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#05060f', color: '#dbe6ff', fontFamily: '"Segoe UI",Tahoma,Verdana,sans-serif',
      }}>
        <div style={{ maxWidth: 420, padding: 24, textAlign: 'center' }}>
          <div style={{ fontFamily: '"SF Mono","Roboto Mono",Menlo,Consolas,monospace', fontSize: 11, letterSpacing: '.3em', textTransform: 'uppercase', color: '#38d6ff', marginBottom: 16 }}>
            StyleShift
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Something went wrong</h1>
          <p style={{ color: '#8ea3d6', fontSize: 13.5, lineHeight: 1.5, marginBottom: 20 }}>
            The app hit an unexpected error and couldn&apos;t load. Trying again usually fixes it.
          </p>
          {error.digest && (
            <p style={{ fontFamily: '"SF Mono",monospace', fontSize: 11, color: '#5d6fa3', marginBottom: 20 }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={() => unstable_retry()}
            style={{
              cursor: 'pointer', fontFamily: '"SF Mono",monospace', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase',
              border: '1px solid #38d6ff', color: '#04121c', background: '#38d6ff', borderRadius: 10, padding: '12px 22px', fontWeight: 700,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
