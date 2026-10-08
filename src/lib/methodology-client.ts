'use client'
import { useCallback, useEffect, useState } from 'react'
import { useLang, useT } from '@/lib/i18n'
import { dimensionTerm, termFor, type Methodology } from '@/schemas/methodology'
import type { CapabilityDimension } from '@/scoring/capability'

let cached: Promise<Methodology | null> | null = null

/** One fetch per page load. Any failure (feature off, offline, no methodology) simply means "use the app's own wording". */
function fetchMethodology(): Promise<Methodology | null> {
  cached ??= fetch('/api/methodologies/active')
    .then(r => (r.ok ? r.json() : null))
    .then(d => (d?.methodology ?? null) as Methodology | null)
    .catch(() => null)
  return cached
}

export function useMethodology(): Methodology | null {
  const [m, setM] = useState<Methodology | null>(null)
  useEffect(() => {
    let live = true
    void fetchMethodology().then(v => { if (live) setM(v) })
    return () => { live = false }
  }, [])
  return m
}

/** Label for a scoring-catalog behavior: the company's wording in the rep's own language if it set one,
 * else the app's own label. A company term written only in English is never shown inside an Arabic
 * screen (and the reverse), so the screen does not mix languages mid-sentence. */
export function useBehaviorLabel() {
  const t = useT()
  const { lang } = useLang()
  const m = useMethodology()
  return useCallback((behavior: string) => m?.terminology[behavior]?.[lang] ? termFor(m, behavior, lang) : t(`sim.beh.${behavior}`), [m, lang, t])
}

/** Name of a capability dimension: the company's wording if it set one, else the app's own. */
export function useDimensionLabel() {
  const t = useT()
  const { lang } = useLang()
  const m = useMethodology()
  return useCallback((d: CapabilityDimension) => dimensionTerm(m, d, lang, t(`cap.${d}`)), [m, lang, t])
}
