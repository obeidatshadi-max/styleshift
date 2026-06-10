# Iraq Scenario Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 32 Iraq-localized training scenarios (8 per level) to StyleShift's existing scenario pools, in English with an MSA Arabic mirror, with no engine/component/DB changes.

**Architecture:** Pure content. New items are appended to the existing exported arrays `L1`–`L4` in `src/lib/game-data.ts` and mirrored by identical IDs in `src/lib/game-data-ar.ts`. The scenario engine (`pickScenarios`) already draws from whatever array it is handed, so the larger pool is picked up automatically. A throwaway validation script enforces the data invariants and is the TDD "test."

**Tech Stack:** TypeScript, Next.js 16, Node (`npx tsx` for the validator).

**ID blocks:** L1 `1101–1108`, L2 `1201–1208`, L3 `1301–1308`, L4 `1401–1408`. Style balance for L1–L3: exactly 2 driver / 2 expressive / 2 amiable / 2 analytical each.

**Insertion anchors (stable across edits):** the last existing item in each array — L1 `id:145`, L2 `id:227`, L3 `id:327`, L4 `id:421`. In both files, insert the new items immediately **after** that last item and **before** the `]` that closes the array. The Arabic file uses the same IDs and the export names `L1_AR`, `L2_AR`, `L3_AR`, `L4_AR`.

---

## Task 1: Validation harness (the failing test)

**Files:**
- Create: `scripts/validate-iraq-pack.ts`

- [ ] **Step 1: Write the validator**

Create `scripts/validate-iraq-pack.ts`:

```ts
// Validates the Iraq scenario pack invariants. Run: npx -y tsx scripts/validate-iraq-pack.ts
// game-data.ts / game-data-ar.ts only have type-only imports, so importing them
// here pulls no path-alias runtime dependency.
import { L1, L2, L3, L4 } from '../src/lib/game-data'
import { L1_AR, L2_AR, L3_AR, L4_AR } from '../src/lib/game-data-ar'

const BLOCKS = { L1: [1101, 1108], L2: [1201, 1208], L3: [1301, 1308], L4: [1401, 1408] }
const errors: string[] = []
const ok: string[] = []

function idsInBlock<T extends { id: number }>(arr: readonly T[], lo: number, hi: number) {
  return arr.filter(x => x.id >= lo && x.id <= hi)
}
function styleCounts(arr: readonly { style?: string }[]) {
  const c: Record<string, number> = { driver: 0, expressive: 0, amiable: 0, analytical: 0 }
  for (const x of arr) if (x.style && x.style in c) c[x.style]++
  return c
}

// L1 / L2 / L3: 8 items, style-balanced 2/2/2/2
for (const [lvl, arr] of [['L1', L1], ['L2', L2], ['L3', L3]] as const) {
  const [lo, hi] = BLOCKS[lvl]
  const pack = idsInBlock(arr as readonly { id: number; style?: string }[], lo, hi)
  if (pack.length !== 8) { errors.push(`${lvl}: expected 8 Iraq items, found ${pack.length}`); continue }
  const counts = styleCounts(pack)
  const balanced = ['driver', 'expressive', 'amiable', 'analytical'].every(k => counts[k] === 2)
  if (!balanced) errors.push(`${lvl}: not 2/2/2/2 balanced -> ${JSON.stringify(counts)}`)
  else ok.push(`${lvl}: 8 items, balanced 2/2/2/2`)
}

// L2: exactly one 'win' per item
for (const it of idsInBlock(L2, ...BLOCKS.L2 as [number, number])) {
  const wins = it.opts.filter(o => o.r === 'win').length
  if (wins !== 1) errors.push(`L2 ${it.id}: expected exactly one 'win', found ${wins}`)
}
// L3: exactly one correct per item
for (const it of idsInBlock(L3, ...BLOCKS.L3 as [number, number])) {
  const cor = it.opts.filter(o => o.correct).length
  if (cor !== 1) errors.push(`L3 ${it.id}: expected exactly one correct, found ${cor}`)
}
// L4: 8 items, each 3 opts, unique single best by quota+morale-risk
{
  const pack = idsInBlock(L4, ...BLOCKS.L4 as [number, number])
  if (pack.length !== 8) errors.push(`L4: expected 8 Iraq items, found ${pack.length}`)
  else ok.push('L4: 8 items')
  for (const it of pack) {
    if (it.opts.length !== 3) errors.push(`L4 ${it.id}: expected 3 opts, found ${it.opts.length}`)
    const scores = it.opts.map(o => o.quota + o.morale - o.risk)
    const max = Math.max(...scores)
    if (scores.filter(s => s === max).length !== 1) errors.push(`L4 ${it.id}: best option is not unique`)
  }
}

// AR parity: every Iraq id in EN exists in AR
const pairs = [['L1', L1, L1_AR], ['L2', L2, L2_AR], ['L3', L3, L3_AR], ['L4', L4, L4_AR]] as const
for (const [lvl, en, ar] of pairs) {
  const [lo, hi] = BLOCKS[lvl as keyof typeof BLOCKS]
  const arIds = new Set(idsInBlock(ar, lo, hi).map(x => x.id))
  for (const it of idsInBlock(en, lo, hi)) {
    if (!arIds.has(it.id)) errors.push(`${lvl} ${it.id}: missing Arabic mirror`)
  }
}

for (const o of ok) console.log('OK  ', o)
if (errors.length) { console.error('\nFAILURES:'); for (const e of errors) console.error('  X', e); process.exit(1) }
console.log('\nAll Iraq pack invariants pass.')
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx -y tsx scripts/validate-iraq-pack.ts`
Expected: FAIL, exit 1, with `X L1: expected 8 Iraq items, found 0` (and the same for L2/L3/L4).

- [ ] **Step 3: Commit**

```bash
git add scripts/validate-iraq-pack.ts
git commit -m "test: add Iraq scenario pack validator (failing)"
```

---

## Task 2: Level 1 Iraq pack (Style Scan)

**Files:**
- Modify: `src/lib/game-data.ts` (after `id:145`, before the `]` closing `export const L1`)
- Modify: `src/lib/game-data-ar.ts` (after `id:145`, before the `]` closing `export const L1_AR`)

- [ ] **Step 1: Append the English L1 items**

In `src/lib/game-data.ts`, immediately after the `id:145` item and before the closing `]` of `L1`, add:

