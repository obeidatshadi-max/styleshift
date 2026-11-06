// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'

const m = vi.hoisted(() => ({ params: new URLSearchParams() }))
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => ({ auth: { signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn() } }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => m.params }))
import Landing, { CREATE_ACCOUNT, CREATE_MANAGER } from './Landing'
import LoginForm from '@/components/auth/LoginForm'

const wrap = (node: React.ReactElement) => render(React.createElement(LanguageProvider, null, node))
beforeEach(() => { vi.stubGlobal('React', React); m.params = new URLSearchParams() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

describe('Landing', () => {
  it('leads with the whole-visit promise, not training', () => {
    wrap(<Landing />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Walk into every visit prepared. Walk out knowing your next step.')
    for (const step of ['Prepare', 'Practice', 'Debrief', 'Follow through']) expect(screen.getByRole('heading', { name: step })).toBeTruthy()
    expect(screen.getByText('If you are a rep')).toBeTruthy()
    expect(screen.getByText('If you lead a team')).toBeTruthy()
  })

  it('offers Create account and Sign in at the top and bottom, and routes managers to manager sign-up', () => {
    wrap(<Landing />)
    const hrefs = (label: string) => screen.getAllByText(label).map(a => a.closest('a')!.getAttribute('href'))
    expect(hrefs('Create Account').filter(h => h === CREATE_ACCOUNT)).toHaveLength(3)
    expect(hrefs('Create Account').filter(h => h === CREATE_MANAGER)).toHaveLength(1)
    expect(hrefs('Sign In')).toEqual(['/login', '/login'])
    expect(screen.getByText(/Team manager\?/).closest('a')!.getAttribute('href')).toBe(CREATE_MANAGER)
    expect(screen.getByText(/Have an invite from your manager/).closest('a')!.getAttribute('href')).toBe('/login')
  })

  it('labels the phone mockup as a sample, so it is never read as a real doctor', () => {
    wrap(<Landing />)
    expect(screen.getAllByText('Sample screen').length).toBeGreaterThan(0)
  })

  it('speaks Arabic when the app is Arabic', async () => {
    localStorage.setItem('styleshift_lang', 'ar')
    wrap(<Landing />)
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toContain('ادخل كل زيارة وأنت مستعد')
    expect(screen.getAllByText('تسجيل الدخول').length).toBe(2)
    expect(screen.getAllByText('إنشاء حساب').length).toBeGreaterThan(0)
  })
})

describe('the sign-in screen opens on the form the home page linked to', () => {
  const fromLink = (href: string) => { m.params = new URL(href, 'https://x.test').searchParams }

  it('manager sign-up link opens the manager tab in sign-up mode', () => {
    fromLink(CREATE_MANAGER)
    wrap(<LoginForm />)
    expect(screen.getAllByText('Create Account').length).toBeGreaterThan(0)
    expect(screen.getByText('Already have an account? Sign in')).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
  })

  it('create-account link opens the rep email form in sign-up mode', () => {
    fromLink(CREATE_ACCOUNT)
    wrap(<LoginForm />)
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByText('Already have an account? Sign in')).toBeTruthy()
  })

  it('a plain /login still opens on mobile + PIN sign-in', () => {
    wrap(<LoginForm />)
    expect(screen.queryByLabelText('Email')).toBeNull()
    expect(screen.queryByText('Already have an account? Sign in')).toBeNull()
  })

  it('never opens sign-up on the mobile + PIN form, which has no sign-up', () => {
    fromLink('/login?mode=signup')
    wrap(<LoginForm />)
    expect(screen.queryByText('Already have an account? Sign in')).toBeNull()
    expect(screen.queryByLabelText('Email')).toBeNull()
  })
})
