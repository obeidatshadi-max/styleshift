'use client'
import { useState } from 'react'
import { useLang } from '@/lib/i18n'

interface Segment { segmentIndex: number; speakerRole: 'rep' | 'counterpart'; text: string }
interface Loaded { transcriptVersion: number; canProposePhrases: boolean; segments: Segment[] }

const COPY = {
  en: {
    open: 'Check the transcript', hint: 'The speech engine can mishear Iraqi words or mix up who spoke. Fix a line, or tap the speaker label to switch it. Your corrections change the analysis and help us teach the app Iraqi phrases.',
    loading: 'Loading the transcript…', failed: 'Could not load the transcript.', rep: 'You', other: 'Other person',
    share: 'Share the corrected words with the Iraqi phrase reviewers (only the changed words, never the whole line or any names)',
    save: 'Save corrections', saving: 'Saving…', saved: (v: number) => `Saved as version ${v}. Create the analysis again to use it.`,
    shared: (n: number) => ` ${n} phrase(s) sent for review.`, saveFailed: 'Could not save. Try again.', nothing: 'Nothing changed yet.', hide: 'Close',
    switchSpeaker: 'Switch speaker',
  },
  ar: {
    open: 'راجع نص المحادثة', hint: 'قد يخطئ البرنامج في سماع الكلمات العراقية أو في تحديد من تكلّم. صحّح السطر، أو اضغط على اسم المتحدث لتبديله. تصحيحاتك تغيّر التحليل وتساعدنا على تعليم التطبيق العبارات العراقية.',
    loading: 'جاري تحميل النص…', failed: 'تعذّر تحميل النص.', rep: 'أنت', other: 'الطرف الآخر',
    share: 'شارك الكلمات المصحّحة مع مراجعي العبارات العراقية (الكلمات المتغيّرة فقط، دون السطر كاملاً أو أي أسماء)',
    save: 'احفظ التصحيحات', saving: 'جاري الحفظ…', saved: (v: number) => `تم الحفظ كنسخة ${v}. أعد إنشاء التحليل لاستخدامها.`,
    shared: (n: number) => ` أُرسلت ${n} عبارة للمراجعة.`, saveFailed: 'تعذّر الحفظ. حاول مرة أخرى.', nothing: 'لم يتغيّر شيء بعد.', hide: 'إغلاق',
    switchSpeaker: 'بدّل المتحدث',
  },
} as const

/** Lets the rep fix a saved recording's transcript: the words, and who said each line. A save never
 * edits old rows. It writes a new transcript version, and the analysis is created again from it. */
export default function TranscriptCorrection({ sessionId, onSaved }: { sessionId: string; onSaved: (version: number) => void }) {
  const { lang } = useLang()
  const c = COPY[lang === 'ar' ? 'ar' : 'en']
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [draft, setDraft] = useState<Segment[]>([])
  const [share, setShare] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setState('loading'); setMessage('')
    try {
      const res = await fetch(`/api/transcript-segments?sessionType=human_partner&sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
      if (!res.ok) { setState('failed'); return }
      const data = await res.json() as Loaded
      setLoaded(data); setDraft(data.segments); setState('ready')
    } catch { setState('failed') }
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && state === 'idle') void load()
  }

  const changes = (() => {
    if (!loaded) return { swaps: [] as number[], edits: [] as { segmentIndex: number; text: string }[] }
    const swaps: number[] = []
    const edits: { segmentIndex: number; text: string }[] = []
    for (const d of draft) {
      const o = loaded.segments.find(s => s.segmentIndex === d.segmentIndex)
      if (!o) continue
      if (o.speakerRole !== d.speakerRole) swaps.push(d.segmentIndex)
      if (d.text.trim() && d.text.trim() !== o.text) edits.push({ segmentIndex: d.segmentIndex, text: d.text.trim() })
    }
    return { swaps, edits }
  })()
  const dirty = changes.swaps.length + changes.edits.length > 0
  const emptyLine = draft.some(d => !d.text.trim())

  async function save() {
    if (!loaded || !dirty || emptyLine) { setMessage(c.nothing); return }
    setBusy(true); setMessage('')
    try {
      const res = await fetch('/api/transcript-segments/correct', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionType: 'human_partner', sessionId, swapSegmentIndexes: changes.swaps, edits: changes.edits, proposePhrases: loaded.canProposePhrases && share }),
      })
      if (!res.ok) { setMessage(c.saveFailed); return }
      const data = await res.json() as { newTranscriptVersion: number; proposalsSent?: number }
      const next = draft.map(d => ({ ...d, text: d.text.trim() }))
      setLoaded({ ...loaded, transcriptVersion: data.newTranscriptVersion, segments: next }); setDraft(next)
      setMessage(c.saved(data.newTranscriptVersion) + (data.proposalsSent ? c.shared(data.proposalsSent) : ''))
      onSaved(data.newTranscriptVersion)
    } catch { setMessage(c.saveFailed) } finally { setBusy(false) }
  }

  return <section aria-label={c.open} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
    <button type="button" onClick={toggle} aria-expanded={open}
      style={{ cursor: 'pointer', padding: '12px 16px', borderRadius: 10, background: 'transparent', color: 'var(--cyan)', border: '1px solid var(--cyan)', width: '100%', fontSize: 16 }}>
      {open ? c.hide : c.open}
    </button>
    {open && <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 16, lineHeight: 1.7, margin: '0 0 12px' }}>{c.hint}</p>
      {state === 'loading' && <p role="status">{c.loading}</p>}
      {state === 'failed' && <p role="alert">{c.failed}</p>}
      {state === 'ready' && <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {draft.map(seg => <div key={seg.segmentIndex} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
            <button type="button" aria-label={`${c.switchSpeaker}: ${seg.speakerRole === 'rep' ? c.rep : c.other}`}
              onClick={() => setDraft(d => d.map(x => x.segmentIndex === seg.segmentIndex ? { ...x, speakerRole: x.speakerRole === 'rep' ? 'counterpart' : 'rep' } : x))}
              style={{ cursor: 'pointer', fontSize: 14, padding: '6px 12px', borderRadius: 999, marginBottom: 8,
                border: `1px solid ${seg.speakerRole === 'rep' ? 'var(--cyan)' : 'var(--purple)'}`, background: 'transparent',
                color: seg.speakerRole === 'rep' ? 'var(--cyan)' : 'var(--purple)' }}>
              {seg.speakerRole === 'rep' ? c.rep : c.other} ⇄
            </button>
            <textarea dir="auto" value={seg.text} maxLength={2000} rows={2}
              aria-label={`#${seg.segmentIndex + 1}`}
              onChange={e => setDraft(d => d.map(x => x.segmentIndex === seg.segmentIndex ? { ...x, text: e.target.value } : x))}
              style={{ display: 'block', width: '100%', padding: 10, fontSize: 16, lineHeight: 1.6, background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8 }} />
          </div>)}
        </div>
        {loaded?.canProposePhrases && <label style={{ display: 'block', margin: '12px 0', fontSize: 15, lineHeight: 1.6 }}>
          <input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} /> {c.share}
        </label>}
        <button type="button" disabled={busy || !dirty || emptyLine} onClick={() => void save()}
          style={{ cursor: 'pointer', padding: '12px 16px', borderRadius: 10, background: 'var(--cyan)', color: 'var(--on-accent)', border: '1px solid var(--cyan)', width: '100%', marginTop: 8 }}>
          {busy ? c.saving : c.save}
        </button>
      </>}
      <p role="status" style={{ fontSize: 15, lineHeight: 1.6, marginTop: 8 }}>{message}</p>
    </div>}
  </section>
}