```ts
  // ── Iraq pack ──
  { id:1101, style:'driver', name:'Dr. Haider · Cardiologist', persona:'Cardiologist · Medical City',
    cues:['"Bottom line — does it cut readmissions? Yes or no, my clinic is full."','Glances twice at the packed waiting hall.','Wants two options and decides on the spot.'] },
  { id:1102, style:'analytical', name:'Dr. Zainab · Endocrinologist', persona:'Endocrinologist · Basra',
    cues:['Asks for the exact HbA1c figures and the trial population.','Re-reads the leaflet before commenting.','Won\'t commit until she has reviewed the data.'] },
  { id:1103, style:'expressive', name:'Dr. Mustafa · Dermatologist', persona:'Dermatologist · Mansour',
    cues:['Excited to be the first in Baghdad with a novel option.','Talks about presenting his cases at the Iraqi dermatology conference.','Wants the brand to make his clinic look cutting-edge.'] },
  { id:1104, style:'amiable', name:'Dr. Noor · Family GP', persona:'Family GP · Karrada',
    cues:['Asks how her loyal patients will handle a switch.','Wants to start slowly with a few patients.','Values a rep she can trust over the long term.'] },
  { id:1105, style:'amiable', name:'Abu Ahmed · Community Pharmacist', persona:'Community Pharmacist',
    cues:['Asks how it helps his regular neighborhood customers.','Wants reassurance on counseling patients about side effects.','Prefers a steady relationship over a one-off deal.'] },
  { id:1106, style:'analytical', name:'Hassan · Hospital Pharmacist', persona:'Hospital Pharmacist · Medical City',
    cues:['Asks for stability and storage data given the summer heat.','Checks each Kimadia formulary criterion.','Wants the full dossier before listing anything.'] },
  { id:1107, style:'driver', name:'Hajji Salam · Pharmacy Owner', persona:'Pharmacy Owner',
    cues:['"What\'s my margin and how fast does it move?"','Counts shelf turnover as you talk.','Decides immediately if the numbers work.'] },
  { id:1108, style:'expressive', name:'Dr. Sajjad · Orthopedic Surgeon (KOL)', persona:'Orthopedic Surgeon · KOL',
    cues:['Riffs on a bold new surgical technique.','Wants to be recognized as a thought leader at conferences.','Asks about speaking slots and advisory roles.'] },
```

- [ ] **Step 2: Append the Arabic L1 items**

In `src/lib/game-data-ar.ts`, immediately after the `id:145` item and before the closing `]` of `L1_AR`, add:

```ts
  // ── حزمة العراق ──
  { id:1101, style:'driver', name:'د. حيدر · طبيب قلب', persona:'طبيب قلب · مدينة الطب',
    cues:['«الخلاصة — هل يقلّل إعادة الإدخال؟ نعم أم لا، عيادتي ممتلئة.»','ينظر مرتين إلى قاعة الانتظار المزدحمة.','يريد خيارين ويقرر فوراً.'] },
  { id:1102, style:'analytical', name:'د. زينب · طبيبة غدد', persona:'طبيبة غدد · البصرة',
    cues:['تطلب أرقام خفض الـHbA1c بدقة ومجتمع الدراسة.','تعيد قراءة النشرة قبل أن تعلّق.','لن تلتزم حتى تراجع البيانات.'] },
  { id:1103, style:'expressive', name:'د. مصطفى · طبيب جلدية', persona:'طبيب جلدية · المنصور',
    cues:['متحمس ليكون أول من يستخدم خياراً جديداً في بغداد.','يتحدث عن عرض حالاته في المؤتمر العراقي للجلدية.','يريد للعلامة أن تجعل عيادته تبدو متقدمة.'] },
  { id:1104, style:'amiable', name:'د. نور · طبيبة أسرة', persona:'طبيبة أسرة · الكرّادة',
    cues:['تسأل كيف سيتقبّل مرضاها المخلصون التبديل.','تريد البدء ببطء مع عدد قليل من المرضى.','تقدّر مندوباً تثق به على المدى الطويل.'] },
  { id:1105, style:'amiable', name:'أبو أحمد · صيدلي مجتمع', persona:'صيدلي مجتمع',
    cues:['يسأل كيف يفيد زبائن الحي المعتادين.','يريد طمأنينة حول إرشاد المرضى بشأن الأعراض الجانبية.','يفضّل علاقة مستقرة على صفقة عابرة.'] },
  { id:1106, style:'analytical', name:'حسن · صيدلي مستشفى', persona:'صيدلي مستشفى · مدينة الطب',
    cues:['يطلب بيانات الثبات والتخزين بسبب حرارة الصيف.','يتحقق من كل معيار في قائمة كيماديا.','يريد الملف الكامل قبل أي إدراج.'] },
  { id:1107, style:'driver', name:'الحاج سلام · صاحب صيدلية', persona:'صاحب صيدلية',
    cues:['«كم هامشي وكم سرعة دوران البيع؟»','يحسب دوران الرف وأنت تتحدث.','يقرر فوراً إن كانت الأرقام مناسبة.'] },
  { id:1108, style:'expressive', name:'د. سجّاد · جرّاح عظام (قائد رأي)', persona:'جرّاح عظام · قائد رأي',
    cues:['يطرح تقنية جراحية جديدة وجريئة.','يريد أن يُعترف به كقائد فكري في المؤتمرات.','يسأل عن فرص المحاضرات والأدوار الاستشارية.'] },
```

- [ ] **Step 3: Run the validator**

