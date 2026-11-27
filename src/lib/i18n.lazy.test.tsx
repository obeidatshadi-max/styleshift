// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LanguageProvider, useLang, useT } from '@/lib/i18n'

afterEach(() => { cleanup(); localStorage.clear() })

function Probe() {
  const { lang, toggle } = useLang()
  const t = useT()
  return <button onClick={toggle}>{lang}:{t('toggle.switchTo')}</button>
}

// The Arabic text is a separate chunk (i18n-ar) loaded on demand; the switch waits for it,
// so the screen never shows raw keys.
it('switches to Arabic once its text has loaded, and back to English at once', async () => {
  render(<LanguageProvider><Probe /></LanguageProvider>)
  const button = screen.getByRole('button')
  expect(button.textContent?.startsWith('en:')).toBe(true)
  fireEvent.click(button)
  await screen.findByText(/^ar:/, {}, { timeout: 5000 })
  expect(button.textContent).not.toContain('toggle.switchTo')
  expect(document.documentElement.dir).toBe('rtl')
  await act(async () => { fireEvent.click(button) })
  expect(button.textContent?.startsWith('en:')).toBe(true)
})

it('restores a saved Arabic choice after mount', async () => {
  localStorage.setItem('styleshift_lang', 'ar')
  render(<LanguageProvider><Probe /></LanguageProvider>)
  await screen.findByText(/^ar:/, {}, { timeout: 5000 })
})
