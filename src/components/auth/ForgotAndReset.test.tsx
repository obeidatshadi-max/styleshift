// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'

const m = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), push: vi.fn(), refresh: vi.fn(), signOut: vi.fn(),
}))
vi.mock('@/lib/supabase-browser', () => ({
  createClient: () => ({ auth: { resetPasswordForEmail: m.resetPasswordForEmail, updateUser: m.updateUser, signInWithPassword: vi.fn(), signOut: m.signOut } }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: m.push, refresh: m.refresh }),
  useSearchParams: () => new URLSearchParams(),
}))
import ForgotPasswordForm from './ForgotPasswordForm'
import ResetPasswordForm from './ResetPasswordForm'
import LoginForm from './LoginForm'

const wrap = (node: React.ReactElement) => render(React.createElement(LanguageProvider, null, node))
beforeEach(() => { vi.stubGlobal('React', React); m.resetPasswordForEmail.mockResolvedValue({ error: null }); m.updateUser.mockResolvedValue({ error: null }); m.signOut.mockResolvedValue({ error: null }) })
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); localStorage.clear() })

describe('ForgotPasswordForm', () => {
  it('asks Supabase for a reset link that comes back through /auth/confirm, and says the same thing every time', async () => {
    wrap(<ForgotPasswordForm onBack={() => {}} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: '  mgr@example.com ' } })
    fireEvent.click(screen.getByText('Send reset link'))
    await screen.findByText(/If an account exists for that email/)
    expect(m.resetPasswordForEmail).toHaveBeenCalledWith('mgr@example.com', { redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password` })
  })

  it('shows the same message when the email has no account or Supabase refuses for another reason', async () => {
    m.resetPasswordForEmail.mockResolvedValue({ error: { status: 400, message: 'User not found' } })
    wrap(<ForgotPasswordForm onBack={() => {}} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nobody@example.com' } })
    fireEvent.click(screen.getByText('Send reset link'))
    await screen.findByText(/If an account exists for that email/)
  })

  it('tells the person when the email quota is used up', async () => {
    m.resetPasswordForEmail.mockResolvedValue({ error: { status: 429, message: 'email rate limit exceeded' } })
    wrap(<ForgotPasswordForm onBack={() => {}} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.click(screen.getByText('Send reset link'))
    expect((await screen.findByRole('alert')).textContent).toContain('Too many requests')
  })

  it('keeps the typed email, goes back, and speaks Arabic when the app is Arabic', async () => {
    localStorage.setItem('styleshift_lang', 'ar')
    const back = vi.fn()
    wrap(<ForgotPasswordForm initialEmail="x@y.com" onBack={back} />)
    expect(await screen.findByText('إعادة تعيين كلمة المرور')).toBeTruthy()
    expect((screen.getByLabelText('البريد الإلكتروني') as HTMLInputElement).value).toBe('x@y.com')
    fireEvent.click(screen.getByText('العودة إلى تسجيل الدخول'))
    expect(back).toHaveBeenCalled()
  })
})

describe('ResetPasswordForm', () => {
  const fill = (a: string, b: string) => {
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: a } })
    fireEvent.change(screen.getByLabelText('Repeat the new password'), { target: { value: b } })
    fireEvent.click(screen.getByText('Save password'))
  }

  it('refuses a short password and two different passwords without calling Supabase', async () => {
    wrap(<ResetPasswordForm />)
    fill('abc', 'abc')
    expect((await screen.findByRole('alert')).textContent).toContain('at least 6')
    fill('abcdef', 'abcdeg')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('do not match'))
    expect(m.updateUser).not.toHaveBeenCalled()
  })

  it('saves the new password, says so, and waits for the person to choose where to go', async () => {
    wrap(<ResetPasswordForm />)
    fill('abcdef', 'abcdef')
    expect((await screen.findByRole('status')).textContent).toContain('Password updated')
    expect(m.updateUser).toHaveBeenCalledWith({ password: 'abcdef' })
    expect(m.push).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Continue to the app'))
    expect(m.push).toHaveBeenCalledWith('/play')
    expect(m.signOut).not.toHaveBeenCalled()
  })

  it('after saving, "Sign in again" signs out first and then opens the sign-in page', async () => {
    wrap(<ResetPasswordForm />)
    fill('abcdef', 'abcdef')
    fireEvent.click(await screen.findByText('Sign in again with the new password'))
    await waitFor(() => expect(m.push).toHaveBeenCalledWith('/login'))
    expect(m.signOut).toHaveBeenCalled()
    expect(m.signOut.mock.invocationCallOrder[0]).toBeLessThan(m.push.mock.invocationCallOrder[0])
  })

  it('offers a way back to sign in before saving, which signs out first', async () => {
    wrap(<ResetPasswordForm />)
    fireEvent.click(screen.getByText('Back to sign in'))
    await waitFor(() => expect(m.push).toHaveBeenCalledWith('/login'))
    expect(m.signOut).toHaveBeenCalled()
    expect(m.updateUser).not.toHaveBeenCalled()
  })

  it('says the same in Arabic', async () => {
    localStorage.setItem('styleshift_lang', 'ar')
    wrap(<ResetPasswordForm />)
    expect(await screen.findByText('العودة إلى تسجيل الدخول')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('كلمة المرور الجديدة'), { target: { value: 'abcdef' } })
    fireEvent.change(screen.getByLabelText('أعد كتابة كلمة المرور الجديدة'), { target: { value: 'abcdef' } })
    fireEvent.click(screen.getByText('احفظ كلمة المرور'))
    expect((await screen.findByRole('status')).textContent).toContain('تم تحديث كلمة المرور')
    expect(screen.getByText('سجّل الدخول من جديد بكلمة المرور الجديدة')).toBeTruthy()
  })

  it('says the link may have expired when Supabase refuses, and stays on the page', async () => {
    m.updateUser.mockResolvedValue({ error: { message: 'Auth session missing' } })
    wrap(<ResetPasswordForm />)
    fill('abcdef', 'abcdef')
    expect((await screen.findByRole('alert')).textContent).toContain('may have expired')
    expect(m.push).not.toHaveBeenCalled()
  })
})

describe('LoginForm forgot-password link', () => {
  it('shows on manager sign-in and individual sign-in, opens the reset form, and is not shown while signing up or on mobile+PIN', async () => {
    wrap(<LoginForm />)
    // Rep tab opens on mobile + PIN: no password to forget.
    expect(screen.queryByText('Forgot password?')).toBeNull()
    fireEvent.click(screen.getByText('Manager · Email'))
    fireEvent.click(await screen.findByText('Forgot password?'))
    expect(await screen.findByText('Reset your password')).toBeTruthy()
    fireEvent.click(screen.getByText('Back to sign in'))
    fireEvent.click(await screen.findByText("Don't have an account? Sign up"))
    expect(screen.queryByText('Forgot password?')).toBeNull()
  })

  it('also offers it to a rep who signs in with email', async () => {
    wrap(<LoginForm />)
    fireEvent.click(screen.getByText('Individual'))
    fireEvent.click(await screen.findByText('Forgot password?'))
    expect(await screen.findByText('Reset your password')).toBeTruthy()
  })

  it('asks the browser to remember the right thing: current password on sign-in, new password on sign-up', async () => {
    wrap(<LoginForm />)
    fireEvent.click(screen.getByText('Manager · Email'))
    const pw = () => screen.getByLabelText('Password') as HTMLInputElement
    expect(pw().autocomplete).toBe('current-password')
    fireEvent.click(screen.getByText("Don't have an account? Sign up"))
    expect(pw().autocomplete).toBe('new-password')
  })
})
