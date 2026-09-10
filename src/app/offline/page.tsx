'use client'

export default function OfflinePage() {
  return (
    <div style={{ position:'relative', zIndex:1, minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ maxWidth:420, textAlign:'center', background:'linear-gradient(180deg,var(--panel),#0a1430)', border:'1px solid var(--line)', borderRadius:16, padding:28, boxShadow:'0 12px 40px rgba(0,0,0,.45)' }}>
        <div style={{ fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.3em', textTransform:'uppercase', color:'var(--amber)', marginBottom:14 }}>Offline</div>
        <h1 style={{ fontSize:20, fontWeight:700, marginBottom:10 }}>No connection right now</h1>
        <p style={{ color:'var(--ink-dim)', fontSize:14, lineHeight:1.6, marginBottom:20 }}>
          You can still fill in a visit note or practice from cached content — it&apos;ll sync automatically once you&apos;re back online.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{ cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.12em', textTransform:'uppercase', border:'1px solid var(--cyan)', color:'#04121c', background:'var(--cyan)', borderRadius:10, padding:'12px 20px', boxShadow:'var(--glow-cyan)' }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}
