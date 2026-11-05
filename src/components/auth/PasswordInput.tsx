'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  autoComplete?: string
  inputMode?: 'numeric' | 'text'
  maxLength?: number
  required?: boolean
  style?: React.CSSProperties
}

/** A password box with a Show / Hide button. Works the same for passwords and the rep's numeric PIN.
 * The button sits at the end of the box (the right in English, the left in Arabic). */
export default function PasswordInput({ value, onChange, placeholder, ariaLabel, autoComplete, inputMode, maxLength, required, style }: Props) {
  const t = useT()
  const [shown, setShown] = useState(false)
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        type={shown ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} aria-label={ariaLabel} autoComplete={autoComplete} inputMode={inputMode}
        maxLength={maxLength} required={required} autoCapitalize="none" autoCorrect="off" spellCheck={false}
        style={{ ...style, paddingInlineEnd: 76 }}
      />
      <button type="button" onClick={() => setShown(s => !s)} aria-pressed={shown}
        aria-label={shown ? t('login.hidePassword') : t('login.showPassword')}
        style={{
          position: 'absolute', insetBlock: 6, insetInlineEnd: 6, minWidth: 60, padding: '0 10px', borderRadius: 8,
          border: 'none', background: 'transparent', color: 'var(--cyan)', cursor: 'pointer',
          fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 700, touchAction: 'manipulation',
        }}>
        {shown ? t('login.hide') : t('login.show')}
      </button>
    </div>
  )
}
