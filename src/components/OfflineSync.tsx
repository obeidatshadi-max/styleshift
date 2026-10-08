'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { flushPendingWrites, listPendingWrites } from '@/lib/offline-queue'

/**
 * Registers the offline app shell (public/sw.js) and flushes any writes
 * queued while the rep had no signal — on load and whenever the browser
 * reports the connection is back. Renders a small status pill only when
 * there's something to say (offline, or actively syncing).
 */
export default function OfflineSync() {
  const [retry, setRetry] = useState(0)
  const [status, setStatus] = useState<'online' | 'offline' | 'syncing' | 'synced' | 'failed'>('online')

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    const supabase = createClient()

    async function sync() {
      const pendingBefore = await listPendingWrites().catch(() => [])
      if (pendingBefore.length === 0) return
      setStatus('syncing')
      const { flushed, failed } = await flushPendingWrites(supabase).catch(() => ({ flushed: 0, failed: 1 }))
      if (flushed) window.dispatchEvent(new Event('styleshift:offline-synced'))
      if (failed) { setStatus('failed'); return }
      if (flushed > 0) {
        setStatus('synced')
        setTimeout(() => setStatus(navigator.onLine ? 'online' : 'offline'), 3000)
      } else {
        setStatus(navigator.onLine ? 'online' : 'offline')
      }
    }

    function goOnline() { setStatus('online'); void sync() }
    function goOffline() { setStatus('offline') }

    setStatus(navigator.onLine ? 'online' : 'offline')
    void sync()
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [retry])

  if (status === 'online') return null

  const label = status === 'failed' ? 'Some visits could not sync. They are kept on this device for retry.' : status === 'offline' ? 'Offline — changes will save and sync later'
    : status === 'syncing' ? 'Syncing offline changes…' : 'Synced ✓'
  const color = status === 'failed' ? 'var(--red)' : status === 'offline' ? 'var(--amber)' : status === 'syncing' ? 'var(--cyan)' : 'var(--green)'

  return (
    <div style={{
      position: 'fixed', insetInlineStart: 0, insetInlineEnd: 0, top: 0, zIndex: 50,
      display: 'flex', justifyContent: 'center', pointerEvents: 'none',
    }}>
      <div style={{
        marginTop: 8, fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.05em',
        color, border: `1px solid ${color}`, background: 'rgba(5,6,15,.9)', borderRadius: 20,
        padding: '6px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.4)',
      }}>
        {label}
        {status === 'failed' && <button type="button" style={{ pointerEvents: 'auto', marginInlineStart: 8 }} onClick={() => setRetry(n => n + 1)}>Retry sync</button>}
      </div>
    </div>
  )
}
