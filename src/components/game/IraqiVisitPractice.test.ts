// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LanguageProvider, preloadArabic } from '@/lib/i18n'
import { IraqiVisitPractice } from './IraqiVisitPractice'
import { IRAQI_VISIT_SCENARIOS } from '@/lib/iraqi-visit-scenarios'

afterEach(() => { cleanup(); localStorage.clear() })

describe('Iraqi visit practice', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`starts each scenario with its full ${lang} practice context`, async () => {
      localStorage.setItem('styleshift_lang', lang)
      await preloadArabic()
      const onPractice = vi.fn()
      render(createElement(LanguageProvider, null, createElement(IraqiVisitPractice, { onPractice })))
      await act(async () => {})
      fireEvent.click(screen.getByText(lang === 'en' ? 'Practice an Iraqi visit situation' : 'تدرّب على موقف من الزيارات في العراق'))
      for (const scenario of IRAQI_VISIT_SCENARIOS) {
        fireEvent.click(screen.getByRole('button', { name: scenario[lang].title }))
        expect(onPractice).toHaveBeenLastCalledWith(scenario[lang].focus)
        expect(scenario[lang].focus.length).toBeLessThanOrEqual(1200)
      }
      expect(onPractice).toHaveBeenCalledTimes(6)
    })
  }
})
