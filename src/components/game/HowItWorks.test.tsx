// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'
import HowItWorks from './HowItWorks'

const wrap = () => render(React.createElement(LanguageProvider, null, React.createElement(HowItWorks, { onDone: vi.fn() })))
beforeEach(() => { vi.stubGlobal('React', React) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

describe('HowItWorks walkthrough', () => {
  it('opens with the same promise as the home page, and says the tour covers the practice game', () => {
    wrap()
    expect(screen.getByRole('heading', { name: 'Walk into every visit prepared. Walk out knowing your next step.' })).toBeTruthy()
    expect(screen.getByText(/Read each doctor's style, shift yours to fit/)).toBeTruthy()
    expect(screen.getByText(/practice game/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Win the call/)
  })

  it('calls the levels practice levels', () => {
    wrap()
    fireEvent.click(screen.getByText(/Next/)); fireEvent.click(screen.getByText(/Next/))
    expect(screen.getByRole('heading', { name: 'Four practice levels, harder each time' })).toBeTruthy()
  })

  it('says the same in Arabic', async () => {
    localStorage.setItem('styleshift_lang', 'ar')
    wrap()
    expect((await screen.findByRole('heading', { name: 'ادخل كل زيارة وأنت مستعد. واخرج وأنت تعرف خطوتك التالية.' }))).toBeTruthy()
    expect(document.body.textContent).not.toContain('اقرأ الغرفة')
  })
})
