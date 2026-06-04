import { ImageResponse } from 'next/og'

// Branded social share card shown when the app link is pasted into WhatsApp,
// LinkedIn, etc. Generated at build time (no asset file needed). 1200x630 is the
// standard Open Graph / Twitter "summary_large_image" size.
export const alt = 'StyleShift — Social Style mastery game for pharma sales reps'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Colors only — icons are drawn as CSS dots below so they render reliably
// regardless of the OG font's glyph coverage.
const STYLES = [
  { name: 'Driver', color: '#b06cff' },
  { name: 'Expressive', color: '#3ee08f' },
  { name: 'Amiable', color: '#ff7eb6' },
  { name: 'Analytical', color: '#38d6ff' },
]

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'radial-gradient(120% 90% at 50% 0%, #122046 0%, #0a1430 55%, #060c1f 100%)',
          color: '#dbe6ff', fontFamily: 'sans-serif', padding: 64,
        }}
      >
        <div style={{ fontSize: 26, letterSpacing: 14, textTransform: 'uppercase', color: '#38d6ff', display: 'flex' }}>
          Social Style Mastery Game
        </div>

        <div style={{ display: 'flex', alignItems: 'center', fontSize: 132, fontWeight: 800, marginTop: 18, letterSpacing: -2 }}>
          <span style={{ color: '#dbe6ff' }}>STYLE</span>
          <span style={{ color: '#38d6ff' }}>SHIFT</span>
        </div>

        <div style={{ fontSize: 40, color: '#8ea3d6', marginTop: 8, display: 'flex' }}>
          Read the room · Win the call
        </div>

        <div style={{ display: 'flex', gap: 20, marginTop: 56 }}>
          {STYLES.map(s => (
            <div
              key={s.name}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                border: `2px solid ${s.color}`, borderRadius: 18, padding: '16px 26px',
                background: 'rgba(0,0,0,0.25)',
              }}
            >
              <div style={{ width: 22, height: 22, borderRadius: 11, background: s.color, display: 'flex' }} />
              <span style={{ color: s.color, fontSize: 30, fontWeight: 700 }}>{s.name}</span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 26, color: '#8ea3d6', marginTop: 56, display: 'flex' }}>
          psychologytobusiness.com
        </div>
      </div>
    ),
    { ...size }
  )
}
