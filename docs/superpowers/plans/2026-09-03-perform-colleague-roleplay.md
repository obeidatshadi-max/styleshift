# Perform Pillar: Colleague Roster + Roleplay History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Perform tab real content — a roster of named practice colleagues, each with an accumulating history of live roleplay sessions and their coaching scores, so a rep can see whether their numbers improve session over session with the same partner.

**Architecture:** Mirror the existing `doctors`/`VisitPrep` CRUD pattern with a deliberately minimal `colleagues` table (name only — no style/objection profile). Reuse the existing roleplay-recording pipeline (`RoleplayRecorder`/`useRoleplayRecorder`) unchanged except for a new pass-through `colleagueId` tag, exactly like the existing `doctorId` tag. A new read hook exposes the session history that already sits in `roleplay_sessions` (write-only until now — nothing in the app has ever read that table back).

**Tech Stack:** TypeScript, React, Supabase (Postgres + RLS), Next.js — same stack as the existing doctors/roleplay features. No new libraries.

**Spec:** `docs/superpowers/specs/2026-09-03-perform-colleague-roleplay-design.md`

## Global Constraints

- Bilingual EN/AR throughout, existing flat-key `t()` dictionary pattern in `src/lib/i18n.tsx` — every new user-facing string needs both an EN and an AR entry.
- Inline-style convention only (CSS custom properties like `var(--cyan)`, `var(--panel)`, `var(--line)`) — no Tailwind, no new CSS files.
- RLS changes are additive only — never weaken an existing policy.
- Supabase project id for `apply_migration`: `cnlloaihrrmattuidpeh`.
- This is CRUD + a filtered read, not scoring logic — no new Vitest file (matches the existing convention: `useDoctors.ts`/`useDoctorVisits.ts` have no test file; only `*-core.ts` pure functions do). Verification is `tsc --noEmit` plus a manual browser click-through.
- Never persist the practice partner's spoken words or the roleplay audio — unchanged from the existing pipeline; this plan touches no scoring/audio code.

---

## Task 1: Database migration — `colleagues` table + `roleplay_sessions.colleague_id`

**Files:**
- Create: `supabase/migrations/013_colleagues.sql`

**Interfaces:**
- Consumes: existing `profiles` table (FK target), existing `roleplay_sessions` table (migration 009) and its insert RLS policy (migration 010, which this task replaces with a colleague-aware version).
- Produces: `colleagues` table and `roleplay_sessions.colleague_id` column, consumed by Task 3 (`useColleagues`), Task 4 (`useColleagueSessions`), and Task 5 (the insert).

- [ ] **Step 1: Write the migration**

```sql
-- A rep's private roster of practice colleagues — deliberately minimal
-- (name only), unlike `doctors` which carries a full prep profile. A
-- colleague is a practice partner's identity, not a prep target.
create table public.colleagues (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.colleagues enable row level security;
create policy "own colleagues read" on public.colleagues for select using (rep_id = auth.uid());
create policy "own colleagues insert" on public.colleagues for insert with check (rep_id = auth.uid());
create policy "own colleagues delete" on public.colleagues for delete using (rep_id = auth.uid());

-- Roleplay sessions can now optionally be scoped to a named colleague,
-- independent of (and alongside) the existing optional doctor scope.
alter table public.roleplay_sessions
  add column colleague_id uuid references public.colleagues(id) on delete set null;

drop policy "own roleplay sessions insert" on public.roleplay_sessions;
create policy "own roleplay sessions insert" on public.roleplay_sessions for insert with check (
  rep_id = auth.uid()
  and (doctor_id is null or doctor_id in (select id from public.doctors where rep_id = auth.uid()))
  and (colleague_id is null or colleague_id in (select id from public.colleagues where rep_id = auth.uid()))
);
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP tool: `apply_migration` with `project_id: "cnlloaihrrmattuidpeh"`, `name: "colleagues"`, and the SQL above as `query`. Confirm the result reports `success: true`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/013_colleagues.sql
git commit -m "feat: add colleagues table and roleplay_sessions.colleague_id"
```