Run: `npx -y tsx scripts/validate-iraq-pack.ts`
Expected: still exit 1 (L2/L3/L4 incomplete), but now prints `OK   L1: 8 items, balanced 2/2/2/2` and no `L1` failures.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game-data.ts src/lib/game-data-ar.ts
git commit -m "feat: add Iraq pack scenarios for Level 1 (Style Scan)"
```

---

## Task 3: Level 2 Iraq pack (Crisis Mode)

**Files:**
- Modify: `src/lib/game-data.ts` (after `id:227`, before the `]` closing `export const L2`)
- Modify: `src/lib/game-data-ar.ts` (after `id:227`, before the `]` closing `export const L2_AR`)

- [ ] **Step 1: Append the English L2 items**

In `src/lib/game-data.ts`, after the `id:227` item and before the closing `]` of `L2`, add:

```ts
  // ── Iraq pack ──
  { id:1201, style:'driver', name:'Dr. Haider · Cardiologist', crisis:'"Your product vanished from the warehouse for two months and I lost patients to the competitor. Why trust your supply?"',
    q:'Dr. Haider (Driver) is angry. Choose your path.',
    opts:[
      { t:'Acknowledge it briefly, then give a concrete supply guarantee and two options, his call.', r:'win', why:'Winning Strategy. Action, options and control feed the Driver drive for Control & Achievement.' },
      { t:'Apologize at length for the supply gap.', r:'escalate', why:'Dwelling on the past reads as no progress to a Driver.' },
      { t:'Lean on your long relationship and ask him to be patient.', r:'escalate', why:'A Driver reads patience as no progress on the problem.' },
    ]},
  { id:1202, style:'analytical', name:'Dr. Zainab · Endocrinologist', crisis:'"A competitor rep was here yesterday with data saying yours is no better. Convince me or don\'t waste my time."',
    q:'Dr. Zainab (Analytical) is challenging you. Choose your path.',
    opts:[
      { t:'Walk through the head-to-head endpoints and number-needed-to-treat, calmly.', r:'win', why:'Winning Strategy. Evidence and a logical breakdown satisfy the Analytical drive for Certainty & Accuracy.' },
      { t:'Insist your drug is simply better and ask her to trust your experience.', r:'escalate', why:'Dismissing data raises an Analytical\'s stress and erodes trust.' },
      { t:'Appeal emotionally to your long relationship.', r:'escalate', why:'Emotion over evidence ignores what an Analytical needs.' },
    ]},
  { id:1203, style:'amiable', name:'Abu Ahmed · Community Pharmacist', crisis:'"A customer came back complaining of side effects — I\'m nervous to recommend it again."',
    q:'Abu Ahmed (Amiable) is worried. Choose your path.',
    opts:[
      { t:'Acknowledge the concern, share the safety profile and a patient-counseling card, and offer support.', r:'win', why:'Winning Strategy. Reassurance and a safety net satisfy the Amiable drive for Security & Harmony.' },
      { t:'Push him to keep ordering — one complaint is nothing.', r:'escalate', why:'Pressure attacks the Amiable need for security; stress spikes.' },
      { t:'Tell him the data says it\'s fine and move on.', r:'escalate', why:'Data alone doesn\'t reassure an Amiable.' },
    ]},
  { id:1204, style:'expressive', name:'Dr. Mustafa · Dermatologist', crisis:'"The conference committee gave my session to someone else. I feel ignored."',
    q:'Dr. Mustafa (Expressive) is deflated. Choose your path.',
    opts:[
      { t:'Recognize his standing, then co-build the next case series or symposium together.', r:'win', why:'Winning Strategy. Recognition plus fresh ideas restore the Expressive drive for Recognition & Ideas.' },
      { t:'Send him a chart explaining why the approach underperformed.', r:'escalate', why:'Cold analysis deflates an Expressive.' },
      { t:'Tell him to toughen up and not take it personally.', r:'escalate', why:'Denying recognition escalates an Expressive fast.' },
    ]},
  { id:1205, style:'driver', name:'Hajji Salam · Pharmacy Owner', crisis:'"The imported generic is half your price. Give me a reason in ten seconds, not a story."',
    q:'Hajji Salam (Driver) wants it fast. Choose your path.',
    opts:[
      { t:'Lead with margin and turnover, give two pack options, his call.', r:'win', why:'Winning Strategy. Numbers, options and a fast decision feed the Driver drive.' },
      { t:'Deliver a lecture on why the brand is clinically superior.', r:'escalate', why:'A time-pressed Driver reads this as wasted time.' },
      { t:'Ask how he feels about stocking premium quality.', r:'escalate', why:'A Driver wants the number, not a feelings question.' },
    ]},
  { id:1206, style:'analytical', name:'Hassan · Hospital Pharmacist', crisis:'"Your stability data doesn\'t cover our summer storage — Baghdad hits 50°C. I can\'t list it."',
    q:'Hassan (Analytical) has blocked the listing. Choose your path.',
    opts:[
      { t:'Go through the stability dossier and your storage range point by point.', r:'win', why:'Winning Strategy. Precision on the exact data resolves the Analytical objection.' },
      { t:'Reassure him vaguely that it will be fine.', r:'escalate', why:'Vague comfort ignores his drive for certainty.' },
      { t:'Point out that other hospitals listed it, so he should too.', r:'escalate', why:'Social proof doesn\'t answer an Analytical\'s data question.' },
    ]},
  { id:1207, style:'amiable', name:'Dr. Noor · Family GP', crisis:'"You\'re pushing me to switch all my patients at once — I\'m not comfortable."',
    q:'Dr. Noor (Amiable) feels pressured. Choose your path.',
    opts:[
      { t:'Reassure her; propose switching only new patients first, with your support.', r:'win', why:'Winning Strategy. A low-risk phased path satisfies the Amiable drive for security.' },
      { t:'Push for a full switch now to hit the cycle target.', r:'escalate', why:'Pressure attacks the Amiable need for security; stress rises.' },
      { t:'Tell her the data proves it\'s safe, so she should just do it.', r:'escalate', why:'Data alone doesn\'t reassure an Amiable under pressure.' },
    ]},
  { id:1208, style:'expressive', name:'Dr. Sajjad · Orthopedic Surgeon (KOL)', crisis:'"Another company offered me a bigger speaking role. Why should I stay with you?"',
    q:'Dr. Sajjad (Expressive) is courting offers. Choose your path.',
    opts:[
      { t:'Recognize his influence and offer a visible platform for his ideas — a symposium and advisory role.', r:'win', why:'Winning Strategy. Recognition and a stage feed the Expressive drive.' },
      { t:'Counter with cold, detailed contract terms.', r:'escalate', why:'Spreadsheet-first deflates an Expressive who wants to be seen.' },
      { t:'Downplay the competitor and ask him to stay out of loyalty.', r:'escalate', why:'Denying his standing escalates an Expressive.' },
    ]},
