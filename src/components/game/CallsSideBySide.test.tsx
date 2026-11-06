// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'

const db = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  errors: {} as Record<string, boolean>,
  filters: [] as Array<[string, string, unknown]>,
}))

function builder(table: string) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'order', 'limit']) b[m] = () => b
  for (const m of ['eq', 'in']) b[m] = (col: string, val: unknown) => { db.filters.push([table, col, val]); return b }
  b.then = (resolve: (v: unknown) => void) => resolve({ data: db.tables[table] ?? [], error: db.errors[table] ? { message: 'x' } : null })
  return b
}
vi.mock('@/lib/supabase-browser', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'rep-1' } } }) }, from: (t: string) => builder(t) }),
}))
import CallsSideBySide from './CallsSideBySide'

const wrap = () => render(React.createElement(LanguageProvider, null, React.createElement(CallsSideBySide, { colleagueId: 'col-1' })))
beforeEach(() => { vi.stubGlobal('React', React); db.tables = {}; db.errors = {}; db.filters = []; localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

const usual = (quote: string, category = 'time_limit') => ({
  usual: { style: 'analytical', source: 'practice_setting' }, limited: false, differsFromUsual: false,
  observations: [{ category, evidence: { segmentIndex: 0, speakerRole: 'counterpart', quote } }],
})
const seed = () => {
  db.tables.roleplay_sessions = [
    { id: 's1', created_at: '2026-11-03T09:00:00Z', doctor_id: 'doc-1' },
    { id: 's2', created_at: '2026-11-08T09:00:00Z', doctor_id: 'doc-1' },
    { id: 's3', created_at: '2026-11-10T09:00:00Z', doctor_id: 'doc-1' },
  ]
  db.tables.conversation_reports = [
    { session_id: 's1', created_at: '2026-11-03T10:00:00Z', superseded_by: null, usual: usual('I have one minute.') },
    { session_id: 's2', created_at: '2026-11-08T10:00:00Z', superseded_by: null, usual: usual('What does the data show?', 'detail_request') },
  ]
  db.tables.doctors = [{ id: 'doc-1', name: 'Dr Sample' }]
}

describe('CallsSideBySide', () => {
  it('shows each call as its own column with the real quote, under the doctor played', async () => {
    seed(); wrap()
    const cols = await screen.findAllByTestId('call-column')
    expect(cols).toHaveLength(3)
    expect(screen.getByText('Dr Sample')).toBeTruthy()
    expect(cols[0].textContent).toContain('I have one minute.')
    expect(cols[0].textContent).toContain('Mentioned limited time')
    expect(cols[1].textContent).toContain('What does the data show?')
    expect(cols[1].textContent).toContain('Mentioned evidence, data or a comparison')
    expect(cols[2].textContent).toContain('No report for this call yet.')
  })

  it('shows one quote when two statements come from the same line', async () => {
    seed()
    db.tables.conversation_reports = [{ session_id: 's1', created_at: '2026-11-03T10:00:00Z', superseded_by: null, usual: {
      usual: { style: 'analytical', source: 'practice_setting' }, limited: false,
      observations: [
        { category: 'time_limit', evidence: { quote: 'One minute, but leave the study.' } },
        { category: 'detail_request', evidence: { quote: 'One minute, but leave the study.' } },
      ] } }]
    wrap()
    const first = (await screen.findAllByTestId('call-column'))[0].textContent ?? ''
    expect(first).toContain('Mentioned limited time')
    expect(first).toContain('Mentioned evidence, data or a comparison')
    expect(first.split('One minute, but leave the study.')).toHaveLength(2)
  })

  it('says plainly that it is not a score and does not describe a trait', async () => {
    seed(); wrap()
    expect((await screen.findByTestId('calls-side-by-side')).textContent).toContain('This is not a score and it does not describe a trait.')
  })

  it('shows no number, percentage or score for any call', async () => {
    seed(); wrap()
    const text = (await screen.findByTestId('calls-side-by-side')).textContent ?? ''
    expect(text).not.toMatch(/%|score:|\d+\s*calls/i)
  })

  it('asks for a second report when fewer than two calls have one', async () => {
    db.tables.roleplay_sessions = [{ id: 's1', created_at: '2026-11-03T09:00:00Z', doctor_id: null }]
    db.tables.conversation_reports = [{ session_id: 's1', created_at: '2026-11-03T10:00:00Z', superseded_by: null, usual: usual('Quickly please.') }]
    wrap()
    expect((await screen.findByTestId('calls-side-by-side')).textContent).toContain('at least two calls')
    expect(screen.getByText('No doctor chosen')).toBeTruthy()
  })

  it('reads only this rep\'s own colleague calls and reports', async () => {
    seed(); wrap(); await screen.findAllByTestId('call-column')
    expect(db.filters).toContainEqual(['roleplay_sessions', 'colleague_id', 'col-1'])
    expect(db.filters).toContainEqual(['roleplay_sessions', 'rep_id', 'rep-1'])
    expect(db.filters).toContainEqual(['conversation_reports', 'rep_id', 'rep-1'])
    expect(db.filters).toContainEqual(['conversation_reports', 'session_type', 'human_partner'])
    expect(db.filters).toContainEqual(['doctors', 'rep_id', 'rep-1'])
  })

  it('renders nothing when the colleague has no calls', async () => {
    db.tables.roleplay_sessions = []
    const { container } = wrap()
    await waitFor(() => expect(container.querySelector('[data-testid="calls-side-by-side"]')).toBeNull())
  })

  it('says so when the calls cannot be loaded', async () => {
    db.errors.roleplay_sessions = true
    wrap()
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load the calls')
  })

  it('shows the whole view in Arabic, right to left, with the quote unchanged', async () => {
    seed(); localStorage.setItem('styleshift_lang', 'ar'); wrap()
    expect(await screen.findByText('المكالمات جنباً إلى جنب')).toBeTruthy()
    expect(document.documentElement.dir).toBe('rtl')
    const cols = screen.getAllByTestId('call-column')
    expect(cols[0].textContent).toContain('ذكر أن وقته محدود')
    expect(cols[0].textContent).toContain('I have one minute.')
    expect(cols[2].textContent).toContain('لا يوجد تقرير لهذه المكالمة بعد.')
    expect(screen.getByTestId('calls-side-by-side').textContent).toContain('هذا ليس تقييماً')
  })
})