---

## Task 2: Types

**Files:**
- Modify: `src/types/game.ts`

**Interfaces:**
- Consumes: nothing new — `StyleKey` is already defined/imported in this file (used by `Doctor.style`).
- Produces: `Colleague`, `ColleagueInput`, `RoleplaySessionSummary` — consumed by Task 3, 4, 6, 7.

- [ ] **Step 1: Add the types**

In `src/types/game.ts`, immediately after the `DoctorVisitInput` type (after the `Doctor`/`DoctorVisit` block), add:

```typescript
// A named practice colleague — deliberately minimal (see `colleagues`
// migration comment): a practice partner's identity, not a prep target.
export interface Colleague {
  id: string
  rep_id: string
  name: string
  created_at: string
}

export type ColleagueInput = Pick<Colleague, 'name'>

// A row from a colleague's (or doctor's) roleplay session history —
// scores only, matching the privacy shape of `roleplay_sessions` itself:
// never the transcript, never the audio.
export interface RoleplaySessionSummary {
  id: string
  created_at: string
  duration_sec: number
  talk_ratio: number
  question_ratio: number
  open_question_ratio: number | null
  paraphrase_score: number | null
  active_listening_score: number | null
  rep_style: StyleKey | null
  rep_confidence: number | null
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS (new types aren't consumed yet, but must be syntactically valid).

- [ ] **Step 3: Commit**

```bash
git add src/types/game.ts
git commit -m "feat: add Colleague and RoleplaySessionSummary types"
```

---

## Task 3: `useColleagues` hook

**Files:**
- Create: `src/hooks/useColleagues.ts`

**Interfaces:**
- Consumes: `Colleague`, `ColleagueInput` (Task 2); `colleagues` table (Task 1).
- Produces: `useColleagues(): { colleagues: Colleague[], loading: boolean, saveColleague: (input: ColleagueInput) => Promise<Colleague | null>, removeColleague: (id: string) => Promise<void>, reload: () => Promise<void> }` — consumed by Task 7 (`Colleagues.tsx`).

- [ ] **Step 1: Write the hook**

```typescript
'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import type { Colleague, ColleagueInput } from '@/types/game'