```

- [ ] **Step 2: Append the Arabic L2 items**

In `src/lib/game-data-ar.ts`, after the `id:227` item and before the closing `]` of `L2_AR`, add:

```ts
  // ── حزمة العراق ──
  { id:1201, style:'driver', name:'د. حيدر · طبيب قلب', crisis:'«اختفى منتجكم من المخزن شهرين وخسرت مرضى للمنافس. لماذا أثق بتجهيزكم؟»',
    q:'د. حيدر (المسيطر) غاضب. اختر مسارك.',
    opts:[
      { t:'اعترف بالأمر بإيجاز، ثم قدّم ضمان تجهيز واضح وخيارين، والقرار له.', r:'win', why:'الاستراتيجية الرابحة. الفعل والخيارات والتحكم تُغذّي دافع المسيطر للتحكم والإنجاز.' },
      { t:'اعتذر مطوّلاً عن انقطاع التجهيز.', r:'escalate', why:'الإطالة في الماضي يقرأها المسيطر كعدم تقدّم.' },
      { t:'استند إلى علاقتكما الطويلة واطلب منه الصبر.', r:'escalate', why:'المسيطر يقرأ الصبر كلا تقدّم على المشكلة.' },
    ]},
  { id:1202, style:'analytical', name:'د. زينب · طبيبة غدد', crisis:'«مندوب منافس كان هنا أمس ببيانات تقول إن منتجكم ليس أفضل. أقنعيني أو لا تضيّعي وقتي.»',
    q:'د. زينب (التحليلية) تتحداك. اختر مسارك.',
    opts:[
      { t:'استعرض نقاط المقارنة المباشرة وعدد المرضى اللازم علاجهم بهدوء.', r:'win', why:'الاستراتيجية الرابحة. الأدلة والتحليل المنطقي يلبّيان دافع التحليلي لليقين والدقة.' },
      { t:'أصرّ أن منتجك ببساطة أفضل واطلب الثقة بخبرتك.', r:'escalate', why:'تجاهل البيانات يرفع توتر التحليلي ويضعف الثقة.' },
      { t:'استعطفها عاطفياً بعلاقتكما الطويلة.', r:'escalate', why:'العاطفة بدل الدليل تتجاهل ما يحتاجه التحليلي.' },
    ]},
  { id:1203, style:'amiable', name:'أبو أحمد · صيدلي مجتمع', crisis:'«زبون رجع يشتكي من أعراض جانبية — صرت متردداً أنصح به.»',
    q:'أبو أحمد (الودود) قلق. اختر مسارك.',
    opts:[
      { t:'تفهّم القلق، شارك ملف الأمان وبطاقة إرشاد المريض، واعرض الدعم.', r:'win', why:'الاستراتيجية الرابحة. الطمأنة وشبكة الأمان تلبّيان دافع الودود للأمان والانسجام.' },
      { t:'اضغط عليه ليستمر بالطلب — شكوى واحدة لا تعني شيئاً.', r:'escalate', why:'الضغط يهاجم حاجة الودود للأمان فيرتفع التوتر.' },
      { t:'قل له إن البيانات تقول إنه آمن وتجاوز الأمر.', r:'escalate', why:'البيانات وحدها لا تطمئن الودود.' },
    ]},
  { id:1204, style:'expressive', name:'د. مصطفى · طبيب جلدية', crisis:'«لجنة المؤتمر أعطت جلستي لشخص آخر. أشعر أنني مُهمَل.»',
    q:'د. مصطفى (التعبيري) محبَط. اختر مسارك.',
    opts:[
      { t:'اعترف بمكانته، ثم ابنِ معه سلسلة الحالات أو ندوة قادمة.', r:'win', why:'الاستراتيجية الرابحة. التقدير مع أفكار جديدة يعيدان دافع التعبيري للتقدير والأفكار.' },
      { t:'أرسل له رسماً يشرح لماذا لم ينجح النهج.', r:'escalate', why:'التحليل البارد يحبط التعبيري.' },
      { t:'قل له أن يتجاوز الأمر ولا يأخذه بشكل شخصي.', r:'escalate', why:'إنكار التقدير يصعّد التعبيري بسرعة.' },
    ]},
  { id:1205, style:'driver', name:'الحاج سلام · صاحب صيدلية', crisis:'«البديل المستورد بنصف سعركم. أعطني سبباً بعشر ثوانٍ، لا قصة.»',
    q:'الحاج سلام (المسيطر) يريدها بسرعة. اختر مسارك.',
    opts:[
      { t:'ابدأ بالهامش والدوران، اعرض خياري عبوة، والقرار له.', r:'win', why:'الاستراتيجية الرابحة. الأرقام والخيارات والقرار السريع تُغذّي دافع المسيطر.' },
      { t:'ألقِ محاضرة عن تفوّق العلامة سريرياً.', r:'escalate', why:'المسيطر المضغوط بالوقت يقرأها كإضاعة وقت.' },
      { t:'اسأله كيف يشعر تجاه تخزين منتجات عالية الجودة.', r:'escalate', why:'المسيطر يريد الرقم لا سؤالاً عن المشاعر.' },
    ]},
  { id:1206, style:'analytical', name:'حسن · صيدلي مستشفى', crisis:'«بيانات ثباتكم لا تغطّي تخزين صيفنا — بغداد تصل ٥٠ درجة. لا أستطيع إدراجه.»',
    q:'حسن (التحليلي) أوقف الإدراج. اختر مسارك.',
    opts:[
      { t:'استعرض ملف الثبات ونطاق التخزين نقطة بنقطة.', r:'win', why:'الاستراتيجية الرابحة. الدقة في البيانات تحل اعتراض التحليلي.' },
      { t:'طمئنه بشكل غامض أن الأمور ستكون بخير.', r:'escalate', why:'الطمأنة الغامضة تتجاهل دافعه لليقين.' },
      { t:'أشر إلى أن مستشفيات أخرى أدرجته.', r:'escalate', why:'الدليل الاجتماعي لا يجيب على سؤال التحليلي عن البيانات.' },
    ]},
  { id:1207, style:'amiable', name:'د. نور · طبيبة أسرة', crisis:'«تضغط عليّ لأبدّل كل مرضاي دفعة واحدة — لست مرتاحة.»',
    q:'د. نور (الودود) تشعر بالضغط. اختر مسارك.',
    opts:[
      { t:'طمئنها؛ اقترح تبديل المرضى الجدد أولاً مع دعمك.', r:'win', why:'الاستراتيجية الرابحة. مسار تدريجي منخفض المخاطر يلبّي دافع الودود للأمان.' },
      { t:'اضغط لتبديل كامل الآن لتحقيق هدف الدورة.', r:'escalate', why:'الضغط يهاجم حاجة الودود للأمان فيرتفع التوتر.' },
      { t:'قل لها إن البيانات تثبت الأمان فعليها أن تفعلها.', r:'escalate', why:'البيانات وحدها لا تطمئن الودود تحت الضغط.' },
    ]},
  { id:1208, style:'expressive', name:'د. سجّاد · جرّاح عظام (قائد رأي)', crisis:'«شركة أخرى عرضت عليّ دوراً أكبر في المحاضرات. لماذا أبقى معكم؟»',
    q:'د. سجّاد (التعبيري) يتلقى عروضاً. اختر مسارك.',
    opts:[
      { t:'اعترف بتأثيره واعرض منصة بارزة لأفكاره — ندوة ودور استشاري.', r:'win', why:'الاستراتيجية الرابحة. التقدير والمنصة يُغذّيان دافع التعبيري.' },
      { t:'قابله بشروط عقد باردة ومفصّلة.', r:'escalate', why:'الأرقام أولاً تحبط التعبيري الذي يريد أن يُرى.' },
      { t:'قلّل من شأن المنافس واطلب البقاء بدافع الولاء.', r:'escalate', why:'إنكار مكانته يصعّد التعبيري.' },
    ]},
```

- [ ] **Step 3: Run the validator**

Run: `npx -y tsx scripts/validate-iraq-pack.ts`
Expected: still exit 1 (L3/L4 incomplete), now prints `OK   L2: 8 items, balanced 2/2/2/2` and no `L2` failures.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game-data.ts src/lib/game-data-ar.ts
git commit -m "feat: add Iraq pack scenarios for Level 2 (Crisis Mode)"
```

---

## Task 4: Level 3 Iraq pack (Drive Decoder)

**Files:**
- Modify: `src/lib/game-data.ts` (after `id:327`, before the `]` closing `export const L3`)
- Modify: `src/lib/game-data-ar.ts` (after `id:327`, before the `]` closing `export const L3_AR`)

All 8 items are `multi:false` single-style (keeps the 2/2/2/2 balance clean; the existing pool already supplies multi-stakeholder items).

- [ ] **Step 1: Append the English L3 items**

In `src/lib/game-data.ts`, after the `id:327` item and before the closing `]` of `L3`, add:

