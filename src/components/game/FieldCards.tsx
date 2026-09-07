'use client'
import { useT, useGameData } from '@/lib/i18n'
import type { StyleKey } from '@/types/game'

interface Props { onExit: () => void }

const COLOR: Record<StyleKey, string> = { driver: 'var(--purple)', expressive: 'var(--green)', amiable: 'var(--pink)', analytical: 'var(--cyan)' }

/** Splits a "·"-joined i18n string into individual list items. */
function items(s: string): string[] {
  return s.split('·').map(x => x.trim()).filter(Boolean)
}

export default function FieldCards({ onExit }: Props) {
  const t = useT()
  const { STYLES, STYLE_ORDER } = useGameData()

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 640, margin: '0 auto', padding: 14 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.4em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 6 }}>{t('fieldcard.title')}</div>
      <p style={{ color: 'var(--ink-dim)', fontSize: 14, lineHeight: 1.5, marginBottom: 18 }}>{t('fieldcard.subtitle')}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {STYLE_ORDER.map(key => {
          const s = STYLES[key]
          const c = COLOR[key]
          return (
            <div key={key} style={{ border: `1px solid ${c}`, borderRadius: 14, padding: 16, background: 'linear-gradient(180deg,var(--panel),#0a1430)', boxShadow: '0 10px 32px rgba(0,0,0,.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 20, color: c }}>{s.icon}</span>
                <b style={{ fontSize: 17, color: c }}>{s.name}</b>
                <span style={{ marginInlineStart: 'auto', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-dim)' }}>{t('fieldcard.labelTrigger')}: {s.drive}</span>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 3 }}>{t('fieldcard.labelSpot')}</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink)' }}>{t(`fieldcard.${key}.spot`)}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 3 }}>{t('fieldcard.labelDo')}</div>
                  <ul style={{ margin: 0, paddingInlineStart: 16, fontSize: 13, lineHeight: 1.5, color: 'var(--ink)' }}>
                    {items(t(`fieldcard.${key}.do`)).map((line, i) => <li key={i}>{line}</li>)}
                  </ul>
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--red)', marginBottom: 3 }}>{t('fieldcard.labelDont')}</div>
                  <ul style={{ margin: 0, paddingInlineStart: 16, fontSize: 13, lineHeight: 1.5, color: 'var(--ink)' }}>
                    {items(t(`fieldcard.${key}.dont`)).map((line, i) => <li key={i}>{line}</li>)}
                  </ul>
                </div>
              </div>

              <div style={{ borderRadius: 10, padding: '9px 12px', background: 'rgba(0,0,0,.25)', border: `1px solid ${c}` }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: c, marginBottom: 3 }}>{t('fieldcard.labelSay')}</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.5, fontStyle: 'italic', color: 'var(--ink)' }}>{t(`fieldcard.${key}.say`)}</div>
              </div>
            </div>
          )
        })}
      </div>

      <button
        onClick={onExit}
        style={{ marginTop: 18, width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.15em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'transparent', borderRadius: 10, padding: '12px 18px', touchAction: 'manipulation' }}
      >
        {t('fieldcard.back')}
      </button>
    </div>
  )
}
