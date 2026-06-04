'use client'
import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'

interface Props {
  name: string
  avatarUrl: string | null
  xp: number
  rankTitle: string
  companyName: string
  period: string // e.g. "June 2026"
}

// A polished, shareable "top performer" card. Rendered to a fixed-size node so it
// exports cleanly as a PNG (for WhatsApp/email/print). Falls back to a gold
// monogram when the rep hasn't uploaded a photo.
export default function RecognitionCard({ name, avatarUrl, xp, rankTitle, companyName, period }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const initial = (name?.trim()?.[0] || '★').toUpperCase()

  async function download() {
    if (!cardRef.current) return
    setBusy(true)
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `styleshift-champion-${name.replace(/\s+/g, '-').toLowerCase()}.png`
      a.click()
    } catch {
      // Image export can fail if the photo blocks cross-origin reads — offer print as fallback.
      window.print()
    } finally {
      setBusy(false)
    }
  }

  const gold = '#e8c060'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      <div ref={cardRef} style={{
        width: 460, boxSizing: 'border-box', padding: '40px 36px 30px',
        background: 'radial-gradient(120% 80% at 50% 0%, #122046 0%, #0a1430 55%, #060c1f 100%)',
        border: `1px solid ${gold}55`, borderRadius: 20, textAlign: 'center',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', color: '#eaf0ff',
        boxShadow: '0 20px 60px rgba(0,0,0,.5)',
      }}>
        <div style={{ fontSize: 12, letterSpacing: '.32em', textTransform: 'uppercase', color: gold, fontWeight: 700 }}>{companyName}</div>
        <div style={{ fontSize: 11, letterSpacing: '.3em', textTransform: 'uppercase', color: '#8ea0c4', marginTop: 6 }}>StyleShift Champion</div>

        <div style={{ margin: '26px auto 18px', width: 150, height: 150, borderRadius: '50%', overflow: 'hidden', border: `3px solid ${gold}`, boxShadow: `0 0 28px ${gold}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a1430' }}>
          {avatarUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={avatarUrl} alt={name} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 64, fontWeight: 800, color: gold }}>{initial}</span>}
        </div>

        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '.01em', lineHeight: 1.1 }}>{name}</div>
        <div style={{ display: 'inline-block', marginTop: 12, padding: '7px 18px', borderRadius: 30, background: `${gold}1a`, border: `1px solid ${gold}`, color: gold, fontSize: 14, fontWeight: 700, letterSpacing: '.05em' }}>
          🏆 #1 This Cycle
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 28, marginTop: 24 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{xp.toLocaleString()}</div>
            <div style={{ fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8ea0c4', marginTop: 2 }}>Total XP</div>
          </div>
          <div style={{ width: 1, background: '#2a3a60' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginTop: 4 }}>{rankTitle}</div>
            <div style={{ fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8ea0c4', marginTop: 4 }}>Rank</div>
          </div>
        </div>

        <div style={{ marginTop: 26, paddingTop: 16, borderTop: '1px solid #1d2a4d', fontSize: 11, letterSpacing: '.06em', color: '#8ea0c4' }}>
          {period} · StyleShift · Social Style Mastery
        </div>
      </div>

      <button onClick={download} disabled={busy} className="no-print"
        style={{ cursor: busy ? 'default' : 'pointer', background: gold, color: '#1a1402', border: 'none', borderRadius: 10, padding: '12px 22px', fontSize: 14, fontWeight: 700, letterSpacing: '.04em', opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Preparing…' : '⬇ Download card (PNG)'}
      </button>
    </div>
  )
}