```ts
  // ── Iraq pack ──
  { id:1301, multi:false, style:'driver', name:'Dr. Haider · Cardiologist', persona:'Driver — drive: Control & Achievement',
    situation:'Dr. Haider is calm but has 5 minutes before his next patient in a packed Medical City clinic.',
    q:'Which opening best feeds his core drive?',
    opts:[
      { t:'"Two regimens that move your patients through faster, with the outcome data on each — your call."', correct:true, why:'Control + measurable achievement. The Driver drive.' },
      { t:'"Let me walk you through the full development story first."', correct:false, why:'Process narrative drains a Driver who wants control of the outcome.' },
      { t:'"How was your weekend? Let\'s catch up first."', correct:false, why:'Relationship warmth is the Amiable drive, not the Driver\'s.' },
    ]},
  { id:1302, multi:false, style:'expressive', name:'Dr. Mustafa · Dermatologist', persona:'Expressive — drive: Recognition & Ideas',
    situation:'Dr. Mustafa is pitching you his idea to run a local case series in Baghdad.',
    q:'Which response best feeds his core drive?',
    opts:[
      { t:'"Bold, original — let\'s build it and put your name on the publication."', correct:true, why:'Recognition + room for ideas. The Expressive drive.' },
      { t:'"Could you send me the supporting data tables first?"', correct:false, why:'That satisfies an Analytical, not an Expressive who wants to be seen.' },
      { t:'"Let\'s slow down and reduce the risk before anything."', correct:false, why:'Caution speaks to the Amiable drive and deflates the Expressive.' },
    ]},
  { id:1303, multi:false, style:'amiable', name:'Dr. Noor · Family GP', persona:'Amiable — drive: Security & Harmony',
    situation:'Dr. Noor likes you but hasn\'t committed to prescribing.',
    q:'Which response best feeds her core drive?',
    opts:[
      { t:'"We\'ll start with a few new patients, I\'ll support you personally, and we can pause anytime."', correct:true, why:'Security + harmony with a safety net. The Amiable drive.' },
      { t:'"Decide today — the launch offer expires tonight."', correct:false, why:'Urgency threatens an Amiable\'s need for security.' },
      { t:'"The trial numbers are airtight, that should settle it."', correct:false, why:'Data reassures an Analytical, not an Amiable.' },
    ]},
  { id:1304, multi:false, style:'analytical', name:'Hassan · Hospital Pharmacist', persona:'Analytical — drive: Certainty & Accuracy',
    situation:'Hassan is deciding whether to add your drug to the formulary.',
    q:'Which response best feeds his core drive?',
    opts:[
      { t:'"Here\'s the full trial dossier and stability data matched to your summer storage conditions."', correct:true, why:'Evidence and precision. The Analytical drive.' },
      { t:'"Everyone\'s listing it — you don\'t want to be last."', correct:false, why:'Social pressure doesn\'t answer a certainty-driven mind.' },
      { t:'"Let\'s just trial it informally and see what happens."', correct:false, why:'Improvising undermines an Analytical\'s need for rigor.' },
    ]},
  { id:1305, multi:false, style:'driver', name:'Hajji Salam · Pharmacy Owner', persona:'Driver — drive: Control & Achievement',
    situation:'Hajji Salam is deciding whether to stock your product.',
    q:'Which response best feeds his core drive?',
    opts:[
      { t:'"Two pack sizes — here\'s the margin and turnover on each. Pick what fits."', correct:true, why:'Numbers, options and control. The Driver drive.' },
      { t:'"Let me explain the science behind the formulation."', correct:false, why:'Mechanism detail bores a results-focused Driver.' },
      { t:'"It\'ll build patient loyalty over the years."', correct:false, why:'Slow, soft benefit doesn\'t move a Driver who wants the number now.' },
    ]},
  { id:1306, multi:false, style:'analytical', name:'Dr. Zainab · Endocrinologist', persona:'Analytical — drive: Certainty & Accuracy',
    situation:'Dr. Zainab is skeptical and weighing the evidence against a cheaper generic.',
    q:'Which response best feeds her core drive?',
    opts:[
      { t:'"Here\'s the head-to-head RCT: primary endpoint, and the number needed to treat."', correct:true, why:'Rigorous evidence. The Analytical drive.' },
      { t:'"It\'s the best-selling option in its class — that says enough."', correct:false, why:'Market position isn\'t clinical proof.' },
      { t:'"All my other endocrinologists already love it."', correct:false, why:'Anecdote doesn\'t satisfy an evidence-driven specialist.' },
    ]},
  { id:1307, multi:false, style:'amiable', name:'Abu Ahmed · Community Pharmacist', persona:'Amiable — drive: Security & Harmony',
    situation:'Abu Ahmed likes you but hasn\'t committed to stocking it.',
    q:'Which response best feeds his core drive?',
    opts:[
      { t:'"We\'ll start small, I\'ll give you a counseling guide for your customers, and you reorder only if it helps them."', correct:true, why:'Security + customer care with a safety net. The Amiable drive.' },
      { t:'"Order a full case now — the deal ends today."', correct:false, why:'Urgency threatens an Amiable\'s need for security.' },
      { t:'"The margins are great, that\'s the main thing."', correct:false, why:'Margin-first speaks to a Driver, not an Amiable.' },
    ]},
  { id:1308, multi:false, style:'expressive', name:'Dr. Sajjad · Orthopedic Surgeon (KOL)', persona:'Expressive — drive: Recognition & Ideas',
    situation:'Dr. Sajjad wants to be at the front of the conversation on a new technique.',
    q:'Which response best feeds his core drive?',
    opts:[
      { t:'"Let\'s put you on the regional symposium to present your early results."', correct:true, why:'Recognition + a stage for his ideas. The Expressive drive.' },
      { t:'"First, please complete this detailed data-entry form."', correct:false, why:'Paperwork-first deflates an Expressive.' },
      { t:'"Best to wait until the guidelines catch up."', correct:false, why:'Caution kills the Expressive\'s drive to lead.' },
    ]},
```

- [ ] **Step 2: Append the Arabic L3 items**

In `src/lib/game-data-ar.ts`, after the `id:327` item and before the closing `]` of `L3_AR`, add:

