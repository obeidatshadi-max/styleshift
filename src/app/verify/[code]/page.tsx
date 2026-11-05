import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'
import { certificationEnabled, isVerifyCode } from '@/lib/certification'
import { lookupByCode } from '@/lib/certification-service'
import PrintButton from '@/components/dashboard/PrintButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Certificate check', robots: { index: false, follow: false } }

/** Public: anyone holding the code can confirm a certificate is real and still valid. Shows who, what, which company and when. Never the evidence. */
export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!certificationEnabled() || !isVerifyCode(code)) notFound()
  const cert = await lookupByCode(createAdminClient(), code)
  if (!cert) notFound()
  const valid = !cert.revokedAt
  const date = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <main style={{ maxWidth: 640, margin: '40px auto', padding: 24, textAlign: 'center', border: '2px solid var(--line)', borderRadius: 16, background: 'var(--panel)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: 'var(--cyan)' }}>StyleShift certificate</div>
      <h1 style={{ fontSize: 28, margin: '18px 0 6px' }}>{cert.program}</h1>
      <p style={{ fontSize: 16, color: 'var(--ink-dim)' }}>awarded to</p>
      <p style={{ fontSize: 30, fontWeight: 800, margin: '4px 0 12px' }} dir="auto">{cert.repName}</p>
      <p style={{ fontSize: 16 }} dir="auto">{cert.companyName} · {date(cert.issuedAt)}</p>
      <p role="status" style={{ marginTop: 20, fontSize: 18, fontWeight: 700, color: valid ? 'var(--green)' : 'var(--red)' }}>
        {valid ? 'Valid' : `Withdrawn on ${date(cert.revokedAt!)}`}
      </p>
      <p style={{ marginTop: 12, fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--ink-dim)' }}>Code {code}</p>
      <div style={{ marginTop: 18 }}><PrintButton label="Print or save as PDF" /></div>
      <style>{'@media print { .no-print { display: none !important } }'}</style>
    </main>
  )
}
