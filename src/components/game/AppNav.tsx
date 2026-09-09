'use client'
import { useT } from '@/lib/i18n'

export type Section = 'train' | 'rehearse' | 'perform'
const SECTIONS: Section[] = ['train', 'rehearse', 'perform']

interface Props {
  activeSection: Section
  onSelectSection: (s: Section) => void
  showBack: boolean
  onBack: () => void
}

/**
 * Persistent nav rendered on every screen: the three main sections (always
 * reachable, not just from the home tab bar) plus contextual Back/Home when
 * inside a sub-screen. Selecting a section always lands on its home tab —
 * this is the only nav surface, so it doubles as "go home".
 */
export default function AppNav({ activeSection, onSelectSection, showBack, onBack }: Props) {
  const t = useT()
  const tabStyle = (active: boolean) => ({
    flex: 1, cursor: 'pointer' as const, fontFamily: 'var(--mono)', fontSize: 11,
    letterSpacing: '.12em', textTransform: 'uppercase' as const, padding: '10px 6px',
    background: 'none', border: 'none',
    borderBottom: active ? '2px solid var(--cyan)' : '2px solid transparent',
    color: active ? 'var(--cyan)' : 'var(--ink-dim)',
  })

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 1040, margin: '0 auto', padding: '10px 14px 0' }}>
      {showBack && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', color: 'var(--ink-dim)' }}>
            {t('nav.back')}
          </button>
          <button onClick={() => onSelectSection('train')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', color: 'var(--ink-dim)' }}>
            {t('nav.home')}
          </button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--line)' }}>
        {SECTIONS.map(s => (
          <button key={s} onClick={() => onSelectSection(s)} style={tabStyle(activeSection === s)}>
            {t(`nav.tab${s[0].toUpperCase()}${s.slice(1)}`)}
          </button>
        ))}
      </div>
    </div>
  )
}
