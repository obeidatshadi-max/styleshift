// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'
import GameShell from './GameShell'

const state = vi.hoisted(() => ({
  profile: { id: 'rep-1', role: 'rep', xp: 0, sps_top_key: null as string | null, display_name: 'Rep', avatar_url: null },
  completedLevels: [] as number[],
  saveSpsAssessment: vi.fn(async () => {}),
  homeProps: null as Record<string, unknown> | null,
}))
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({
    profile: state.profile, badges: [], completedLevels: state.completedLevels, loading: false,
    addXp: vi.fn(), earnBadge: vi.fn(), saveSession: vi.fn(), recordDaily: vi.fn(), updateAvatar: vi.fn(),
    saveSpsAssessment: state.saveSpsAssessment,
  }),
}))
vi.mock('./GameHome', () => ({ default: (props: Record<string, unknown>) => { state.homeProps = props; return createElement('div', null, 'HOME') } }))
vi.mock('./HowItWorks', () => ({ default: ({ onDone }: { onDone: () => void }) => createElement('button', { onClick: onDone }, 'FINISH INTRO') }))
vi.mock('./SpsAssessment', () => ({ default: ({ onComplete }: { onComplete: (r: unknown) => Promise<void> }) => createElement('button', { onClick: () => void onComplete({ topKey: 'go_getter' }) }, 'QUIZ') }))
vi.mock('./AppNav', () => ({ default: ({ showBack, onBack }: { showBack: boolean; onBack: () => void }) => createElement('div', null, showBack ? createElement('button', { onClick: onBack }, 'NAV BACK') : 'NAV') }))
vi.mock('./AICoach', () => ({ default: () => createElement('div', null, 'AICOACH') }))
vi.mock('./LevelOne', () => ({ default: () => createElement('div', null, 'LEVELONE') }))
vi.mock('./LevelTwo', () => ({ default: () => createElement('div', null, 'LEVELTWO') }))
vi.mock('./LevelThree', () => ({ default: () => createElement('div', null, 'LEVELTHREE') }))
vi.mock('./LevelFour', () => ({ default: () => createElement('div', null, 'LEVELFOUR') }))
vi.mock('./LevelResult', () => ({ default: () => createElement('div', null, 'LEVELRESULT') }))
vi.mock('./DailyChallenge', () => ({ default: () => createElement('div', null, 'DAILYCHALLENGE') }))
vi.mock('./VisitPrep', () => ({ default: () => createElement('div', null, 'VISITPREP') }))
vi.mock('./Colleagues', () => ({ default: () => createElement('div', null, 'COLLEAGUES') }))
vi.mock('./FieldCards', () => ({ default: () => createElement('div', null, 'FIELDCARDS') }))

const view = () => render(createElement(LanguageProvider, null, createElement(GameShell)))
const seeIntro = () => localStorage.removeItem('styleshift_intro_done')
const skipIntro = () => localStorage.setItem('styleshift_intro_done', '1')

beforeEach(() => {
  state.profile = { id: 'rep-1', role: 'rep', xp: 0, sps_top_key: null, display_name: 'Rep', avatar_url: null }
  state.completedLevels = []
  state.homeProps = null
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); localStorage.clear() })

describe('first-run routing', () => {
  it('lands on the home screen, not the quiz or Level 1, for a rep who has done neither', async () => {
    skipIntro()
    view()
    expect(await screen.findByText('HOME')).toBeTruthy()
    expect(screen.queryByText('QUIZ')).toBeNull()
    expect(screen.queryByText('LEVELONE')).toBeNull()
    expect(state.homeProps?.spsPending).toBe(true)
  })

  it('shows the intro first, then the home screen: finishing it does not start the quiz or Level 1', async () => {
    seeIntro()
    view()
    fireEvent.click(await screen.findByText('FINISH INTRO'))
    expect(await screen.findByText('HOME')).toBeTruthy()
    expect(screen.queryByText('QUIZ')).toBeNull()
    expect(screen.queryByText('LEVELONE')).toBeNull()
  })

  it('does not offer the quiz again once it has been taken', async () => {
    skipIntro()
    state.profile = { ...state.profile, sps_top_key: 'go_getter' }
    view()
    await screen.findByText('HOME')
    expect(state.homeProps?.spsPending).toBe(false)
  })
})

describe('the optional style quiz', () => {
  it('opens from the home screen and can be left without finishing', async () => {
    skipIntro()
    view()
    await screen.findByText('HOME')
    await act(async () => { (state.homeProps?.onTakeSps as () => void)() })
    expect(await screen.findByText('QUIZ')).toBeTruthy()
    fireEvent.click(screen.getByText('NAV BACK'))
    expect(await screen.findByText('HOME')).toBeTruthy()
    expect(state.saveSpsAssessment).not.toHaveBeenCalled()
  })

  it('saves the result and returns home, not into Level 1, when finished', async () => {
    skipIntro()
    view()
    await screen.findByText('HOME')
    await act(async () => { (state.homeProps?.onTakeSps as () => void)() })
    await act(async () => fireEvent.click(await screen.findByText('QUIZ')))
    expect(state.saveSpsAssessment).toHaveBeenCalledOnce()
    expect(await screen.findByText('HOME')).toBeTruthy()
    expect(screen.queryByText('LEVELONE')).toBeNull()
  })
})
