'use client'
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { STYLES, STYLE_ORDER, L1, L2, L3, L4, LEVELS, RANKS } from '@/lib/game-data'
import { STYLES_AR, L1_AR, L2_AR, L3_AR, L4_AR, LEVELS_AR, RANKS_AR } from '@/lib/game-data-ar'
import type { BadgeName } from '@/types/game'

export type Lang = 'en' | 'ar'
const STORAGE_KEY = 'styleshift_lang'

// ---------------------------------------------------------------------------
// UI string dictionary. Values may contain {param} placeholders filled by t().
// ---------------------------------------------------------------------------
type Dict = Record<string, string>

const EN: Dict = {
  'eyebrow': 'Social Style Mastery Game',
  'tagline': 'Read the room · Win the call',
  // home
  'home.archetypes': 'Identify the Archetypes',
  'home.ladder': 'Progression Ladder',
  'home.mastery': 'Track Your Mastery',
  'style.socialStyle': 'Social Style',
  'style.coreDrive': 'Core Drive',
  'status.cleared': 'Cleared ✓',
  'status.ready': 'Ready',
  'status.locked': 'Locked',
  'nav.managerDashboard': 'Manager Dashboard →',
  'nav.createTeam': 'Create a Team →',
  'nav.signOut': 'Sign Out',
  'footer.tagline': 'StyleShift · Built on the Social Style Model (Driver · Expressive · Amiable · Analytical)',
  'footer.by': 'A training game by',
  // levels common
  'level.label': 'Level',
  'next': 'Next →',
  'seeResults': 'See Results',
  'home': 'Home',
  // L1
  'l1.title': 'Style Scan',
  'l1.unidentified': 'Unidentified profile · read the cues',
  'l1.classify': "CLASSIFY THIS PERSON'S SOCIAL STYLE",
  'l1.correct': 'Correct read',
  'l1.wrong': 'Re-read the cues',
  'l1.feedback': 'This is <b>{name}</b> — a <b style="color:var(--ink)">{style}</b>. Tell-tale signal: their drive is <b>{drive}</b>.',
  // L2
  'l2.title': 'Crisis Mode',
  'l2.underStress': '{style} — under stress',
  'l2.stressMeter': 'Stress Meter',
  'l2.win': 'Winning Strategy — stress down',
  'l2.lose': 'Escalation — stress up',
  // L3
  'l3.title': 'Drive Decoder',
  'l3.driveSatisfied': 'Drive satisfied',
  'l3.wrongDrive': 'Wrong drive',
  // L4
  'l4.title': 'The Formulary',
  'l4.globalQuota': 'Adoption',
  'l4.teamMorale': 'Trust',
  'l4.riskAssessment': 'Risk',
  'l4.balanced': 'Balanced move',
  'l4.offBalance': 'Off-balance',
  'l4.metersTag': ' <span style="color:var(--ink-dim)">[Adoption {quota} · Trust {morale} · Risk {risk}]</span>',
  // result
  'result.subtitle': 'Level {level} accuracy · {got}/{total} optimal moves',
  'result.dealBalanced': 'Committee won over',
  'result.dealUnbalanced': 'Committee unconvinced',
  'result.target': 'Target to clear: Adoption ≥ 60, Trust ≥ 50, Risk ≤ 50.',
  'result.confidence': 'Confidence self-assessment — how ready do you feel handling this style live?',
  'result.logContinue': 'Log & Continue',
  // rank / kpi
  'rank.max': 'MAX',
  'kpi.reactionTime': 'Reaction Time',
  'kpi.accuracyRate': 'Accuracy Rate',
  'kpi.confidence': 'Confidence',
  'kpi.targetRt': 'target < 2.1s',
  'kpi.targetAcc': 'target > 90%',
  'kpi.selfAssessed': 'self-assessed',
  'kpi.secondsUnit': 's',
  // login
  'login.email': 'Email',
  'login.password': 'Password',
  'login.signIn': 'Sign In',
  'login.createAccount': 'Create Account',
  'login.toSignup': "Don't have an account? Sign up",
  'login.toLogin': 'Already have an account? Sign in',
  'login.checkEmail': 'Check your email to confirm your account, then sign in.',
  // badges
  'badge.First Scan': 'First Scan',
  'badge.Crisis Tamer': 'Crisis Tamer',
  'badge.Drive Whisperer': 'Drive Whisperer',
  'badge.Boardroom Ace': 'Boardroom Ace',
  'badge.Style Master': 'Style Master',
  // daily challenge
  'daily.title': 'Daily Challenge',
  'daily.subtitle': 'One scenario. Everyone gets the same. Keep your streak alive.',
  'daily.play': "Play Today's Challenge",
  'daily.doneToday': 'Done today — see you tomorrow!',
  'daily.streakActive': '🔥 {n}-day streak',
  'daily.streakNone': 'Start your streak today',
  'daily.leaderboard': 'Team Leaderboard',
  'daily.you': 'You',
  'daily.empty': 'No one has played yet today — be first.',
  'daily.resultCorrect': 'Correct read 🎯',
  'daily.resultWrong': 'Missed it',
  'daily.streakNow': '🔥 {n}-day streak!',
  // toggle (label shows the language you switch TO)
  'toggle.switchTo': 'عربي',
}

