'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { DEFAULT_PROGRESS_ITEMS, REVIEW_SLUG, STATUS_LABEL, type ProgressItem, type ProgressStatus } from '@/lib/review-progress'
import styles from './progress.module.css'

type Props = { editable?: boolean; ownerId?: string }

export default function ProgressDashboard({ editable=false, ownerId }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<ProgressItem[]>(DEFAULT_PROGRESS_ITEMS)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    void supabase.from('review_progress').select('items,updated_at').eq('slug', REVIEW_SLUG).maybeSingle()
      .then(({data}) => {
        if (!active || !data) return
        if (Array.isArray(data.items)) setItems(data.items as ProgressItem[])
        setUpdatedAt(data.updated_at)
      })
    return () => { active = false }
  }, [supabase])

  const completed = items.filter(i => i.status === 'complete').length
  const active = items.filter(i => i.status === 'in_progress').length
  const blocked = items.filter(i => i.status === 'blocked').length
  const overall = Math.round(items.reduce((sum,i) => sum + i.progress, 0) / items.length)

  function update(id:string, patch:Partial<ProgressItem>) {
    setItems(current => current.map(item => item.id === id ? {...item, ...patch} : item))
  }

  async function save() {
    if (!editable || !ownerId) return
    setSaving(true); setMessage('')
    const payload = { slug:REVIEW_SLUG, owner_id:ownerId, title:'StyleShift Product Improvement Roadmap', summary:'Progress against the 7 September 2026 product and AI Partner review.', items, updated_at:new Date().toISOString() }
    const { error } = await supabase.from('review_progress').upsert(payload, { onConflict:'slug' })
    setSaving(false)
    if (error) { setMessage(error.message); return }
    setUpdatedAt(payload.updated_at); setMessage('Progress saved. The shared page will show it on refresh.')
  }

  return <main className={styles.page}>
    <header className={styles.hero}>
      <div>
        <p className={styles.eyebrow}>Product improvement tracker</p>
        <h1>STYLE<span>SHIFT</span> Progress</h1>
        <p className={styles.subtitle}>A live view of delivery against the product, UX, accessibility, and AI Partner review.</p>
      </div>
      <div className={styles.score}><strong>{overall}%</strong><span>overall progress</span></div>
    </header>

    <section className={styles.stats} aria-label="Roadmap summary">
      <article><span>Complete</span><strong>{completed}</strong></article>
      <article><span>In progress</span><strong>{active}</strong></article>
      <article><span>Blocked</span><strong>{blocked}</strong></article>
      <article><span>Total actions</span><strong>{items.length}</strong></article>
    </section>

    <div className={styles.overall}><div style={{width:overall + '%'}} /></div>

    <section className={styles.roadmap}>
      <div className={styles.sectionHead}>
        <div><p className={styles.eyebrow}>Priority roadmap</p><h2>From review to release</h2></div>
        <p>{updatedAt ? 'Updated ' + new Date(updatedAt).toLocaleString() : 'Waiting for the first saved update'}</p>
      </div>

      {items.map(item => <article className={styles.item} key={item.id}>
        <div className={styles.itemTop}>
          <span className={styles.priority} data-priority={item.priority}>{item.priority}</span>
          <span className={styles.area}>{item.area}</span>
          <span className={styles.status} data-status={item.status}>{STATUS_LABEL[item.status]}</span>
        </div>
        <h3>{item.action}</h3>
        <div className={styles.bar}><div style={{width:item.progress + '%'}} /></div>
        <div className={styles.meta}><span>{item.progress}% complete</span>{item.note && <span>{item.note}</span>}</div>
        {editable && <div className={styles.editor}>
          <label>Status<select value={item.status} onChange={e => update(item.id,{status:e.target.value as ProgressStatus,progress:e.target.value === 'complete' ? 100 : item.progress})}>
            {Object.entries(STATUS_LABEL).map(([value,label]) => <option value={value} key={value}>{label}</option>)}
          </select></label>
          <label>Progress<input type="range" min="0" max="100" step="5" value={item.progress} onChange={e => update(item.id,{progress:Number(e.target.value)})} /></label>
          <label className={styles.note}>Update note<input value={item.note} onChange={e => update(item.id,{note:e.target.value})} placeholder="What changed?" /></label>
        </div>}
      </article>)}
    </section>

    {editable && <div className={styles.savebar}>
      <div><strong>Private editor</strong><span>Only the owner account can save changes.</span></div>
      <button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save progress'}</button>
      <span role="status">{message}</span>
    </div>}
  </main>
}
