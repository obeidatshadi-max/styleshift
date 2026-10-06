/** Fictional practice situations, not inferred traits of real Iraqi doctors. */
export const IRAQI_VISIT_SCENARIOS = [
  {
    id: 'time-pressure',
    en: { title: 'A rushed visit', focus: 'Fictional Iraqi clinic visit: the doctor has patients waiting and asks for a brief explanation. Practise asking permission, identifying one priority and agreeing on a suitable next step. Do not interpret brevity as anxiety or a fixed personality.' },
    ar: { title: 'زيارة بوقت ضيّق', focus: 'موقف افتراضي في عيادة عراقية: لدى الطبيب مرضى ينتظرون ويطلب شرحاً مختصراً. تدرّب على الاستئذان وتحديد أولوية واحدة والاتفاق على خطوة مناسبة. لا تفسّر الاختصار على أنه قلق أو شخصية ثابتة.' },
  },
  {
    id: 'product-similarity',
    en: { title: '“Your product is the same”', focus: 'Fictional Iraqi visit: the doctor asks why your product is worth considering when it seems similar to others. Practise clarifying which difference matters to their patients before responding. Use only supplied evidence; do not invent product advantages or assume a hidden motive.' },
    ar: { title: '«منتجكم نفس البقية»', focus: 'زيارة عراقية افتراضية: يسأل الطبيب لماذا يستحق منتجك النظر وهو يبدو مشابهاً لغيره. تدرّب على استيضاح الفرق المهم لمرضاه قبل الرد. استخدم الأدلة المتاحة فقط، ولا تخترع مزايا للمنتج أو تفترض دافعاً خفياً.' },
  },
  {
    id: 'professional-respect',
    en: { title: 'Respecting clinical judgment', focus: 'Fictional Iraqi visit: the doctor says their treatment choices depend on experience with their patients. Practise exploring decision criteria respectfully without implying their current judgment is wrong. The doctor can welcome genuine curiosity; do not assume ego or defensiveness.' },
    ar: { title: 'احترام القرار المهني', focus: 'زيارة عراقية افتراضية: يقول الطبيب إن خياراته العلاجية تعتمد على خبرته مع مرضاه. تدرّب على استكشاف معايير الاختيار باحترام دون الإيحاء بأن قراره الحالي خاطئ. قد يرحّب الطبيب بالسؤال الصادق؛ لا تفترض الغرور أو الدفاعية.' },
  },
  {
    id: 'indirect-objection',
    en: { title: 'A story with an unclear concern', focus: 'Fictional Iraqi visit: the doctor tells a short story about a previous company visit instead of directly answering the rep. Practise summarizing what was actually said and checking which concern matters now. Do not assume the story or slow delivery means pretence, indifference or agreement.' },
    ar: { title: 'قصة وقلق غير واضح', focus: 'زيارة عراقية افتراضية: يروي الطبيب قصة قصيرة عن زيارة سابقة لشركة بدلاً من الرد المباشر. تدرّب على تلخيص ما قاله فعلاً والتحقق من النقطة التي تهمه الآن. لا تفترض أن القصة أو بطء الكلام يعني التصنّع أو اللامبالاة أو الموافقة.' },
  },
  {
    id: 'missed-follow-up',
    en: { title: 'An overdue follow-up', focus: 'Fictional Iraqi follow-up visit: the doctor explicitly says a promised evidence summary never arrived. Practise acknowledging the missed commitment, clarifying what is still needed and proposing a realistic follow-up. Do not invent an excuse or a completed action; agree on timing with the doctor.' },
    ar: { title: 'متابعة لم تُنجز', focus: 'زيارة متابعة عراقية افتراضية: يقول الطبيب صراحة إن ملخص الأدلة الذي وُعد به لم يصله. تدرّب على الإقرار بالوعد غير المنجز واستيضاح الحاجة الحالية واقتراح متابعة واقعية. لا تختلق عذراً أو تدّعي إنجازاً؛ اتفق مع الطبيب على الموعد.' },
  },
  {
    id: 'ambiguous-support',
    en: { title: '“What support can you offer?”', focus: 'Fictional Iraqi visit: the doctor asks what support the company offers, without specifying the kind. Practise a neutral clarifying question. In this scenario the doctor means patient education materials and should explain that when asked. Do not assume a personal benefit or offer anything in exchange for prescribing.' },
    ar: { title: '«شنو الدعم اللي تقدموه؟»', focus: 'زيارة عراقية افتراضية: يسأل الطبيب عن دعم الشركة دون تحديد نوعه. تدرّب على سؤال استيضاح محايد. في هذا الموقف يقصد الطبيب مواد تثقيف للمرضى ويوضح ذلك عند سؤاله. لا تفترض منفعة شخصية ولا تعرض شيئاً مقابل وصف المنتج.' },
  },
] as const
