'use client'
import { useLang, useT } from '@/lib/i18n'

export type Section = 'train' | 'rehearse' | 'perform' | 'coach'
const SECTIONS: Section[] = ['train', 'rehearse', 'perform', 'coach']

interface Props {
  activeSection: Section
  onSelectSection: (s: Section) => void
  showBack: boolean
  onBack: () => void
}

/**
 * Persistent nav rendered on every screen: the main sections (always
 * reachable, not just from the home tab bar) plus contextual Back/Home when
 * inside a sub-screen. Selecting a section always lands on its home tab —
 * this is the only nav surface, so it doubles as "go home".
 */
export default function AppNav({ activeSection, onSelectSection, showBack, onBack }: Props) {
  const t = useT()
  const { lang } = useLang()
  const labels: Record<Section, string> = lang === 'ar'
    ? { train: 'التدريب', rehearse: 'الطبيب الذكي', perform: 'تمثيل الأدوار', coach: 'المدرب الذكي' }
    : { train: 'Train', rehearse: 'AI Doctor', perform: 'Roleplay', coach: 'AI Coach' }

  return (
    <div className="app-nav">
      {showBack && (
        <div className="app-nav-context">
          <button onClick={onBack}>
            {t('nav.back')}
          </button>
          <button onClick={() => onSelectSection('train')}>
            {t('nav.home')}
          </button>
        </div>
      )}
      <div role="tablist" aria-label={t('nav.tabsLabel')} className="app-nav-tabs">
        {SECTIONS.map(s => (
          <button key={s} role="tab" aria-selected={activeSection === s} tabIndex={activeSection === s ? 0 : -1}
            onKeyDown={e => {
              const index = SECTIONS.indexOf(s)
              const rtl = document.documentElement.dir === 'rtl'
              let next = index
              if (e.key === 'ArrowRight') next = (index + (rtl ? -1 : 1) + SECTIONS.length) % SECTIONS.length
              else if (e.key === 'ArrowLeft') next = (index + (rtl ? 1 : -1) + SECTIONS.length) % SECTIONS.length
              else if (e.key === 'Home') next = 0
              else if (e.key === 'End') next = SECTIONS.length - 1
              else return
              e.preventDefault()
              onSelectSection(SECTIONS[next])
              e.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus()
            }}
            onClick={() => onSelectSection(s)} className="app-nav-tab">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {s === 'train' && <><path d="m3 10 9-7 9 7v10H3Z" /><path d="M9 20v-7h6v7" /></>}
              {s === 'rehearse' && <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4Z" /></>}
              {s === 'perform' && <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /><path d="M16 3a4 4 0 0 1 0 8" /></>}
              {s === 'coach' && <><path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z" /><path d="M8 10h8m-8 4h5" /></>}
            </svg>
            <span>{labels[s]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
