// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
vi.mock('@/lib/i18n', () => ({ useT: () => (key: string, p?: Record<string, string | number>) => p ? `${key}|${Object.values(p).join('|')}` : key }))
const nudgeState = vi.hoisted(() => ({ nudge: null as unknown, dismiss: vi.fn() }))
vi.mock('@/hooks/useCoachNudge', () => ({ useCoachNudge: () => nudgeState }))
import CoachNudgeCard from './CoachNudgeCard'

beforeEach(() => { vi.stubGlobal('React', React); nudgeState.dismiss.mockClear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); nudgeState.nudge = null })

const card = (onOpenCoach = vi.fn(), onOpenDoctor = vi.fn()) => render(React.createElement(CoachNudgeCard, { onOpenCoach, onOpenDoctor }))

describe('CoachNudgeCard', () => {
  it('renders nothing when there is no nudge', () => {
    const { container } = card()
    expect(container.innerHTML).toBe('')
  })
  it('opens the coach on the nudged doctor, and snoozes by key', () => {
    nudgeState.nudge = { kind: 'planned_visit', key: 'plan:d1:goal', doctorId: 'd1', doctorName: 'Dr. X', text: 'Agree a trial' }
    const onOpenCoach = vi.fn()
    card(onOpenCoach)
    expect(screen.getByText(/nudge.plannedBody\|Agree a trial/)).toBeTruthy()
    fireEvent.click(screen.getByText('nudge.debrief'))
    expect(onOpenCoach).toHaveBeenCalledWith('d1')
    fireEvent.click(screen.getByText('nudge.later'))
    expect(nudgeState.dismiss).toHaveBeenCalledWith('plan:d1:goal')
  })
  it('opens the coach with no doctor for the quiet-streak nudge', () => {
    nudgeState.nudge = { kind: 'quiet', key: 'quiet:x', days: 5 }
    const onOpenCoach = vi.fn()
    card(onOpenCoach)
    fireEvent.click(screen.getByText('nudge.debrief'))
    expect(onOpenCoach).toHaveBeenCalledWith(undefined)
  })
  it('opens the doctor page, not the coach, for a promise nudge', () => {
    nudgeState.nudge = { kind: 'open_promise', key: 'promise:p1', doctorId: 'd1', doctorName: 'Dr. X', text: 'Bring the study', days: 4 }
    const onOpenCoach = vi.fn(); const onOpenDoctor = vi.fn()
    card(onOpenCoach, onOpenDoctor)
    expect(screen.getByText(/nudge.promiseBody\|Bring the study\|4/)).toBeTruthy()
    fireEvent.click(screen.getByText('nudge.openDoctor'))
    expect(onOpenDoctor).toHaveBeenCalledWith('d1')
    expect(onOpenCoach).not.toHaveBeenCalled()
  })
})
