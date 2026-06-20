'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'
import RecognitionCard from '@/components/dashboard/RecognitionCard'
import type { Champions } from '@/lib/champions'

interface Props {
  companyName: string
  period: string // e.g. "June 2026", passed through to the card footer
}

export default function ChampionBanner({ companyName, period }: Props) {
  const t = useT()
  const [data, setData] = useState<Champions | null>(null)
  const [open, setOpen] = useState(false)
  const gold = '#e8c060'

  useEffect(() => {
    let alive = true
    fetch('/api/champions')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive) setData(d) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const weekly = data?.weekly ?? null
  const daily = data?.daily ?? null
  const initial = (weekly?.name?.trim()?.[0] || '★').toUpperCase()

  // Share the rendered card PNG via Web Share API; fall back to a wa.me text link.
  async function share() {
    const node = document.getElementById('recognition-card')
    const caption = `${weekly?.name} — ${t('champion.weekly')} · ${companyName}`
    try {
      if (node) {
        const { toPng } = await import('html-to-image')
        const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true })
        const blob = await (await fetch(dataUrl)).blob()
        const file = new File([blob], 'styleshift-champion.png', { type: 'image/png' })
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text: caption })
          return
        }
      }
    } catch { /* fall through to text share */ }
    window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, '_blank')
  }

  if (!weekly) {
    // Aspirational empty slot, only once data has loaded (avoid flash on load).
    if (!data) return null
    return (
      <div style={{ border: `1px solid ${gold}44`, borderRadius: 14, padding: '14px 18px', textAlign: 'center', color: 'var(--ink-dim)', fontSize: 13 }}>
        🏆 {t('champion.empty')}
      </div>
    )
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'start', cursor: 'pointer',
          background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: `1px solid ${gold}66`, borderRadius: 16, padding: '14px 18px', color: 'var(--ink)' }}>
        <span style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${gold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a1430', flex: '0 0 auto' }}>
          {weekly.avatarUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={weekly.avatarUrl} alt={weekly.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ color: gold, fontWeight: 800, fontSize: 22 }}>{initial}</span>}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: gold, fontWeight: 700 }}>🏆 {t('champion.weekly')}</span>
          <span style={{ display: 'block', fontSize: 17, fontWeight: 800 }}>{weekly.name}</span>
          {daily && <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-dim)', marginTop: 2 }}>{t('champion.today', { name: daily.name })}</span>}
        </span>
        <span style={{ fontSize: 18, fontWeight: 800, color: gold }}>{weekly.periodXp.toLocaleString()}</span>
      </button>

      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,18,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}>
            <RecognitionCard
              name={weekly.name}
              avatarUrl={weekly.avatarUrl}
              xp={weekly.periodXp}
              rankTitle={t('champion.weekly')}
              companyName={companyName}
              period={`${t('champion.thisWeek')} · ${period}`}
              onShare={share}
              shareLabel={t('champion.share')}
            />
          </div>
        </div>
      )}
    </>
  )
}