```ts
  // ── حزمة العراق ──
  { id:1301, multi:false, style:'driver', name:'د. حيدر · طبيب قلب', persona:'المسيطر — الدافع: التحكم والإنجاز',
    situation:'د. حيدر هادئ لكن أمامه ٥ دقائق قبل المريض التالي في عيادة مدينة الطب المزدحمة.',
    q:'أي افتتاحية تُغذّي دافعه الأساسي؟',
    opts:[
      { t:'«نظامان علاجيان يسرّعان مرور مرضاك، مع بيانات النتائج لكلٍّ منهما — القرار لك.»', correct:true, why:'تحكم وإنجاز قابل للقياس. دافع المسيطر تماماً.' },
      { t:'«دعني أستعرض لك قصة التطوير الكاملة أولاً.»', correct:false, why:'سرد العملية يستنزف المسيطر الذي يريد التحكم بالنتيجة.' },
      { t:'«كيف كان أسبوعك؟ لنتحدث قليلاً أولاً.»', correct:false, why:'دفء العلاقة دافع الودود لا المسيطر.' },
    ]},
  { id:1302, multi:false, style:'expressive', name:'د. مصطفى · طبيب جلدية', persona:'التعبيري — الدافع: التقدير والأفكار',
    situation:'د. مصطفى يعرض عليك فكرته لإجراء سلسلة حالات محلية في بغداد.',
    q:'أي ردّ يُغذّي دافعه الأساسي؟',
    opts:[
      { t:'«فكرة جريئة وأصيلة — لنبنِها ونضع اسمك على النشر.»', correct:true, why:'تقدير ومساحة للأفكار. دافع التعبيري.' },
      { t:'«هل يمكنك إرسال جداول البيانات الداعمة أولاً؟»', correct:false, why:'هذا يلبّي التحليلي لا التعبيري الذي يريد أن يُرى.' },
      { t:'«لنتمهّل ونقلّل المخاطر قبل أي شيء.»', correct:false, why:'الحذر يخاطب الودود ويحبط التعبيري.' },
    ]},
  { id:1303, multi:false, style:'amiable', name:'د. نور · طبيبة أسرة', persona:'الودود — الدافع: الأمان والانسجام',
    situation:'د. نور تحبّك لكنها لم تلتزم بالوصف بعد.',
    q:'أي ردّ يُغذّي دافعها الأساسي؟',
    opts:[
      { t:'«سنبدأ بعدد قليل من المرضى الجدد، وأدعمك شخصياً، ويمكننا التوقف في أي وقت.»', correct:true, why:'أمان وانسجام مع شبكة أمان. دافع الودود.' },
      { t:'«قرّري اليوم — عرض الإطلاق ينتهي الليلة.»', correct:false, why:'الاستعجال يهدّد حاجة الودود للأمان.' },
      { t:'«أرقام التجربة محكمة، هذا يكفي للحسم.»', correct:false, why:'البيانات تطمئن التحليلي لا الودود.' },
    ]},
  { id:1304, multi:false, style:'analytical', name:'حسن · صيدلي مستشفى', persona:'التحليلي — الدافع: اليقين والدقة',
    situation:'حسن يقرّر إدراج دوائك في القائمة الدوائية.',
    q:'أي ردّ يُغذّي دافعه الأساسي؟',
    opts:[
      { t:'«إليك الملف الكامل للتجربة وبيانات الثبات المطابقة لظروف تخزينكم الصيفية.»', correct:true, why:'أدلة ودقة. دافع التحليلي.' },
      { t:'«الجميع يدرجونه — لا تريد أن تكون الأخير.»', correct:false, why:'الضغط الاجتماعي لا يقنع عقلاً يبحث عن اليقين.' },
      { t:'«لنجرّبه بشكل غير رسمي ونرى ما يحدث.»', correct:false, why:'الارتجال يقوّض حاجة التحليلي للصرامة.' },
    ]},
  { id:1305, multi:false, style:'driver', name:'الحاج سلام · صاحب صيدلية', persona:'المسيطر — الدافع: التحكم والإنجاز',
    situation:'الحاج سلام يقرّر ما إذا كان سيخزّن منتجك.',
    q:'أي ردّ يُغذّي دافعه الأساسي؟',
    opts:[
      { t:'«حجمان للعبوة — إليك الهامش والدوران لكلٍّ منهما. اختر ما يناسبك.»', correct:true, why:'أرقام وخيارات وتحكم. دافع المسيطر.' },
      { t:'«دعني أشرح العلم وراء التركيبة.»', correct:false, why:'تفاصيل الآلية تُملّ المسيطر المركّز على النتائج.' },
      { t:'«سيبني ولاء المرضى عبر السنوات.»', correct:false, why:'المنفعة البطيئة لا تحرّك المسيطر الذي يريد الرقم الآن.' },
    ]},
  { id:1306, multi:false, style:'analytical', name:'د. زينب · طبيبة غدد', persona:'التحليلي — الدافع: اليقين والدقة',
    situation:'د. زينب متشككة وتقيّم الأدلة مقابل البديل الأرخص.',
    q:'أي ردّ يُغذّي دافعها الأساسي؟',
    opts:[
      { t:'«إليك التجربة المقارنة المباشرة: النقطة النهائية الأولية وعدد المرضى اللازم علاجهم.»', correct:true, why:'أدلة صارمة. دافع التحليلي.' },
      { t:'«إنه الأكثر مبيعاً في فئته — هذا يكفي.»', correct:false, why:'موقع السوق ليس دليلاً سريرياً.' },
      { t:'«كل أطباء الغدد لديّ يحبّونه أصلاً.»', correct:false, why:'الحكاية لا تُرضي مختصاً يعتمد على الأدلة.' },
    ]},
  { id:1307, multi:false, style:'amiable', name:'أبو أحمد · صيدلي مجتمع', persona:'الودود — الدافع: الأمان والانسجام',
    situation:'أبو أحمد يحبّك لكنه لم يلتزم بتخزينه.',
    q:'أي ردّ يُغذّي دافعه الأساسي؟',
    opts:[
      { t:'«سنبدأ بكمية صغيرة، أعطيك دليل إرشاد لزبائنك، وتعيد الطلب فقط إن أفادهم.»', correct:true, why:'أمان ورعاية الزبائن مع شبكة أمان. دافع الودود.' },
      { t:'«اطلب كرتونة كاملة الآن — العرض ينتهي اليوم.»', correct:false, why:'الاستعجال يهدّد حاجة الودود للأمان.' },
      { t:'«الهوامش ممتازة، وهذا هو الأهم.»', correct:false, why:'الهامش أولاً يخاطب المسيطر لا الودود.' },
    ]},
  { id:1308, multi:false, style:'expressive', name:'د. سجّاد · جرّاح عظام (قائد رأي)', persona:'التعبيري — الدافع: التقدير والأفكار',
    situation:'د. سجّاد يريد أن يتصدّر الحديث عن تقنية جديدة.',
    q:'أي ردّ يُغذّي دافعه الأساسي؟',
    opts:[
      { t:'«لنضعك في الندوة الإقليمية لتعرض نتائجك المبكرة.»', correct:true, why:'تقدير ومنصة لأفكاره. دافع التعبيري.' },
      { t:'«أولاً، أكمل نموذج إدخال البيانات المفصّل هذا.»', correct:false, why:'الأوراق أولاً تحبط التعبيري.' },
      { t:'«من الأفضل الانتظار حتى تلحق الإرشادات.»', correct:false, why:'الحذر يقتل رغبة التعبيري في الريادة.' },
    ]},
```

- [ ] **Step 3: Run the validator**

