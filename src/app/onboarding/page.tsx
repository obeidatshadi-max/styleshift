'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [regenerated, setRegenerated] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName: name }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setLoading(false); return }
    const origin = window.location.origin
    setInviteLink(`${origin}/invite/${data.company.invite_code}`)
    setLoading(false)
  }

  function copyLink() {
    if (!inviteLink) return
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function regenerateLink() {
    setRegenerating(true)
    const res = await fetch('/api/onboarding/regenerate-invite', { method: 'POST' }).catch(() => null)
    setRegenerating(false)
    if (!res?.ok) return
    const data = await res.json()
    setInviteLink(`${window.location.origin}/invite/${data.company.invite_code}`)
    setRegenerated(true)
    setTimeout(() => setRegenerated(false), 2000)
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,.3)', border: '1px solid var(--line)', borderRadius: 10,
    padding: '12px 14px', color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: 14,
    outline: 'none', width: '100%',
  }
  const btnPrimary: React.CSSProperties = {
    background: 'var(--cyan)', color: '#04121c', border: '1px solid var(--cyan)',
    borderRadius: 10, padding: '12px 18px', fontFamily: 'var(--mono)', fontSize: 12,
    letterSpacing: '.15em', textTransform: 'uppercase', cursor: 'pointer',
    boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation', width: '100%',
  }
  const btnGhost: React.CSSProperties = {
    background: 'transparent', color: 'var(--cyan)', border: '1px solid var(--cyan)',
    borderRadius: 10, padding: '12px 18px', fontFamily: 'var(--mono)', fontSize: 12,
    letterSpacing: '.15em', textTransform: 'uppercase', cursor: 'pointer',
    touchAction: 'manipulation', flex: 1,
  }

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 480, margin: '0 auto', padding: '80px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.45em', color: 'var(--cyan)', textTransform: 'uppercase', marginBottom: 12 }}>Company Setup</div>
        <h1 style={{ fontSize: 'clamp(24px,5vw,36px)', fontWeight: 800 }}>
          STYLE<span style={{ color: 'var(--cyan)' }}>SHIFT</span>
        </h1>
        <p style={{ color: 'var(--ink-dim)', fontSize: 13, marginTop: 8 }}>Create your team to get started</p>
      </div>

      <div style={{ background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 24, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
        {!inviteLink ? (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label htmlFor="company-name" style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-dim)' }}>Company / Team Name</label>
            <input
              id="company-name"
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Wafi Group Iraq" required
              style={inputStyle}
            />
            {error && <p style={{ color: 'var(--red)', fontSize: 13, fontFamily: 'var(--mono)' }}>{error}</p>}
            <button type="submit" disabled={loading} style={btnPrimary}>
              {loading ? '...' : 'Create Team →'}
            </button>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.1em' }}>✓ Team created!</div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-dim)' }}>Rep Invite Link</span>
                <button onClick={regenerateLink} disabled={regenerating}
                  style={{ background: 'none', border: 'none', color: 'var(--ink-dim)', fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.05em', textTransform: 'uppercase', cursor: regenerating ? 'default' : 'pointer', textDecoration: 'underline' }}>
                  {regenerating ? '…' : regenerated ? '✓ New link' : 'Regenerate'}
                </button>
              </div>
              <div style={{ background: 'rgba(0,0,0,.3)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--cyan)', wordBreak: 'break-all', lineHeight: 1.5 }}>{inviteLink}</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={copyLink} style={{ ...btnPrimary, flex: 1, width: 'auto' }}>
                {copied ? '✓ Copied!' : 'Copy Link'}
              </button>
              <button onClick={() => router.push('/dashboard')} style={btnGhost}>
                Dashboard →
              </button>
            </div>
            <p style={{ color: 'var(--ink-dim)', fontSize: 12, lineHeight: 1.5 }}>Share this link with your reps. They&apos;ll create an account and be automatically added to your team. If you ever lose this link, come back to this page and it will show you the same team&apos;s invite again — it won&apos;t create a second team.</p>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 6 }}>Your Plan</div>
              <p style={{ color: 'var(--ink-dim)', fontSize: 12.5, lineHeight: 1.5 }}>Free plan — up to <b style={{ color: 'var(--ink)' }}>10 reps</b>. Need more seats? Contact us to upgrade.</p>
            </div>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 10 }}>Once reps join, your dashboard looks like this</div>
              <div style={{ opacity: .75, pointerEvents: 'none' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 8 }}>
                  {[{ l: 'Total Reps', v: '8' }, { l: 'Avg Accuracy', v: '76%' }, { l: 'Need Coaching', v: '2' }].map(k => (
                    <div key={k.l} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 8.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-dim)' }}>{k.l}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: 'var(--cyan)' }}>{k.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '9px 11px', fontSize: 11.5, color: 'var(--ink-dim)' }}>Coaching Queue, Skill Gap Heatmap, Voice Practice, and more — filled in as your team plays.</div>
              </div>
              <p style={{ color: 'var(--ink-dim)', fontSize: 11, marginTop: 8, fontStyle: 'italic' }}>Example numbers — your real dashboard starts empty until reps join and play.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
