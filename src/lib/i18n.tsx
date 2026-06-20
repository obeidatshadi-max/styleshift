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
  'login.confirmError': 'That activation link has expired or was already used. Please sign in, or sign up again to get a fresh link.',
  // badges
  'badge.First Scan': 'First Scan',
  'badge.Crisis Tamer': 'Crisis Tamer',
  'badge.Drive Whisperer': 'Drive Whisperer',
  'badge.Boardroom Ace': 'Boardroom Ace',
  'badge.Style Master': 'Style Master',
  // daily challenge
  'daily.title': 'Daily Challenge',
  'daily.subtitle': 'Three quick scenarios — one per level. Everyone gets the same set. Finish all three to keep your streak.',
  'daily.play': "Play Today's Challenge",
  'daily.continue': 'Continue',
  'daily.progress': 'Daily Challenge · {n}/{total}',
  'daily.todayProgress': '{done}/{total} today',
  'daily.doneToday': 'Done today — see you tomorrow!',
  'daily.streakActive': '🔥 {n}-day streak',
  'daily.streakNone': 'Start your streak today',
  'daily.leaderboard': 'Team Leaderboard',
  'daily.you': 'You',
  'daily.empty': 'No one has played yet today — be first.',
  'daily.resultCorrect': 'Correct read 🎯',
  'daily.resultWrong': 'Missed it',
  'daily.streakNow': '🔥 {n}-day streak!',
  'daily.streakRisk': "🔥 {n}-day streak at risk — finish today's set to keep it!",
  // champion spotlight
  'champion.weekly': 'Champion of the Week',
  'champion.today': "Today's leader: {name}",
  'champion.empty': 'No champion yet — be the first this week',
  'champion.share': 'Share to WhatsApp',
  'champion.thisWeek': 'This Week',
  // cross-team league
  'league.title': 'Team League',
  'league.yourRank': 'your team #{n} of {total}',
  'league.avgPerRep': 'Avg XP / rep',
  'league.team': 'Team',
  'league.rank': 'Rank',
  // coach assignment
  'assign.title': 'Coach Assignment',
  'assign.targetCategory': '{category} — objection drills',
  'assign.targetLevel': 'Level {level} · {title}',
  'assign.due': 'Due {date}',
  'assign.overdue': 'Overdue — was due {date}',
  'assign.done': 'Completed ✓ Nice work.',
  'assign.start': 'Start',
  'assign.progressTitle': 'Coach Drill · {n}/{total}',
  // team ranking (rep-facing)
  'rank.title': 'Team Ranking',
  'rank.subtitle': 'How your team stacks up by total XP.',
  'rank.yourPosition': "You're #{n} of {total} on your team.",
  'rank.you': 'You',
  // profile photo
  'avatar.title': 'Your photo',
  'avatar.hint': 'Add a photo — it appears on your recognition card if you top the team.',
  'avatar.error': "Couldn't upload — use an image under 5 MB.",
  'avatar.add': 'Add photo',
  'avatar.change': 'Change',
  'avatar.uploading': 'Uploading…',
  // how it works
  'how.reopen': 'How it works',
  'how.skip': 'Skip',
  'how.next': 'Next',
  'how.back': 'Back',
  'how.start': 'Start playing',
  'how.s1.eyebrow': 'How it works',
  'how.s1.title': 'Read the room. Win the call.',
  'how.s1.body': "StyleShift trains you to read a doctor's or pharmacist's social style — and adapt your pitch in seconds.",
  'how.s2.title': 'Four social styles',
  'how.s2.body': 'Every customer leans toward one. Spot it from how they behave.',
  'how.s3.title': 'Four levels, rising challenge',
  'how.s3.body': 'Clear one level to unlock the next.',
  'how.verb1': 'Recognize',
  'how.verb2': 'React',
  'how.verb3': 'Motivate',
  'how.verb4': 'Orchestrate',
  'how.s4.title': 'Level up & keep your streak',
  'how.s4.xp': 'Earn XP to climb from Rookie to Style Master.',
  'how.s4.daily': "Play the Daily Challenge to build a 🔥 streak and climb your team's leaderboard.",
  // visit prep
  'prep.reopen': 'Visit Prep',
  'prep.title': 'Visit Prep',
  'prep.subtitle': 'Prep for your next call — save a doctor, get a cheat-sheet and matched drills.',
  'prep.myDoctors': 'My Doctors',
  'prep.addDoctor': '+ Add a doctor',
  'prep.empty': 'No doctors saved yet. Add the first one to prep for your next visit.',
  'prep.name': 'Name',
  'prep.specialty': 'Specialty',
  'prep.workplace': 'Workplace (clinic / hospital / pharmacy)',
  'prep.style': 'Social style',
  'prep.styleKnown': 'I know their style',
  'prep.styleHelp': 'Help me identify it',
  'prep.axisAssert': 'How do they communicate?',
  'prep.axisAssertAsk': 'Asks · reserved · slower',
  'prep.axisAssertTell': 'Asserts · direct · fast',
  'prep.axisResp': 'What do they focus on?',
  'prep.axisRespControls': 'Task · facts · controlled',
  'prep.axisRespEmotes': 'People · feelings · expressive',
  'prep.derived': 'Likely style:',
  'prep.keyPhrases': 'Key phrases they usually say',
  'prep.keyPhrasesHint': 'e.g. "just give me the bottom line"',
  'prep.objections': 'Objections you anticipate',
  'prep.notes': 'Notes',
  'prep.save': 'Save doctor',
  'prep.cancel': 'Cancel',
  'prep.delete': 'Delete',
  'prep.edit': 'Edit',
  'prep.prepFor': 'Prep for {name}',
  'prep.cheatTitle': 'Cheat-sheet',
  'prep.dos': 'Do',
  'prep.donts': 'Avoid',
  'prep.opener': 'Opening line',
  'prep.warmUp': 'Warm up · {n} drills',
  'prep.start': 'Start warm-up',
  'prep.warmUpDone': "Warm-up complete 💪 You're ready for the call.",
  'prep.backToList': '← My Doctors',
  'obj.evidence': 'Evidence / data',
  'obj.price': 'Price / cost',
  'obj.safety': 'Safety / side effects',
  'obj.time': 'Time / too busy',
  'obj.competitor': 'Competitor',
  'obj.logistics': 'Stock / delivery',
  'obj.trust': 'Trust / relationship',
  'prep.cheat.driver.do1': 'Lead with the result or bottom line',
  'prep.cheat.driver.do2': 'Quantify the improvement',
  'prep.cheat.driver.do3': 'Offer two options and let them choose',
  'prep.cheat.driver.dont1': 'Long introductions or backstory',
  'prep.cheat.driver.dont2': 'Storytelling or emotional appeals',
  'prep.cheat.driver.opener': 'Two routes to your target, with the numbers — your call.',
  'prep.cheat.expressive.do1': 'Open with a bold vision or patient success story',
  'prep.cheat.expressive.do2': 'Recognize them; ask their opinion',
  'prep.cheat.expressive.do3': 'Match their energy and pace',
  'prep.cheat.expressive.dont1': 'Monotone or overly technical detail',
  'prep.cheat.expressive.dont2': 'Negativity or dwelling on risk',
  'prep.cheat.expressive.opener': 'Imagine your patients improving in week one — and you presenting it.',
  'prep.cheat.amiable.do1': 'Show genuine care for patient comfort',
  'prep.cheat.amiable.do2': 'Reinforce safety and reliability',
  'prep.cheat.amiable.do3': 'Offer a gradual start with your support',
  'prep.cheat.amiable.dont1': "Pressure or 'you must prescribe'",
  'prep.cheat.amiable.dont2': 'Rushing the relationship or decision',
  'prep.cheat.amiable.opener': "We'll start small, I'll support you personally, and we can pause anytime.",
  'prep.cheat.analytical.do1': 'Lead with the trial data and sample size',
  'prep.cheat.analytical.do2': 'Use charts; allow silence to think',
  'prep.cheat.analytical.do3': 'Offer to send the full study afterward',
  'prep.cheat.analytical.dont1': 'Emotional persuasion or vague claims',
  'prep.cheat.analytical.dont2': 'Rushing the decision',
  'prep.cheat.analytical.opener': "Here's the head-to-head study and the number needed to treat.",
  'prep.aiDrill': '✨ AI bespoke drill',
  'prep.aiPremium': 'Premium',
  'prep.aiIntro': "A one-off scenario built from {name}'s own phrases and the objection you anticipate.",
  'prep.aiGenerating': 'Crafting a scenario for {name}…',
  'prep.aiError': "Couldn't generate right now — try the warm-up instead.",
  'prep.aiNotConfigured': 'Launching soon — coming to your account.',
  'prep.aiBack': '← Back',
  'prep.aiSoon': 'Premium · Coming soon',
  'prep.aiTeaser': "This premium feature generates a brand-new role-play in {name}'s own voice — using the phrases and objection you saved — so you can rehearse the exact call before you walk in.",
  // rep mobile login
  'login.repTab': 'Rep · Mobile',
  'login.managerTab': 'Manager · Email',
  'login.mobileLabel': 'Mobile number',
  'login.mobileSignIn': 'Sign In',
  'login.mobileHint': 'First time? Use the invite link from your manager.',
  'login.mobileLoginFailed': 'Sign-in failed. Try the invite link again.',
  // join via invite link
  'join.eyebrow': 'Team Invite',
  'join.subtitle': 'Join your team',
  'join.yourName': 'Your name',
  'join.mobilePlaceholder': 'Mobile number (e.g. 07901234567)',
  'join.submit': 'Join Team →',
  'join.loading': 'Joining…',
  'join.hint': 'Your mobile number is your login — no email or password needed.',
  'join.welcome': 'Welcome to {name}!',
  'join.redirecting': 'Taking you to the game…',
  'join.otpError': 'Sign-in failed. Please try again.',
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
  'login.confirmError': 'انتهت صلاحية رابط التفعيل أو تم استخدامه من قبل. الرجاء تسجيل الدخول، أو إنشاء حساب مرة أخرى للحصول على رابط جديد.',
  'badge.First Scan': 'أول قراءة',
  'badge.Crisis Tamer': 'مُهدِّئ الأزمات',
  'badge.Drive Whisperer': 'همس الدوافع',
  'badge.Boardroom Ace': 'نجم غرفة المفاوضات',
  'badge.Style Master': 'سيد الأسلوب',
  'daily.title': 'تحدي اليوم',
  'daily.subtitle': 'ثلاثة سيناريوهات سريعة — واحد لكل مستوى. الجميع يحصل على المجموعة نفسها. أكمل الثلاثة للحفاظ على سلسلتك.',
  'daily.play': 'العب تحدي اليوم',
  'daily.continue': 'متابعة',
  'daily.progress': 'التحدي اليومي · {n}/{total}',
  'daily.todayProgress': '{done}/{total} اليوم',
  'daily.doneToday': 'أُنجز اليوم — نراك غداً!',
  'daily.streakActive': '🔥 سلسلة {n} يوم',
  'daily.streakNone': 'ابدأ سلسلتك اليوم',
  'daily.leaderboard': 'ترتيب الفريق',
  'daily.you': 'أنت',
  'daily.empty': 'لم يلعب أحد اليوم بعد — كن الأول.',
  'daily.resultCorrect': 'قراءة صحيحة 🎯',
  'daily.resultWrong': 'لم تُصب',
  'daily.streakNow': '🔥 سلسلة {n} يوم!',
  'daily.streakRisk': '🔥 سلسلة {n} يوم في خطر — أكمل مجموعة اليوم للحفاظ عليها!',
  // champion spotlight
  'champion.weekly': 'بطل الأسبوع',
  'champion.today': 'متصدّر اليوم: {name}',
  'champion.empty': 'لا يوجد بطل بعد — كن أول أبطال هذا الأسبوع',
  'champion.share': 'شارك عبر واتساب',
  'champion.thisWeek': 'هذا الأسبوع',
  // cross-team league
  'league.title': 'دوري الفرق',
  'league.yourRank': 'فريقك #{n} من {total}',
  'league.avgPerRep': 'متوسط النقاط / مندوب',
  'league.team': 'الفريق',
  'league.rank': 'الترتيب',
  // coach assignment
  'assign.title': 'مهمة المدرب',
  'assign.targetCategory': '{category} — تمارين اعتراضات',
  'assign.targetLevel': 'المستوى {level} · {title}',
  'assign.due': 'الموعد النهائي {date}',
  'assign.overdue': 'متأخرة — كان الموعد {date}',
  'assign.done': 'اكتملت ✓ أحسنت.',
  'assign.start': 'ابدأ',
  'assign.progressTitle': 'تمرين المدرب · {n}/{total}',
  // team ranking (rep-facing)
  'rank.title': 'ترتيب الفريق',
  'rank.subtitle': 'كيف يتفوّق فريقك بحسب مجموع نقاط الخبرة.',
  'rank.yourPosition': 'أنت رقم {n} من {total} في فريقك.',
  'rank.you': 'أنت',
  // profile photo
  'avatar.title': 'صورتك',
  'avatar.hint': 'أضف صورة — ستظهر على بطاقة التكريم إذا تصدّرت فريقك.',
  'avatar.error': 'تعذّر الرفع — استخدم صورة أقل من 5 ميغابايت.',
  'avatar.add': 'أضف صورة',
  'avatar.change': 'تغيير',
  'avatar.uploading': 'جارٍ الرفع…',
  'how.reopen': 'كيف تلعب',
  'how.skip': 'تخطّي',
  'how.next': 'التالي',
  'how.back': 'السابق',
  'how.start': 'ابدأ اللعب',
  'how.s1.eyebrow': 'كيف تلعب',
  'how.s1.title': 'اقرأ الغرفة. اكسب الزيارة.',
  'how.s1.body': 'يدرّبك ستايل شيفت على قراءة الأسلوب الاجتماعي للطبيب أو الصيدلي — وتكييف عرضك في ثوانٍ.',
  'how.s2.title': 'أربعة أساليب اجتماعية',
  'how.s2.body': 'كل عميل يميل إلى واحد منها. اكتشفه من طريقة تصرّفه.',
  'how.s3.title': 'أربعة مستويات بتحدٍّ متصاعد',
  'how.s3.body': 'أكمل مستوى لتفتح التالي.',
  'how.verb1': 'تعرّف',
  'how.verb2': 'تجاوب',
  'how.verb3': 'حفّز',
  'how.verb4': 'أدِر',
  'how.s4.title': 'ارتقِ وحافظ على سلسلتك',
  'how.s4.xp': 'اكسب نقاط الخبرة لترتقي من مبتدئ إلى سيد الأسلوب.',
  'how.s4.daily': 'العب تحدي اليوم لبناء سلسلة 🔥 وتسلّق ترتيب فريقك.',
  'prep.reopen': 'تحضير الزيارة',
  'prep.title': 'تحضير الزيارة',
  'prep.subtitle': 'حضّر لزيارتك القادمة — احفظ طبيباً واحصل على بطاقة إرشاد وتمارين مطابقة.',
  'prep.myDoctors': 'أطبائي',
  'prep.addDoctor': '+ أضف طبيباً',
  'prep.empty': 'لا أطباء محفوظون بعد. أضف الأول لتحضّر لزيارتك القادمة.',
  'prep.name': 'الاسم',
  'prep.specialty': 'التخصص',
  'prep.workplace': 'مكان العمل (عيادة / مستشفى / صيدلية)',
  'prep.style': 'الأسلوب الاجتماعي',
  'prep.styleKnown': 'أعرف أسلوبه',
  'prep.styleHelp': 'ساعدني في تحديده',
  'prep.axisAssert': 'كيف يتواصل؟',
  'prep.axisAssertAsk': 'يسأل · متحفّظ · أبطأ',
  'prep.axisAssertTell': 'يؤكّد · مباشر · سريع',
  'prep.axisResp': 'على ماذا يركّز؟',
  'prep.axisRespControls': 'المهمة · الحقائق · منضبط',
  'prep.axisRespEmotes': 'الناس · المشاعر · معبّر',
  'prep.derived': 'الأسلوب المرجّح:',
  'prep.keyPhrases': 'عبارات يقولها عادةً',
  'prep.keyPhrasesHint': 'مثال: «أعطني الخلاصة مباشرة»',
  'prep.objections': 'الاعتراضات المتوقعة',
  'prep.notes': 'ملاحظات',
  'prep.save': 'احفظ الطبيب',
  'prep.cancel': 'إلغاء',
  'prep.delete': 'حذف',
  'prep.edit': 'تعديل',
  'prep.prepFor': 'التحضير لـ {name}',
  'prep.cheatTitle': 'بطاقة الإرشاد',
  'prep.dos': 'افعل',
  'prep.donts': 'تجنّب',
  'prep.opener': 'جملة الافتتاح',
  'prep.warmUp': 'إحماء · {n} تمارين',
  'prep.start': 'ابدأ الإحماء',
  'prep.warmUpDone': 'اكتمل الإحماء 💪 أنت جاهز للزيارة.',
  'prep.backToList': '← أطبائي',
  'obj.evidence': 'الأدلة / البيانات',
  'obj.price': 'السعر / التكلفة',
  'obj.safety': 'الأمان / الأعراض الجانبية',
  'obj.time': 'الوقت / الانشغال',
  'obj.competitor': 'المنافس',
  'obj.logistics': 'التوفّر / التوريد',
  'obj.trust': 'الثقة / العلاقة',
  'prep.cheat.driver.do1': 'ابدأ بالنتيجة أو الخلاصة',
  'prep.cheat.driver.do2': 'حدّد التحسّن بالأرقام',
  'prep.cheat.driver.do3': 'اعرض خيارين ودعه يختار',
  'prep.cheat.driver.dont1': 'المقدمات الطويلة أو سرد الخلفية',
  'prep.cheat.driver.dont2': 'القصص أو المناشدات العاطفية',
  'prep.cheat.driver.opener': '«مساران لتحقيق هدفك، مع الأرقام — القرار لك.»',
  'prep.cheat.expressive.do1': 'ابدأ برؤية جريئة أو قصة نجاح مريض',
  'prep.cheat.expressive.do2': 'اعترف بمكانته واسأل عن رأيه',
  'prep.cheat.expressive.do3': 'جارِ طاقته وإيقاعه',
  'prep.cheat.expressive.dont1': 'النبرة الرتيبة أو التفاصيل التقنية الزائدة',
  'prep.cheat.expressive.dont2': 'السلبية أو التركيز على المخاطر',
  'prep.cheat.expressive.opener': '«تخيّل مرضاك يتحسّنون من الأسبوع الأول — وأنت تعرض ذلك.»',
  'prep.cheat.amiable.do1': 'أظهر اهتماماً صادقاً براحة المريض',
  'prep.cheat.amiable.do2': 'عزّز الأمان والموثوقية',
  'prep.cheat.amiable.do3': 'اعرض بداية تدريجية مع دعمك',
  'prep.cheat.amiable.dont1': 'الضغط أو «يجب أن تصف»',
  'prep.cheat.amiable.dont2': 'استعجال العلاقة أو القرار',
  'prep.cheat.amiable.opener': '«سنبدأ بهدوء، وسأدعمك شخصياً، ويمكننا التوقف في أي وقت.»',
  'prep.cheat.analytical.do1': 'ابدأ ببيانات التجربة وحجم العينة',
  'prep.cheat.analytical.do2': 'استخدم الرسوم؛ اترك له وقتاً للتفكير',
  'prep.cheat.analytical.do3': 'اعرض إرسال الدراسة كاملة لاحقاً',
  'prep.cheat.analytical.dont1': 'الإقناع العاطفي أو الادعاءات الغامضة',
  'prep.cheat.analytical.dont2': 'استعجال القرار',
  'prep.cheat.analytical.opener': '«إليك دراسة المقارنة المباشرة وعدد المرضى اللازم علاجهم.»',
  'prep.aiDrill': '✨ تمرين مخصّص بالذكاء',
  'prep.aiPremium': 'مميّز',
  'prep.aiIntro': 'سيناريو فريد مبني على عبارات {name} والاعتراض الذي تتوقعه.',
  'prep.aiGenerating': 'نُعدّ سيناريو لـ {name}…',
  'prep.aiError': 'تعذّر التوليد الآن — جرّب الإحماء بدلاً من ذلك.',
  'prep.aiNotConfigured': 'سيُطلق قريباً — قادم إلى حسابك.',
  'prep.aiBack': '← رجوع',
  'prep.aiSoon': 'مميّز · قريباً',
  'prep.aiTeaser': 'تولّد هذه الميزة المميّزة تمثيلاً جديداً بصوت {name} — باستخدام العبارات والاعتراض الذي حفظته — لتتدرّب على الزيارة الحقيقية قبل دخولها.',
  // rep mobile login
  'login.repTab': 'مندوب · جوال',
  'login.managerTab': 'مدير · بريد',
  'login.mobileLabel': 'رقم الجوال',
  'login.mobileSignIn': 'دخول',
  'login.mobileHint': 'أول مرة؟ استخدم رابط الدعوة من مديرك.',
  'login.mobileLoginFailed': 'فشل الدخول. جرّب رابط الدعوة مرة أخرى.',
  // join via invite link
  'join.eyebrow': 'دعوة للفريق',
  'join.subtitle': 'انضم إلى فريقك',
  'join.yourName': 'اسمك',
  'join.mobilePlaceholder': 'رقم الجوال (مثال: 07901234567)',
  'join.submit': 'انضم للفريق ←',
  'join.loading': 'جارٍ الانضمام…',
  'join.hint': 'رقم جوالك هو بيانات دخولك — لا بريد إلكتروني أو كلمة مرور.',
  'join.welcome': 'أهلاً في {name}!',
  'join.redirecting': 'ننتقل إلى اللعبة…',
  'join.otpError': 'فشل تسجيل الدخول. الرجاء المحاولة مرة أخرى.',
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
