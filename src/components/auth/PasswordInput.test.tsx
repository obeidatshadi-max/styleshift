// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'

const m = vi.hoisted(() => ({ params: new URLSearchParams() }))
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => ({ auth: { signInWithPassword: vi.fn(), updateUser: vi.fn(), resetPasswordForEmail: vi.fn() } }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => m.params }))
import PasswordInput from './PasswordInput'
import LoginForm from './LoginForm'
import ResetPasswordForm from './ResetPasswordForm'

const wrap = (node: React.ReactElement) => render(React.createElement(LanguageProvider, null, node))
beforeEach(() => { vi.stubGlobal('React', React); m.params = new URLSearchParams() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

function Harness() {
  const [v, setV] = React.useState('')
  return <PasswordInput value={v} onChange={setV} ariaLabel="Password" placeholder="Password" />
}

describe('PasswordInput', () => {
  it('hides the text by default and shows it only while Show is on, without losing what was typed', () => {
    wrap(<Harness />)
    const input = screen.getByLabelText('Password') as HTMLInputElement
    fireEvent.change(input, { target: { value: 's3cret!' } })
    expect(input.type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input.type).toBe('text')
    expect(input.value).toBe('s3cret!')
    const hide = screen.getByRole('button', { name: 'Hide password' })
    expect(hide.getAttribute('aria-pressed')).toBe('true')
    expect(hide.textContent).toBe('Hide')
    fireEvent.click(hide)
    expect(input.type).toBe('password')
    expect(screen.getByRole('button', { name: 'Show password' }).textContent).toBe('Show')
  })

  it('never submits the form when the button is pressed', () => {
    const onSubmit = vi.fn(e => e.preventDefault())
    wrap(<form onSubmit={onSubmit}><Harness /></form>)
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('speaks Arabic when the app is Arabic', async () => {
    localStorage.setItem('styleshift_lang', 'ar')
    wrap(<Harness />)
    fireEvent.click(await screen.findByRole('button', { name: 'إظهار كلمة المرور' }))
    expect(screen.getByRole('button', { name: 'إخفاء كلمة المرور' }).textContent).toBe('إخفاء')
  })
})

describe('Show password on every password box', () => {
  it('manager sign-in, rep email sign-in and the rep PIN each have one', () => {
    wrap(<LoginForm />)
    // Rep tab opens on mobile + PIN.
    expect(screen.getAllByRole('button', { name: 'Show password' })).toHaveLength(1)
    fireEvent.click(screen.getByText('Individual'))
    expect(screen.getAllByRole('button', { name: 'Show password' })).toHaveLength(1)
    fireEvent.click(screen.getByText('Manager · Email'))
    expect(screen.getAllByRole('button', { name: 'Show password' })).toHaveLength(1)
  })

  it('the PIN box keeps its digits-only keyboard and 6-character limit', () => {
    wrap(<LoginForm />)
    const pin = screen.getByLabelText('PIN') as HTMLInputElement
    expect(pin.inputMode).toBe('numeric')
    expect(pin.maxLength).toBe(6)
    expect(pin.type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(pin.type).toBe('text')
  })

  it('the reset form has one for each of its two boxes, and they toggle separately', () => {
    wrap(<ResetPasswordForm />)
    const buttons = screen.getAllByRole('button', { name: 'Show password' })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[0])
    expect((screen.getByLabelText('New password') as HTMLInputElement).type).toBe('text')
    expect((screen.getByLabelText('Repeat the new password') as HTMLInputElement).type).toBe('password')
  })
})
