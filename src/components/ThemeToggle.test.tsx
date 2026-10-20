// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'
import ThemeToggle from './ThemeToggle'

afterEach(() => { cleanup(); localStorage.clear(); delete document.documentElement.dataset.theme; vi.restoreAllMocks() })

it('restores the bootstrapped preference and persists the next choice', () => {
  document.documentElement.dataset.theme = 'dark'
  render(<LanguageProvider><ThemeToggle /></LanguageProvider>)
  const button = screen.getByRole('button', { name: 'Use light appearance' })
  expect(button.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(button)
  expect(document.documentElement.dataset.theme).toBe('light')
  expect(localStorage.getItem('styleshift_theme')).toBe('light')
  expect(screen.getByRole('button', { name: 'Use dark appearance' })).toBeTruthy()
})

it('switches appearance when browser storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  render(<LanguageProvider><ThemeToggle /></LanguageProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Use dark appearance' }))
  expect(document.documentElement.dataset.theme).toBe('dark')
})

it('labels the appearance control in Arabic', () => {
  localStorage.setItem('styleshift_lang', 'ar')
  render(<LanguageProvider><ThemeToggle /></LanguageProvider>)
  expect(screen.getByRole('button', { name: 'استخدام المظهر الداكن' })).toBeTruthy()
})
