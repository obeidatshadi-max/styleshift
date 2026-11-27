'use client'
/** Game and SPS content for the current language. Kept out of i18n.tsx so pages that are not the game
 * (login, landing, dashboard, verify ...) do not download the level and SPS text (review F9). */
import { useLang } from '@/lib/i18n'
import { STYLES, STYLE_ORDER, SPECIALTIES, SPECIALTY_ORDER, L1, L2, L3, L4, LEVELS, RANKS } from '@/lib/game-data'
import { STYLES_AR, SPECIALTIES_AR, L1_AR, L2_AR, L3_AR, L4_AR, LEVELS_AR, RANKS_AR } from '@/lib/game-data-ar'
import { SPS_QUESTIONS_EN, SPS_PROFILES_EN } from '@/lib/sps-data'
import { SPS_QUESTIONS_AR, SPS_PROFILES_AR } from '@/lib/sps-data-ar'

/** Returns the game content set for the current language. */
export function useGameData() {
  const { lang } = useLang()
  if (lang === 'ar') {
    return { STYLES: STYLES_AR, STYLE_ORDER, SPECIALTIES: SPECIALTIES_AR, SPECIALTY_ORDER, L1: L1_AR, L2: L2_AR, L3: L3_AR, L4: L4_AR, LEVELS: LEVELS_AR, RANKS: RANKS_AR }
  }
  return { STYLES, STYLE_ORDER, SPECIALTIES, SPECIALTY_ORDER, L1, L2, L3, L4, LEVELS, RANKS }
}

/** Returns the SPS assessment content set for the current language. */
export function useSpsData() {
  const { lang } = useLang()
  if (lang === 'ar') {
    return { SPS_QUESTIONS_TEXT: SPS_QUESTIONS_AR, SPS_PROFILES_TEXT: SPS_PROFILES_AR }
  }
  return { SPS_QUESTIONS_TEXT: SPS_QUESTIONS_EN, SPS_PROFILES_TEXT: SPS_PROFILES_EN }
}