Run: `npx -y tsx scripts/validate-iraq-pack.ts`
Expected: still exit 1 (L4 incomplete), now prints `OK   L3: 8 items, balanced 2/2/2/2` and no `L3` failures.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game-data.ts src/lib/game-data-ar.ts
git commit -m "feat: add Iraq pack scenarios for Level 3 (Drive Decoder)"
```

---

## Task 5: Level 4 Iraq pack (The Formulary Committee)

**Files:**
- Modify: `src/lib/game-data.ts` (after `id:421`, before the `]` closing `export const L4`)
- Modify: `src/lib/game-data-ar.ts` (after `id:421`, before the `]` closing `export const L4_AR`)

L4 items have no `style`. The best option is the one maximizing `quota + morale − risk` (`bestL4Index`); each item below has a single, clearly-highest option.

- [ ] **Step 1: Append the English L4 items**

In `src/lib/game-data.ts`, after the `id:421` item and before the closing `]` of `L4`, add:

```ts
  // ── Iraq pack ── (hospital P&T committee, Baghdad context)
  { id:1401, q:'Opening move before the Medical City P&T committee:',
    opts:[
      { t:'Lead with a bold "first in Iraq" innovation story, lightly backed by headline data.', quota:+8,  morale:+10, risk:+12, why:'Energizes the KOL, but thin data spikes Risk for the Analytical pharmacist.' },
      { t:'Present a measured case: evidence pack, cost in dinars, and a phased rollout.',        quota:+10, morale:+6,  risk:-8,  why:'Balanced. Meets cost and evidence needs while keeping Risk low.' },
      { t:'Spend the slot only building rapport.',                                                quota:-4,  morale:+12, risk:-2,  why:'Warmth without progress leaves the department head unconvinced on adoption.' },
    ]},
  { id:1402, q:'A committee member recalls your two-month stockout last year. You:',
    opts:[
      { t:'Acknowledge it, show your new supply guarantee and local stock plan, backed by figures.', quota:+10, morale:+8,  risk:-8,  why:'Owning the lapse with a concrete fix rebuilds Trust and lowers Risk.' },
      { t:'Insist it was the distributor\'s fault, not yours.',                                       quota:+2,  morale:-6,  risk:+8,  why:'Blame-shifting keeps the distrust alive — Risk rises.' },
      { t:'Avoid the topic and move straight to efficacy.',                                           quota:0,   morale:-4,  risk:+8,  why:'The unaddressed grievance festers.' },
    ]},
  { id:1403, q:'The Analytical pharmacist flags summer cold-chain storage. You:',
    opts:[
      { t:'Present stability data for high temperatures and your cold-chain support plan.', quota:+8,  morale:+6,  risk:-12, why:'Evidence plus a support plan cuts Risk hardest.' },
      { t:'Say storage "shouldn\'t be a problem" in Baghdad.',                              quota:+2,  morale:-4,  risk:+12, why:'Hand-waving a real logistics risk spikes it.' },
      { t:'Tell them to handle storage themselves.',                                        quota:-2,  morale:-6,  risk:+10, why:'Offloading the problem erodes Trust.' },
    ]},
  { id:1404, q:'The committee pushes mandatory generic substitution to save budget. You:',
    opts:[
      { t:'Show the sub-population where your brand changes outcomes; accept generics elsewhere.', quota:+10, morale:+6,  risk:-8,  why:'A targeted, reasonable position protects adoption where it matters and lowers Risk.' },
      { t:'Argue the brand should be protected across the board.',                                  quota:-4,  morale:-4,  risk:+8,  why:'Over-reach reads as self-serving.' },
      { t:'Concede fully and hope volume holds.',                                                   quota:-8,  morale:+2,  risk:-2,  why:'Surrendering the case sacrifices adoption momentum.' },
    ]},
  { id:1405, q:'The Driver department head demands the cost decision now, in dinars. You:',
    opts:[
      { t:'Offer two cost-effective options with a clear recommendation.', quota:+14, morale:+6,  risk:-4,  why:'Decisive + evidenced. Lands the Driver without spooking the others.' },
      { t:'Ask for another month to align everyone.',                      quota:-8,  morale:+4,  risk:-2,  why:'A Driver reads delay as failure — momentum is lost.' },
      { t:'Close hard on price alone, skipping the rationale.',            quota:+6,  morale:-6,  risk:+10, why:'May win the moment but leaves the others uneasy.' },
    ]},
  { id:1406, q:'The budget is cut 15% mid-meeting. You:',
    opts:[
      { t:'Offer a phased, tiered adoption that preserves value within the new budget.', quota:+10, morale:+6,  risk:-6,  why:'Flexibility keeps adoption alive without sacrificing value.' },
      { t:'Hold firm on full price and volume.',                                         quota:-6,  morale:-4,  risk:+8,  why:'Rigidity loses adoption and raises Risk.' },
      { t:'Slash your price to whatever fits.',                                          quota:+6,  morale:+2,  risk:+8,  why:'A panic discount signals the price was never real.' },
    ]},
  { id:1407, q:'The Expressive KOL wants to champion the drug at the Iraqi congress. You:',
    opts:[
      { t:'Give him a visible role and co-author the rollout protocol.', quota:+12, morale:+8,  risk:-2,  why:'Recognition turns him into your advocate, lifting Adoption and Trust.' },
      { t:'Tell him to keep it low-key for now.',                        quota:-2,  morale:-8,  risk:+2,  why:'Denying the stage deflates the Expressive.' },
      { t:'Ignore him and stay focused on the numbers.',                quota:+4,  morale:-4,  risk:+4,  why:'Missing his recognition need costs you a champion.' },
    ]},
  { id:1408, q:'The final vote. Your closing move:',
    opts:[
      { t:'Summarize evidence, dinar cost and safety, and ask for adoption with a monitored pilot.', quota:+14, morale:+8,  risk:-6,  why:'Decisive, evidenced and low-risk — the apex close.' },
      { t:'Push for full immediate adoption across the hospital.',                                   quota:+8,  morale:-6,  risk:+10, why:'Over-reach unsettles the cautious members.' },
      { t:'Withdraw and ask to revisit next quarter.',                                               quota:-10, morale:+4,  risk:-4,  why:'Avoids friction but surrenders all momentum.' },
    ]},
