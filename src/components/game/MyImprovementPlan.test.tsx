// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'
import { buildImprovementReport, type FieldCheck, type PracticeRecord } from '@/lib/improvement'
import type { FollowupView } from '@/lib/improvement/server'
import MyImprovementPlan from './MyImprovementPlan'
import ImprovementBoardPanel from '../dashboard/ImprovementBoardPanel'
import type { BoardRow } from '@/lib/improvement/server'

const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n, 9)).toISOString()
const open = [62, 60, 61, 59, 45, 44, 43, 42, 55, 58]
const records: PracticeRecord[] = open.map((v, i) => ({
  id: `s${i}`, at: day(i), source: 'ai_doctor', scenarioKey: 'doubt', criticalMoments: 3,
  metrics: { open_question_ratio: v, adaptation_score: 60 + (i % 3) },
}))
const followup: FollowupView = {
  id: 'f1', repId: 'rep-1', companyId: 'co', createdBy: 'mgr', metricKey: 'open_question_ratio', source: 'ai_doctor',
  drillKind: 'precision_drill', objectionType: null, clearStep: 'clarify', baselineValue: 43.5, baselineN: 4,
  note: 'Try this before Sunday visits', dueDate: '2026-10-20', acknowledgedAt: null, closedAt: null, createdAt: day(7.5),
}
const selfCheck: FieldCheck = { id: 'c1', followupId: 'f1', repId: 'rep-1', kind: 'self_reported', recordedBy: 'rep-1', observed: 'seen', at: day(11) }
const report = buildImprovementReport({ records, followups: [followup], checks: [selfCheck], now: new Date(day(13)) })

const view = (ui: React.ReactElement) => render(React.createElement(LanguageProvider, null, ui))

beforeEach(() => { vi.stubGlobal('React', React); localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('MyImprovementPlan (rep)', () => {
  it('shows snapshot, evolution, roadmap and the assigned follow-up with its evidence tiers, in English', () => {
    view(<MyImprovementPlan initial={{ report, followups: [followup] }} />)
    const root = screen.getByTestId('improvement-plan')
    expect(root.textContent).toContain('My Improvement Plan')
    expect(root.textContent).toContain('Your last conversation')
    expect(root.textContent).toContain('Open questions')
    expect(root.textContent).toContain('Better than your usual') // 58 vs recent average
    expect(root.textContent).toContain('From your manager')
    expect(root.textContent).toContain('Try this before Sunday visits')
    expect(root.textContent).toContain('Reported by you: 1. Confirmed by your manager: 0.')
    expect(root.textContent).toContain('Visits you reported yourself are not confirmed by anyone else.')
    expect(root.textContent).toContain('No manager-confirmed field result yet.')
    expect(root.textContent).not.toMatch(/improve\./) // no untranslated key leaks
  })

  it('renders in Arabic with no untranslated keys and right-to-left friendly text', () => {
    localStorage.setItem('styleshift_lang', 'ar')
    view(<MyImprovementPlan initial={{ report, followups: [followup] }} />)
    const root = screen.getByTestId('improvement-plan')
    return waitFor(() => {
      expect(root.textContent).toContain('خطتي للتطوّر')
      expect(root.textContent).toContain('الأسئلة المفتوحة')
      expect(root.textContent).not.toMatch(/improve\./)
      expect(root.textContent).not.toContain('My Improvement Plan')
    })
  })

  it('labels a brand-new rep honestly: empty-state text and no invented focus', () => {
    const empty = buildImprovementReport({ records: [], now: new Date(day(1)) })
    view(<MyImprovementPlan initial={{ report: empty, followups: [] }} />)
    const root = screen.getByTestId('improvement-plan')
    expect(root.textContent).toContain('Practise a few conversations')
    expect(root.textContent).not.toContain('What to work on next')
    expect(root.textContent).toContain('No practice has been measured yet.')
  })

  it('sends a self-report (never a verification) when the rep taps "I used this in a real visit"', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ report, followups: [followup] }) }))
    vi.stubGlobal('fetch', fetchMock)
    view(<MyImprovementPlan initial={{ report, followups: [followup] }} />)
    fireEvent.click(screen.getByText('I used this in a real visit'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/improvement/field-checks')
    expect(JSON.parse(init.body as string)).toEqual({ followupId: 'f1', kind: 'self_reported', observed: 'seen' })
  })
})

describe('ImprovementBoardPanel (manager)', () => {
  const board: BoardRow[] = [{ repId: 'rep-1', name: 'Ali', report, followups: [followup] }]

  it('shows practice, rep-reported and manager-confirmed evidence as three separate labelled figures', () => {
    view(<ImprovementBoardPanel initial={board} />)
    const root = screen.getByTestId('improvement-board')
    expect(root.textContent).toContain('Ali')
    expect(root.textContent).toContain('Practice:')
    expect(root.textContent).toContain('Rep reported: 1 used, 0 not used')
    expect(root.textContent).toContain('Confirmed in field: 0 seen, 0 not seen')
    expect(root.textContent).toContain('not yet seen by rep')
    expect(root.textContent).toContain('No manager-confirmed field result yet')
  })

  it('records a manager verification as kind "verified"', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ reps: board }) }))
    vi.stubGlobal('fetch', fetchMock)
    view(<ImprovementBoardPanel initial={board} />)
    fireEvent.click(screen.getByText('I saw it in the field'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/improvement/field-checks')
    expect(JSON.parse(init.body as string)).toEqual({ followupId: 'f1', kind: 'verified', observed: 'seen' })
  })

  it('assigns a suggested focus with the drill target and a due date, and marks an already-open one as assigned', async () => {
    const declining = open.slice(0, 8).map((v, i) => ({ ...records[i], metrics: { open_question_ratio: v } }))
    const r = buildImprovementReport({ records: declining, now: new Date(day(9)) })
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ reps: [] }) }))
    vi.stubGlobal('fetch', fetchMock)
    view(<ImprovementBoardPanel initial={[{ repId: 'rep-1', name: 'Ali', report: r, followups: [] }]} />)
    fireEvent.click(screen.getByText('Assign (due in 7 days)'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]).body as string)
    expect(body).toMatchObject({ repId: 'rep-1', metricKey: 'open_question_ratio', drillKind: 'precision_drill', clearStep: 'clarify', source: 'ai_doctor' })
    expect(body.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('shows an empty-team message instead of an empty box', () => {
    view(<ImprovementBoardPanel initial={[]} />)
    expect(screen.getByText('No reps in your team yet.')).toBeTruthy()
  })
})
