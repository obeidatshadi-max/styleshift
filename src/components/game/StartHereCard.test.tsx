// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'
import StartHereCard from './StartHereCard'

beforeEach(() => { vi.stubGlobal('React', React) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function view(props: Partial<React.ComponentProps<typeof StartHereCard>> = {}) {
  const handlers = { onTakeSps: vi.fn(), onShowPrep: vi.fn(), onStartDaily: vi.fn() }
  render(React.createElement(LanguageProvider, null,
    React.createElement(StartHereCard, { spsPending: true, dailyDone: false, ...handlers, ...props })))
  return handlers
}

describe('StartHereCard', () => {
  it('lists the three first-day steps in order', () => {
    view()
    const items = screen.getAllByRole('listitem').map(li => li.textContent)
    expect(items[0]).toContain('selling style')
    expect(items[1]).toContain('AI doctor')
    expect(items[2]).toContain('challenge')
  })

  it('marks the style quiz done and sends the next tap to the AI doctor', () => {
    const h = view({ spsPending: false })
    expect(screen.getAllByRole('listitem')[0].textContent).toContain('Done')
    fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[0])
    expect(h.onShowPrep).toHaveBeenCalled()
    expect(h.onTakeSps).not.toHaveBeenCalled()
  })
})