/** A rep's private practice-colleague roster (CRUD via RLS-protected table). */
export function useColleagues() {
  const supabase = createClient()
  const [colleagues, setColleagues] = useState<Colleague[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('colleagues')
      .select('*')
      .eq('rep_id', user.id)
      .order('created_at', { ascending: false })
    setColleagues((data as Colleague[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const saveColleague = useCallback(async (input: ColleagueInput): Promise<Colleague | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase
      .from('colleagues')
      .insert({ ...input, rep_id: user.id })
      .select()
      .single()
    if (data) setColleagues(prev => [data as Colleague, ...prev])
    return (data as Colleague) ?? null
  }, [supabase])

  const removeColleague = useCallback(async (id: string) => {
    await supabase.from('colleagues').delete().eq('id', id)
    setColleagues(prev => prev.filter(c => c.id !== id))
  }, [supabase])

  return { colleagues, loading, saveColleague, removeColleague, reload: load }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useColleagues.ts
git commit -m "feat: add useColleagues hook"
```

---

## Task 4: `useColleagueSessions` hook

**Files:**
- Create: `src/hooks/useColleagueSessions.ts`

**Interfaces:**
- Consumes: `RoleplaySessionSummary` (Task 2); `roleplay_sessions.colleague_id` (Task 1).
- Produces: `useColleagueSessions(colleagueId: string): { sessions: RoleplaySessionSummary[], loading: boolean, reload: () => Promise<void> }` — consumed by Task 7.

- [ ] **Step 1: Write the hook**

```typescript
'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import type { RoleplaySessionSummary } from '@/types/game'

const SESSION_COLUMNS = 'id, created_at, duration_sec, talk_ratio, question_ratio, open_question_ratio, paraphrase_score, active_listening_score, rep_style, rep_confidence'

/** A colleague's roleplay session history — scores only, newest first. */
export function useColleagueSessions(colleagueId: string) {
  const supabase = createClient()
  const [sessions, setSessions] = useState<RoleplaySessionSummary[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('roleplay_sessions')
      .select(SESSION_COLUMNS)
      .eq('colleague_id', colleagueId)
      .order('created_at', { ascending: false })
    setSessions((data as RoleplaySessionSummary[]) ?? [])
    setLoading(false)
  }, [supabase, colleagueId])

  useEffect(() => { load() }, [load])

  return { sessions, loading, reload: load }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useColleagueSessions.ts
git commit -m "feat: add useColleagueSessions hook"
```

---

## Task 5: `colleagueId` on the roleplay pipeline

**Files:**
- Modify: `src/hooks/useRoleplayRecorder.ts:40` (signature), `:173-186` (insert), `:201` (deps)
- Modify: `src/components/game/RoleplayRecorder.tsx:6,8,10` (props)
- Modify: `src/components/game/VisitPrep.tsx:81` (call site)

**Interfaces:**
- Consumes: `roleplay_sessions.colleague_id` (Task 1).
- Produces: `RoleplayRecorder`'s new `colleagueId` prop — consumed by Task 7.

- [ ] **Step 1: Add the parameter and insert column**

In `src/hooks/useRoleplayRecorder.ts`, change the signature:

```typescript
export function useRoleplayRecorder(doctorId: string | null, colleagueId: string | null) {
```

In the `pickSpeaker` callback, the insert currently reads:

```typescript
      const { error: insertError } = await supabase.from('roleplay_sessions').insert({
        rep_id: user.id,
        doctor_id: doctorId,
        duration_sec: Math.round(built.durationSec),
```

Change it to:

```typescript
      const { error: insertError } = await supabase.from('roleplay_sessions').insert({
        rep_id: user.id,
        doctor_id: doctorId,
        colleague_id: colleagueId,
        duration_sec: Math.round(built.durationSec),
```

And update the `pickSpeaker` callback's dependency array:

```typescript
  }, [doctorId, colleagueId, supabase])
```

- [ ] **Step 2: Add the prop to `RoleplayRecorder`**

In `src/components/game/RoleplayRecorder.tsx`, change:

```typescript
interface Props { doctorId: string | null; onDone: () => void }

export default function RoleplayRecorder({ doctorId, onDone }: Props) {
  const t = useT()
  const { phase, error, elapsedSec, speakerPreviews, result, start, stop, pickSpeaker, reset } = useRoleplayRecorder(doctorId)
```

to:

```typescript
interface Props { doctorId: string | null; colleagueId: string | null; onDone: () => void }

export default function RoleplayRecorder({ doctorId, colleagueId, onDone }: Props) {
  const t = useT()
  const { phase, error, elapsedSec, speakerPreviews, result, start, stop, pickSpeaker, reset } = useRoleplayRecorder(doctorId, colleagueId)
```

- [ ] **Step 3: Update the existing call site**

In `src/components/game/VisitPrep.tsx`, change:

```typescript
    return <RoleplayRecorder doctorId={view.doctor.id} onDone={() => setView({ mode: 'detail', doctor: view.doctor })} />
```

to:

```typescript
    return <RoleplayRecorder doctorId={view.doctor.id} colleagueId={null} onDone={() => setView({ mode: 'detail', doctor: view.doctor })} />
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRoleplayRecorder.ts src/components/game/RoleplayRecorder.tsx src/components/game/VisitPrep.tsx
git commit -m "feat: tag roleplay sessions with an optional colleague id"
```

---

## Task 6: Bilingual copy

**Files:**
- Modify: `src/lib/i18n.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `perform.*` keys — consumed by Task 7 and Task 8. Also removes the now-dead `perform.comingSoon` stub key.

- [ ] **Step 1: Update the EN dictionary**

In `src/lib/i18n.tsx`, the EN dict currently has (added earlier this session, for the tab-nav stub):

```typescript
  'perform.title': 'Perform',
  'perform.comingSoon': 'Live-visit scoring is coming soon — bring your Rehearse coaching into a real call.',
```

Replace those two lines with:

```typescript
  'perform.title': 'Perform',
  'perform.subtitle': 'Practice live with a colleague — build a roster and watch your coaching scores improve session over session.',
  'perform.reopen': 'Practice Partners',
  'perform.addColleague': '+ Add a colleague',
  'perform.myColleagues': 'My Colleagues',
  'perform.empty': 'No colleagues yet — add one to start practicing.',
  'perform.save': 'Save colleague',
  'perform.historyTitle': 'Session History',
  'perform.historyEmpty': 'No sessions yet — start your first roleplay.',
  'perform.backToList': '‹ Back',
```

- [ ] **Step 2: Update the AR dictionary**

The AR dict currently has:

```typescript
  'perform.title': 'الأداء',
  'perform.comingSoon': 'تقييم الزيارات الحية قادم قريباً — انقل تدريبك من قسم «تمرّن» إلى زيارة حقيقية.',
```

Replace those two lines with:

```typescript
  'perform.title': 'الأداء',
  'perform.subtitle': 'تمرّن مباشرة مع زميل — أنشئ قائمة زملاء وراقب تحسّن درجاتك التدريبية جلسة بعد جلسة.',
  'perform.reopen': 'شركاء التمرين',
  'perform.addColleague': '+ أضف زميلاً',
  'perform.myColleagues': 'زملائي',
  'perform.empty': 'لا يوجد زملاء بعد — أضف واحداً لتبدأ التمرين.',
  'perform.save': 'احفظ الزميل',
  'perform.historyTitle': 'سجلّ الجلسات',
  'perform.historyEmpty': 'لا توجد جلسات بعد — ابدأ أول جلسة تمثيل أدوار.',
  'perform.backToList': '‹ رجوع',
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.tsx
git commit -m "feat: add bilingual copy for the colleague-practice screen"
```

---

## Task 7: `Colleagues.tsx` component

**Files:**
- Create: `src/components/game/Colleagues.tsx`

**Interfaces:**
- Consumes: `useColleagues` (Task 3), `useColleagueSessions` (Task 4), `RoleplayRecorder` with `colleagueId` (Task 5), `perform.*`/`prep.name`/`prep.cancel`/`prep.delete`/`roleplay.*` i18n keys (Task 6), `Colleague`/`RoleplaySessionSummary` types (Task 2).
- Produces: `export default function Colleagues({ onExit: () => void })` — consumed by Task 8 (`GameShell`).

- [ ] **Step 1: Write the component**

```typescript
'use client'
import { useState } from 'react'
import { useT, useLang } from '@/lib/i18n'
import { useColleagues } from '@/hooks/useColleagues'
import { useColleagueSessions } from '@/hooks/useColleagueSessions'
import type { Colleague } from '@/types/game'
import RoleplayRecorder from './RoleplayRecorder'

interface Props { onExit: () => void }

type View =
  | { mode: 'list' }
  | { mode: 'form' }
  | { mode: 'detail'; colleague: Colleague }
  | { mode: 'roleplay'; colleague: Colleague }

const inputStyle: React.CSSProperties = {
  background:'rgba(0,0,0,.3)', border:'1px solid var(--line)', borderRadius:10,
  padding:'11px 13px', color:'var(--ink)', fontFamily:'var(--sans)', fontSize:14, outline:'none', width:'100%',
}
const labelStyle: React.CSSProperties = { fontFamily:'var(--mono)', fontSize:10, letterSpacing:'.15em', textTransform:'uppercase', color:'var(--ink-dim)', marginBottom:6, display:'block' }
const primaryBtn: React.CSSProperties = { cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.12em', textTransform:'uppercase', border:'1px solid var(--cyan)', color:'#04121c', background:'var(--cyan)', borderRadius:10, padding:'12px 18px', boxShadow:'var(--glow-cyan)', touchAction:'manipulation' }
const ghostBtn: React.CSSProperties = { cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.12em', textTransform:'uppercase', border:'1px solid var(--cyan)', color:'var(--cyan)', background:'transparent', borderRadius:10, padding:'12px 18px', touchAction:'manipulation' }

function panel(title: string, children: React.ReactNode) {
  return (
    <section style={{ background:'linear-gradient(180deg,var(--panel),#0a1430)', border:'1px solid var(--line)', borderRadius:16, padding:16, boxShadow:'0 12px 40px rgba(0,0,0,.45)' }}>
      <div style={{ fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.3em', textTransform:'uppercase', color:'var(--cyan)', display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
        <span style={{ width:9, height:9, borderRadius:'50%', background:'var(--cyan)', boxShadow:'var(--glow-cyan)', display:'inline-block' }} />
        {title}
      </div>
      {children}
    </section>
  )
}

export default function Colleagues({ onExit }: Props) {
  const t = useT()
  const { colleagues, loading, saveColleague, removeColleague } = useColleagues()
  const [view, setView] = useState<View>({ mode: 'list' })

  const wrap = (children: React.ReactNode) => (
    <div style={{ position:'relative', zIndex:1, maxWidth:560, margin:'0 auto', padding:14, display:'flex', flexDirection:'column', gap:14 }}>{children}</div>
  )

  if (view.mode === 'roleplay') {
    return <RoleplayRecorder doctorId={null} colleagueId={view.colleague.id} onDone={() => setView({ mode: 'detail', colleague: view.colleague })} />
  }

  if (view.mode === 'form') {
    return <ColleagueForm
      onCancel={() => setView({ mode: 'list' })}
      onSave={async (name) => {
        const saved = await saveColleague({ name })
        if (saved) setView({ mode: 'detail', colleague: saved })
        else setView({ mode: 'list' })
      }}
    />
  }

  if (view.mode === 'detail') {
    const c = view.colleague
    return wrap(
      <>
        <button onClick={() => setView({ mode: 'list' })} style={{ ...ghostBtn, alignSelf:'flex-start', border:'none', padding:'4px 0', color:'var(--ink-dim)' }}>{t('perform.backToList')}</button>
        {panel(c.name,
          <>
            <button onClick={() => setView({ mode: 'roleplay', colleague: c })}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, width:'100%', cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.1em', textTransform:'uppercase', border:'1px solid var(--green)', color:'var(--green)', background:'rgba(62,224,143,.08)', borderRadius:10, padding:'12px 16px', touchAction:'manipulation' }}>
              🎙 {t('roleplay.entryButton')}
            </button>
            <button onClick={async () => { await removeColleague(c.id); setView({ mode: 'list' }) }}
              style={{ ...ghostBtn, border:'1px solid var(--red)', color:'var(--red)', marginTop:10, width:'100%' }}>
              {t('prep.delete')}
            </button>
          </>
        )}
        {panel(t('perform.historyTitle'), <ColleagueHistory colleagueId={c.id} />)}
      </>
    )
  }

  // list
  return wrap(
    <>
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button onClick={onExit} style={{ ...ghostBtn, border:'none', color:'var(--ink-dim)', padding:'4px 0' }}>{t('home')}</button>
      </div>
      {panel(t('perform.title'),
        <>
          <div style={{ color:'var(--ink-dim)', fontSize:12.5, lineHeight:1.5, marginBottom:14 }}>{t('perform.subtitle')}</div>
          <button onClick={() => setView({ mode: 'form' })} style={{ ...primaryBtn, width:'100%' }}>{t('perform.addColleague')}</button>
        </>
      )}
      {panel(t('perform.myColleagues'),
        loading ? <div style={{ color:'var(--ink-dim)', fontSize:13 }}>…</div>
        : colleagues.length === 0 ? <div style={{ color:'var(--ink-dim)', fontSize:13, lineHeight:1.5 }}>{t('perform.empty')}</div>
        : <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {colleagues.map(c => (
              <button key={c.id} onClick={() => setView({ mode: 'detail', colleague: c })}
                style={{ display:'flex', alignItems:'center', gap:12, textAlign:'start', cursor:'pointer', border:'1px solid var(--line)', borderRadius:12, padding:'11px 13px', background:'rgba(0,0,0,.18)', color:'var(--ink)' }}>
                <span style={{ flex:1, fontSize:14.5 }}>{c.name}</span>
                <span style={{ color:'var(--ink-dim)' }}>›</span>
              </button>
            ))}
          </div>
      )}
    </>
  )
}

function ColleagueForm({ onSave, onCancel }: { onSave: (name: string) => void; onCancel: () => void }) {
  const t = useT()
  const [name, setName] = useState('')
  return (
    <div style={{ position:'relative', zIndex:1, maxWidth:560, margin:'0 auto', padding:14 }}>
      {panel(t('perform.addColleague'),
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div><span style={labelStyle}>{t('prep.name')}</span><input value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <button onClick={() => name.trim() && onSave(name.trim())} disabled={!name.trim()} style={{ ...primaryBtn, flex:1, opacity: name.trim() ? 1 : .5 }}>{t('perform.save')}</button>
            <button onClick={onCancel} style={ghostBtn}>{t('prep.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  )
}

const historyRow: React.CSSProperties = { fontSize:13, lineHeight:1.5, marginBottom:3 }
const historyLabel: React.CSSProperties = { color:'var(--ink-dim)', fontWeight:600 }

function ColleagueHistory({ colleagueId }: { colleagueId: string }) {
  const t = useT()
  const { lang } = useLang()
  const { sessions, loading } = useColleagueSessions(colleagueId)

  if (loading) return <div style={{ color:'var(--ink-dim)', fontSize:13 }}>…</div>
  if (sessions.length === 0) return <div style={{ color:'var(--ink-dim)', fontSize:13, lineHeight:1.5 }}>{t('perform.historyEmpty')}</div>

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {sessions.map(s => (
        <div key={s.id} style={{ border:'1px solid var(--line)', borderRadius:10, padding:'10px 12px', background:'rgba(0,0,0,.18)' }}>
          <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--ink-dim)', marginBottom:6 }}>
            {new Date(s.created_at).toLocaleDateString(lang === 'ar' ? 'ar' : 'en')}
          </div>
          <div style={historyRow}><span style={historyLabel}>{t('roleplay.talkRatio')}:</span> {Math.round(s.talk_ratio * 100)}%</div>
          <div style={historyRow}><span style={historyLabel}>{t('roleplay.questionRatio')}:</span> {Math.round(s.question_ratio * 100)}%</div>
          {s.open_question_ratio != null && <div style={historyRow}><span style={historyLabel}>{t('roleplay.openQuestionRatio')}:</span> {Math.round(s.open_question_ratio * 100)}%</div>}
          {s.paraphrase_score != null && <div style={historyRow}><span style={historyLabel}>{t('roleplay.paraphraseScore')}:</span> {Math.round(s.paraphrase_score * 100)}%</div>}
          {s.active_listening_score != null && <div style={{ ...historyRow, marginBottom:0 }}><span style={historyLabel}>{t('roleplay.activeListeningTitle')}:</span> {s.active_listening_score}</div>}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/game/Colleagues.tsx
git commit -m "feat: add Colleagues component (roster + roleplay history)"
```

---

## Task 8: Wire into `GameShell`/`GameHome`, final verification

**Files:**
- Modify: `src/components/game/GameShell.tsx`
- Modify: `src/components/game/GameHome.tsx`

**Interfaces:**
- Consumes: `Colleagues` (Task 7).
- Produces: nothing further — this is the integration leaf.

- [ ] **Step 1: Add the `perform` screen to `GameShell`**

In `src/components/game/GameShell.tsx`, add the import next to the existing `VisitPrep` import:

```typescript
import VisitPrep from './VisitPrep'
import Colleagues from './Colleagues'
```

Extend the `Screen` type:

```typescript
type Screen = 'home' | 'level' | 'result' | 'daily' | 'how' | 'prep' | 'perform' | 'assignment' | 'sps'
```

Add the screen render, next to the existing `'prep'` block:

```typescript
  if (screen === 'prep') {
    return <VisitPrep onExit={() => setScreen('home')} />
  }

  if (screen === 'perform') {
    return <Colleagues onExit={() => setScreen('home')} />
  }
```

Add the prop to the `<GameHome>` call, next to the existing `onShowPrep`:

```typescript
      onShowPrep={() => setScreen('prep')}
      onShowPerform={() => setScreen('perform')}
```

- [ ] **Step 2: Replace the Perform-tab stub in `GameHome`**

In `src/components/game/GameHome.tsx`, the `Props` interface currently has:

```typescript
  onShowPrep: () => void
  onStartLevel: (n: number) => void
}
```

Change it to:

```typescript
  onShowPrep: () => void
  onShowPerform: () => void
  onStartLevel: (n: number) => void
}
```

The destructured parameter list currently ends:

```typescript
export default function GameHome({ xp, badges, earnedLevels, decisions, correct, totalReactionMs, reactionCount, confidence, role, daily, standings, assignment, onStartAssignment, avatarUrl, displayName, onUploadAvatar, onStartDaily, onShowHow, onShowPrep, onStartLevel }: Props) {
```

Change it to:

```typescript
export default function GameHome({ xp, badges, earnedLevels, decisions, correct, totalReactionMs, reactionCount, confidence, role, daily, standings, assignment, onStartAssignment, avatarUrl, displayName, onUploadAvatar, onStartDaily, onShowHow, onShowPrep, onShowPerform, onStartLevel }: Props) {
```

Then replace the current stub:

```typescript
        {tab === 'perform' && panel(t('perform.title'),
          <div style={{ color:'var(--ink-dim)', fontSize:13, lineHeight:1.6 }}>{t('perform.comingSoon')}</div>
        )}
```

with:

```typescript
        {tab === 'perform' && panel(t('perform.title'),
          <>
            <div style={{ color:'var(--ink-dim)', fontSize:12.5, lineHeight:1.5, marginBottom:14 }}>{t('perform.subtitle')}</div>
            <button onClick={onShowPerform}
              style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, width:'100%', cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, letterSpacing:'.12em', textTransform:'uppercase', border:'1px solid var(--cyan)', color:'var(--cyan)', background:'rgba(56,214,255,.06)', borderRadius:10, padding:'12px 16px', touchAction:'manipulation' }}>
              🤝 {t('perform.reopen')}
            </button>
          </>
        )}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Run the full test suite**

Run: `npm test -- --run`
Expected: PASS (29 existing tests — this plan added no new test file per the Global Constraints, since nothing here is scoring logic).

- [ ] **Step 5: Manual browser click-through**

Start the dev server (`npm run dev`), sign in, and confirm:
1. Perform tab shows the subtitle + "Practice Partners" button (not the old "coming soon" text).
2. Clicking it opens the colleague list (empty state visible on a fresh account).
3. "+ Add a colleague" → enter a name → save → lands on that colleague's detail screen.
4. Detail screen shows "Roleplay With a Colleague" and a Delete button; history panel shows the empty-history message.
5. Starting a roleplay still shows the existing consent screen unchanged, and completing one returns to the colleague's detail screen with a new row now visible under Session History showing the four scores.
6. Toggle to Arabic (`LangToggle`) and repeat steps 1–3 — confirm no missing-key fallback (raw key names) appears anywhere.

- [ ] **Step 6: Commit**

```bash
git add src/components/game/GameShell.tsx src/components/game/GameHome.tsx
git commit -m "feat: wire the colleague-practice screen into Perform tab"
```
