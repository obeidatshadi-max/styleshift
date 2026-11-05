// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'
import MyCertificates from './MyCertificates'

const view = () => render(React.createElement(LanguageProvider, null, React.createElement(MyCertificates)))
beforeEach(() => { vi.stubGlobal('React', React) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

describe('MyCertificates', () => {
  it('renders nothing when certification is off or the rep has none', async () => {
    const off = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }))
    vi.stubGlobal('fetch', off)
    const a = view()
    await waitFor(() => expect(off).toHaveBeenCalled())
    expect(a.container.innerHTML).toBe('')
    cleanup()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ certificates: [] }) })))
    const b = view()
    await new Promise(r => setTimeout(r, 20))
    expect(b.container.innerHTML).toBe('')
  })

  it('lists certificates with their state and a link to the public page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ certificates: [
      { id: 'a', program: 'Field Ready', verifyCode: 'ABCDEFGHJKMN', issuedAt: '2026-11-01T00:00:00Z', revoked: false },
      { id: 'b', program: 'Old one', verifyCode: 'ABCDEFGHJKMP', issuedAt: '2026-09-01T00:00:00Z', revoked: true },
    ] }) })))
    const { findByText, getAllByText, container } = view()
    await findByText(/Field Ready/)
    expect(getAllByText('Open certificate')[0].getAttribute('href')).toBe('/verify/ABCDEFGHJKMN')
    expect(container.textContent).toContain('Valid')
    expect(container.textContent).toContain('Withdrawn')
  })

  it('speaks Arabic when the app is in Arabic', async () => {
    localStorage.setItem('styleshift_lang', 'ar')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ certificates: [{ id: 'a', program: 'جاهز للميدان', verifyCode: 'ABCDEFGHJKMN', issuedAt: '2026-11-01T00:00:00Z', revoked: false }] }) })))
    const { findByText } = view()
    expect(await findByText('شهاداتي')).toBeTruthy()
    expect(await findByText('افتح الشهادة')).toBeTruthy()
  })
})