const AR: Dict = {
  'eyebrow': 'لعبة إتقان الأسلوب الاجتماعي',
  'tagline': 'اقرأ الغرفة · اكسب الزيارة',
  'home.archetypes': 'تعرّف على الأنماط الأربعة',
  'home.ladder': 'سلّم التقدّم',
  'home.mastery': 'تتبّع مستوى إتقانك',
  'style.socialStyle': 'الأسلوب الاجتماعي',
  'style.coreDrive': 'الدافع الأساسي',
  'status.cleared': 'مكتمل ✓',
  'status.ready': 'جاهز',
  'status.locked': 'مقفل',
  'nav.managerDashboard': 'لوحة المدير ←',
  'nav.createTeam': 'أنشئ فريقاً ←',
  'nav.signOut': 'تسجيل الخروج',
  'footer.tagline': 'ستايل شيفت · مبني على نموذج الأسلوب الاجتماعي (المسيطر · التعبيري · الودود · التحليلي)',
  'footer.by': 'لعبة تدريبية من',
  'level.label': 'المستوى',
  'next': 'التالي ←',
  'seeResults': 'عرض النتائج',
  'home': 'الرئيسية',
  'l1.title': 'قراءة الأسلوب',
  'l1.unidentified': 'ملف غير محدد · اقرأ المؤشرات',
  'l1.classify': 'حدّد الأسلوب الاجتماعي لهذا الشخص',
  'l1.correct': 'قراءة صحيحة',
  'l1.wrong': 'أعد قراءة المؤشرات',
  'l1.feedback': 'هذا <b>{name}</b> — نمط <b style="color:var(--ink)">{style}</b>. المؤشر الأساسي: دافعه هو <b>{drive}</b>.',
  'l2.title': 'إدارة الضغط',
  'l2.underStress': '{style} — تحت الضغط',
  'l2.stressMeter': 'مقياس التوتر',
  'l2.win': 'استراتيجية رابحة — التوتر انخفض',
  'l2.lose': 'تصعيد — التوتر ارتفع',
  'l3.title': 'فهم الدوافع',
  'l3.driveSatisfied': 'الدافع أُشبع',
  'l3.wrongDrive': 'دافع خاطئ',
  'l4.title': 'لجنة الأدوية',
  'l4.globalQuota': 'التبني',
  'l4.teamMorale': 'الثقة',
  'l4.riskAssessment': 'المخاطرة',
  'l4.balanced': 'تحرك متوازن',
  'l4.offBalance': 'اختلال في التوازن',
  'l4.metersTag': ' <span style="color:var(--ink-dim)">[التبني {quota} · الثقة {morale} · المخاطرة {risk}]</span>',
  'result.subtitle': 'دقة المستوى {level} · {got}/{total} قرار مثالي',
  'result.dealBalanced': 'اللجنة اقتنعت',
  'result.dealUnbalanced': 'اللجنة غير مقتنعة',
  'result.target': 'المطلوب للنجاح: التبني ≥ 60، الثقة ≥ 50، المخاطرة ≤ 50.',
  'result.confidence': 'تقييم الثقة بالنفس — ما مدى استعدادك للتعامل مع هذا الأسلوب فعلياً؟',
  'result.logContinue': 'سجّل وتابع',
  'rank.max': 'الحد الأقصى',
  'kpi.reactionTime': 'زمن الاستجابة',
  'kpi.accuracyRate': 'معدل الدقة',
  'kpi.confidence': 'الثقة بالنفس',
  'kpi.targetRt': 'الهدف: أقل من 2.1 ث',
  'kpi.targetAcc': 'الهدف: أكثر من 90%',
  'kpi.selfAssessed': 'تقييم ذاتي',
  'kpi.secondsUnit': ' ث',
  'login.email': 'البريد الإلكتروني',
  'login.password': 'كلمة المرور',
  'login.signIn': 'تسجيل الدخول',
  'login.createAccount': 'إنشاء حساب',
  'login.toSignup': 'ليس لديك حساب؟ سجّل الآن',
  'login.toLogin': 'لديك حساب؟ سجّل الدخول',
  'login.checkEmail': 'تحقق من بريدك لتأكيد حسابك، ثم سجّل الدخول.',
  'badge.First Scan': 'أول قراءة',
  'badge.Crisis Tamer': 'مُهدِّئ الأزمات',
  'badge.Drive Whisperer': 'همس الدوافع',
  'badge.Boardroom Ace': 'نجم غرفة المفاوضات',
  'badge.Style Master': 'سيد الأسلوب',
  'daily.title': 'تحدي اليوم',
  'daily.subtitle': 'سيناريو واحد. الجميع يحصل على نفسه. حافظ على سلسلتك.',
  'daily.play': 'العب تحدي اليوم',
  'daily.doneToday': 'أُنجز اليوم — نراك غداً!',
  'daily.streakActive': '🔥 سلسلة {n} يوم',
  'daily.streakNone': 'ابدأ سلسلتك اليوم',
  'daily.leaderboard': 'ترتيب الفريق',
  'daily.you': 'أنت',
  'daily.empty': 'لم يلعب أحد اليوم بعد — كن الأول.',
  'daily.resultCorrect': 'قراءة صحيحة 🎯',
  'daily.resultWrong': 'لم تُصب',
  'daily.streakNow': '🔥 سلسلة {n} يوم!',
  'toggle.switchTo': 'EN',
}

