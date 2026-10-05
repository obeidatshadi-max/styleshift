'use client'
import { useCallback, useEffect, useState } from 'react'
import { useLang } from '@/lib/i18n'

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

export type PushState = 'unsupported' | 'needs-install' | 'off' | 'on' | 'denied' | 'busy' | 'error'

// VAPID public key (base64url) to the bytes the push API wants.
function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isInstalled = () => (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches

/** Opt in or out of the daily debrief reminder on this device. */
export function usePushReminders() {
  const { lang } = useLang()
  const [state, setState] = useState<PushState>('unsupported')

  useEffect(() => {
    if (!VAPID_PUBLIC) return
    if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) {
      // iPhone Safari only exposes push to a site added to the Home Screen.
      setState(isIos() && !isInstalled() ? 'needs-install' : 'unsupported')
      return
    }
    if (Notification.permission === 'denied') { setState('denied'); return }
    let live = true
    navigator.serviceWorker.getRegistration().then(reg => reg?.pushManager.getSubscription()).then(sub => { if (live) setState(sub ? 'on' : 'off') }).catch(() => { if (live) setState('off') })
    return () => { live = false }
  }, [])

  const enable = useCallback(async () => {
    if (!VAPID_PUBLIC) return
    setState('busy')
    try {
      if ((await Notification.requestPermission()) !== 'granted') { setState(Notification.permission === 'denied' ? 'denied' : 'off'); return }
      const reg = await navigator.serviceWorker.ready
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC) })
      const json = sub.toJSON()
      const res = await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lang }),
      })
      if (!res.ok) { await sub.unsubscribe().catch(() => {}); throw new Error() }
      setState('on')
    } catch { setState('error') }
  }, [lang])

  const disable = useCallback(async () => {
    setState('busy')
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE' })
        await sub.unsubscribe()
      }
      setState('off')
    } catch { setState('error') }
  }, [])

  return { state, enable, disable }
}
