'use client'
import { useEffect, useState } from 'react'
import { useLang } from '@/lib/i18n'

interface Cert { id: string; program: string; verifyCode: string; issuedAt: string; revoked: boolean }

const COPY = {
  en: { title: 'My certificates', valid: 'Valid', withdrawn: 'Withdrawn', open: 'Open certificate' },
  ar: { title: 'شهاداتي', valid: 'سارية', withdrawn: 'ملغاة', open: 'افتح الشهادة' },
} as const

/** The rep's own certificates. Stays out of the way (renders nothing) until there is one, or when certification is switched off. */
export default function MyCertificates() {
  const { lang } = useLang()
  const c = COPY[lang === 'ar' ? 'ar' : 'en']
  const [certs, setCerts] = useState<Cert[]>([])
  useEffect(() => {
    let alive = true
    fetch('/api/certifications/mine').then(r => (r.ok ? r.json() : null)).then(d => { if (alive && Array.isArray(d?.certificates)) setCerts(d.certificates) }).catch(() => {})
    return () => { alive = false }
  }, [])
  if (certs.length === 0) return null
  return (
    <div data-testid="my-certificates" style={{ border: '1px solid var(--green)', borderRadius: 14, padding: '14px 16px', background: 'rgba(60,200,120,.06)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--green)', marginBottom: 10 }}>{c.title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {certs.map(cert => (
          <div key={cert.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 16 }} dir="auto">{cert.program} · <span style={{ color: 'var(--ink-dim)', fontSize: 14 }}>{new Date(cert.issuedAt).toLocaleDateString(lang === 'ar' ? 'ar-IQ' : 'en-GB')}</span></span>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: cert.revoked ? 'var(--red)' : 'var(--green)' }}>{cert.revoked ? c.withdrawn : c.valid}</span>
              <a href={`/verify/${cert.verifyCode}`} style={{ color: 'var(--cyan)', fontSize: 14 }}>{c.open}</a>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