const DICTS: Record<Lang, Dict> = { en: EN, ar: AR }

function format(str: string, params?: Record<string, string | number>): string {
  if (!params) return str
  return str.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''))
}

// ---------------------------------------------------------------------------
// Language context
// ---------------------------------------------------------------------------
interface LangContextValue {
  lang: Lang
  dir: 'ltr' | 'rtl'
  setLang: (l: Lang) => void
  toggle: () => void
}

const LangContext = createContext<LangContextValue | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  // Hydrate from localStorage after mount (server renders 'en' to avoid mismatch)
  useEffect(() => {
    const saved = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)) as Lang | null
    if (saved === 'ar' || saved === 'en') setLangState(saved)
  }, [])

  // Reflect language on <html> and persist
  useEffect(() => {
    const dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
    document.documentElement.dir = dir
    try { localStorage.setItem(STORAGE_KEY, lang) } catch { /* ignore */ }
  }, [lang])

  const setLang = useCallback((l: Lang) => setLangState(l), [])
  const toggle = useCallback(() => setLangState(l => (l === 'en' ? 'ar' : 'en')), [])

  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  return (
    <LangContext.Provider value={{ lang, dir, setLang, toggle }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used within LanguageProvider')
  return ctx
}

/** Returns a translator bound to the current language. */
export function useT() {
  const { lang } = useLang()
  return useCallback(
    (key: string, params?: Record<string, string | number>) => format(DICTS[lang][key] ?? key, params),
    [lang]
  )
}

/** Localized display label for a badge (badges are stored in DB by English name). */
export function useBadgeLabel() {
  const { lang } = useLang()
  return useCallback((badge: BadgeName) => DICTS[lang][`badge.${badge}`] ?? badge, [lang])
}

/** Returns the game content set for the current language. */
export function useGameData() {
  const { lang } = useLang()
  if (lang === 'ar') {
    return { STYLES: STYLES_AR, STYLE_ORDER, L1: L1_AR, L2: L2_AR, L3: L3_AR, L4: L4_AR, LEVELS: LEVELS_AR, RANKS: RANKS_AR }
  }
  return { STYLES, STYLE_ORDER, L1, L2, L3, L4, LEVELS, RANKS }
}
