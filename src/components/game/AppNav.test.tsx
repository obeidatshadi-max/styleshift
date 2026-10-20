// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'
import AppNav, { type Section } from './AppNav'

afterEach(() => { cleanup(); localStorage.clear(); document.documentElement.dir = 'ltr' })
function View() {
  const [active, setActive] = useState<Section>('train')
  return <LanguageProvider><AppNav activeSection={active} onSelectSection={setActive} showBack onBack={vi.fn()} /></LanguageProvider>
}

it('keeps every main section reachable by touch', () => {
  render(<View />)
  for (const name of ['AI Doctor', 'Roleplay', 'AI Coach', 'Train']) {
    fireEvent.click(screen.getByRole('tab', { name }))
    expect(screen.getByRole('tab', { name }).getAttribute('aria-selected')).toBe('true')
  }
})

it('moves keyboard focus and selection between tabs', () => {
  render(<View />)
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Train' }), { key: 'ArrowRight' })
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'AI Doctor' }))
  expect(screen.getByRole('tab', { name: 'AI Doctor' }).getAttribute('aria-selected')).toBe('true')
  fireEvent.keyDown(document.activeElement!, { key: 'End' })
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'AI Coach' }))
})

it('reverses arrow navigation for Arabic', () => {
  localStorage.setItem('styleshift_lang', 'ar')
  render(<View />)
  fireEvent.keyDown(screen.getByRole('tab', { name: 'التدريب' }), { key: 'ArrowLeft' })
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'الطبيب الذكي' }))
  expect(screen.getByRole('tab', { name: 'الطبيب الذكي' }).getAttribute('aria-selected')).toBe('true')
})
