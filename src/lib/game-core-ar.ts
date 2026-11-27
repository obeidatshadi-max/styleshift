import type { StyleDef, StyleKey, Specialty, SpecialtyDef, Rank } from '@/types/game'

/** Arabic mirror of game-core.ts. game-data-ar.ts re-exports these. */
export const STYLES_AR: Record<StyleKey, StyleDef> = {
  driver:     { name:'المسيطر',   cls:'driver',     icon:'▲', drive:'التحكم والإنجاز',   blurb:'حازم ومباشر، يركز على النتائج. يقرر بسرعة ويكره إضاعة الوقت.' },
  expressive: { name:'التعبيري',  cls:'expressive', icon:'✦', drive:'التقدير والأفكار',  blurb:'متحمس ومبدع ويحب التعاون. يحب الأفكار الكبيرة ويريد أن يُرى مميزاً.' },
  amiable:    { name:'الودود',    cls:'amiable',    icon:'♥', drive:'الأمان والانسجام',  blurb:'دافئ وصبور، يهتم بالعلاقات. يتجنب المخاطرة ويبحث عن التوافق.' },
  analytical: { name:'التحليلي',  cls:'analytical', icon:'◆', drive:'اليقين والدقة',     blurb:'دقيق ومنطقي، يعتمد على البيانات. يريد الأدلة ويأخذ وقته في التقييم.' },
}


export const SPECIALTIES_AR: Record<Specialty, SpecialtyDef> = {
  cardiology:           { name:'أمراض القلب',            icon:'♡' },
  endocrinology:        { name:'الغدد الصماء',            icon:'⚖' },
  oncology:             { name:'الأورام',                 icon:'✚' },
  pediatrics:           { name:'طب الأطفال',              icon:'★' },
  general_practice:     { name:'الطب العام',              icon:'●' },
  dermatology:          { name:'الأمراض الجلدية',         icon:'◐' },
  respiratory:          { name:'أمراض الجهاز التنفسي',    icon:'≈' },
  psychiatry_neurology: { name:'الطب النفسي والأعصاب',    icon:'◈' },
}


export const RANKS_AR: Rank[] = [
  { name:'مبتدئ',         minXp:0 },
  { name:'مندوب ميداني',  minXp:200 },
  { name:'قارئ الأساليب', minXp:500 },
  { name:'خبير الدوافع',  minXp:1000 },
  { name:'سيد الأسلوب',   minXp:2000 },
]