```

- [ ] **Step 2: Append the Arabic L4 items**

In `src/lib/game-data-ar.ts`, after the `id:421` item and before the closing `]` of `L4_AR`, add:

```ts
  // ── حزمة العراق ── (لجنة الأدوية في المستشفى، سياق بغداد)
  { id:1401, q:'افتتاحيتك أمام لجنة الأدوية في مدينة الطب:',
    opts:[
      { t:'ابدأ بقصة ابتكار «الأول في العراق»، مدعومة قليلاً ببيانات عامة.', quota:+8,  morale:+10, risk:+12, why:'تحمّس قائد الرأي، لكن ضعف البيانات يرفع المخاطر لدى الصيدلي التحليلي.' },
      { t:'اعرض حالة متّزنة: ملف أدلة، والتكلفة بالدينار، وخطة تطبيق تدريجية.',  quota:+10, morale:+6,  risk:-8,  why:'متوازن. يلبّي حاجتي التكلفة والأدلة مع إبقاء المخاطر منخفضة.' },
      { t:'اقضِ الوقت في بناء العلاقة فقط.',                                    quota:-4,  morale:+12, risk:-2,  why:'الدفء دون تقدّم يترك رئيس القسم غير مقتنع بالتبني.' },
    ]},
  { id:1402, q:'أحد الأعضاء يتذكّر انقطاع التجهيز لشهرين العام الماضي. أنت:',
    opts:[
      { t:'تعترف بالأمر، وتعرض ضمان التجهيز الجديد وخطة المخزون المحلي، مدعومة بالأرقام.', quota:+10, morale:+8,  risk:-8,  why:'تحمّل الخطأ مع حلّ ملموس يعيد الثقة ويخفض المخاطر.' },
      { t:'تصرّ أنه خطأ الموزّع لا خطؤكم.',                                                 quota:+2,  morale:-6,  risk:+8,  why:'إلقاء اللوم يُبقي عدم الثقة قائماً.' },
      { t:'تتجنّب الموضوع وتنتقل مباشرة إلى الفعالية.',                                      quota:0,   morale:-4,  risk:+8,  why:'الشكوى غير المعالَجة تتفاقم.' },
    ]},
  { id:1403, q:'الصيدلي التحليلي يثير قلق سلسلة التبريد في الصيف. أنت:',
    opts:[
      { t:'تعرض بيانات الثبات في الحرارة العالية وخطة دعم سلسلة التبريد.', quota:+8,  morale:+6,  risk:-12, why:'الأدلة مع خطة الدعم تخفض المخاطر أكثر من أي خيار.' },
      { t:'تقول إن التخزين «لن يكون مشكلة» في بغداد.',                      quota:+2,  morale:-4,  risk:+12, why:'التهوين من خطر لوجستي حقيقي يرفعه.' },
      { t:'تطلب منهم معالجة التخزين بأنفسهم.',                              quota:-2,  morale:-6,  risk:+10, why:'تحميلهم المشكلة يضعف الثقة.' },
    ]},
  { id:1404, q:'اللجنة تدفع نحو الاستبدال الإلزامي بالبديل لتوفير الميزانية. أنت:',
    opts:[
      { t:'تُظهر الفئة الفرعية التي تغيّر فيها علامتك النتائج، وتقبل البديل في غيرها.', quota:+10, morale:+6,  risk:-8,  why:'موقف مركّز ومعقول يحمي التبني حيث يهمّ ويخفض المخاطر.' },
      { t:'تجادل بحماية العلامة في كل الحالات.',                                        quota:-4,  morale:-4,  risk:+8,  why:'المبالغة تُقرأ كخدمة للذات.' },
      { t:'تستسلم تماماً وتأمل بقاء الحجم.',                                            quota:-8,  morale:+2,  risk:-2,  why:'التنازل عن القضية يضحّي بزخم التبني.' },
    ]},
  { id:1405, q:'رئيس القسم (المسيطر) يطلب قرار التكلفة الآن بالدينار. أنت:',
    opts:[
      { t:'تعرض خيارين فعّالين من حيث التكلفة مع توصية واضحة.', quota:+14, morale:+6,  risk:-4,  why:'حاسم ومدعوم بالأدلة. يكسب المسيطر دون إزعاج الآخرين.' },
      { t:'تطلب شهراً آخر لمواءمة الجميع.',                     quota:-8,  morale:+4,  risk:-2,  why:'المسيطر يقرأ التأجيل كفشل وتُفقد الزخم.' },
      { t:'تُغلق على السعر وحده متجاوزاً المبرّر.',             quota:+6,  morale:-6,  risk:+10, why:'قد تكسب اللحظة لكن تترك الآخرين غير مرتاحين.' },
    ]},
  { id:1406, q:'تُخفَض الميزانية ١٥٪ في منتصف الاجتماع. أنت:',
    opts:[
      { t:'تعرض تبنّياً تدريجياً متدرّجاً يحفظ القيمة ضمن الميزانية الجديدة.', quota:+10, morale:+6,  risk:-6,  why:'المرونة تُبقي التبني حياً دون التضحية بالقيمة.' },
      { t:'تتمسّك بالسعر والحجم الكاملين.',                                    quota:-6,  morale:-4,  risk:+8,  why:'الجمود يخسر التبني ويرفع المخاطر.' },
      { t:'تخفض سعرك لأي مستوى يناسب.',                                        quota:+6,  morale:+2,  risk:+8,  why:'خصم الذعر يوحي أن السعر لم يكن حقيقياً.' },
    ]},
  { id:1407, q:'قائد الرأي (التعبيري) يريد تبنّي الدواء علناً في المؤتمر العراقي. أنت:',
    opts:[
      { t:'تمنحه دوراً بارزاً وتشاركه تأليف بروتوكول التطبيق.', quota:+12, morale:+8,  risk:-2,  why:'التقدير يحوّله إلى مناصر لك، فيرفع التبني والثقة.' },
      { t:'تطلب منه إبقاءه هادئاً الآن.',                       quota:-2,  morale:-8,  risk:+2,  why:'حرمانه المنصة يحبط التعبيري.' },
      { t:'تتجاهله وتبقى مركّزاً على الأرقام.',                 quota:+4,  morale:-4,  risk:+4,  why:'إغفال حاجته للتقدير يكلّفك مناصراً.' },
    ]},
  { id:1408, q:'لحظة التصويت النهائي. حركتك الختامية:',
    opts:[
      { t:'تلخّص الأدلة والتكلفة بالدينار والأمان، وتطلب التبني عبر تجربة مراقَبة.', quota:+14, morale:+8,  risk:-6,  why:'حاسم ومدعوم ومنخفض المخاطر — الإغلاق الأمثل.' },
      { t:'تدفع نحو تبنٍّ كامل وفوري في المستشفى كله.',                              quota:+8,  morale:-6,  risk:+10, why:'المبالغة تُقلق الأعضاء الحذرين.' },
      { t:'تنسحب وتطلب إعادة النظر الربع القادم.',                                   quota:-10, morale:+4,  risk:-4,  why:'يتجنّب الاحتكاك لكن يفرّط بكل الزخم.' },
    ]},
```

- [ ] **Step 2b: Run the validator (expect full pass)**

Run: `npx -y tsx scripts/validate-iraq-pack.ts`
Expected: exit 0, prints `OK` for L1–L4 and `All Iraq pack invariants pass.`

- [ ] **Step 3: Commit**

```bash
git add src/lib/game-data.ts src/lib/game-data-ar.ts
git commit -m "feat: add Iraq pack scenarios for Level 4 (Formulary Committee)"
```

---

## Task 6: Type-check, smoke test, finalize

**Files:**
- (No new files; verification + removal of the throwaway validator.)

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors. (Catches any shape mismatch in the appended items.)

- [ ] **Step 2: Run the validator one more time**

Run: `npx -y tsx scripts/validate-iraq-pack.ts`
Expected: exit 0, `All Iraq pack invariants pass.`

- [ ] **Step 3: Smoke test in the running app**

Run: `npm run dev`
Then in the browser: play Level 1 a few times until an Iraqi doctor (e.g. "Dr. Haider", "Hajji Salam") appears and renders correctly; toggle 🌐 to Arabic and confirm the same scenario shows the MSA text. Spot-check Levels 2–4 the same way.
Expected: Iraqi scenarios appear interleaved with the existing ones, in both EN and AR, with correct/feedback behaving normally.

- [ ] **Step 4: Remove the throwaway validator**

The validator was a build-time check, not shipped code. Remove it:

```bash
git rm scripts/validate-iraq-pack.ts
git commit -m "chore: remove Iraq pack validator (checks passed)"
```

(Keep it instead if the team prefers a permanent data check — in that case skip this step.)

- [ ] **Step 5: Final review**

Run: `git log --oneline -7`
Expected: one commit per level plus the validator add/remove, all on `feature/iraq-scenario-pack`.

---

## Self-Review notes (author)

- **Spec coverage:** placement (additive append) ✓; MSA throughout ✓; 8/level all 4 levels ✓; style balance 2/2/2/2 (L1–L3) enforced by validator ✓; Iraqi names + pressures (stockout 1201/1402, generic price 1205/1404, summer cold-chain 1206/1403, Kimadia/Medical City formulary 1106/1304, KOL congress 1407) ✓; identical win-logic ✓; verification = tsc + validator + smoke test ✓.
- **Placeholder scan:** none — every item is fully written in both languages.
- **Type consistency:** field names match `types/game.ts` exactly (`cues`, `crisis`, `q`, `opts`, `r:'win'|'escalate'`, `correct`, `quota/morale/risk`, `multi`, `persona`, `situation`). L4 best option verified unique by `quota+morale−risk` for all 8 items.
