// Wording signals for value and objection handling in one rep line:
// feature linked to a patient benefit, a true objection put in proportion
// (minimised) or shown as a class effect (generalised), and common ground with
// the doctor. Deterministic text checks only: they steer the AI doctor's
// reaction and give the analyst measured hints. They never decide a score on
// their own, and a class-effect claim is only credited when approved product
// information supports it. Arabic patterns still need a native review.

const lower = (s: string) => s.normalize('NFKC').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').toLowerCase()

// ── Feature linked to a patient benefit ────────────────────────────────────

const LINK_EN = /\b(?:which means|this means|that means|means that|so that|so your patients?|for your patients?,? (?:this|that) means|helps your patients?|allows your patients?|lets your patients?|your patients? (?:can|will|could|get|don't have to|do not have to|won't|will not))\b/i
const FEATURE_EN = /\b(?:once[- ]daily|twice[- ]daily|single dose|dose|dosing|formulation|tablet|pen|injection|device|half[- ]life|onset|works (?:in|within)|acts|mechanism|with or without food|no titration|fixed[- ]dose|combination|small(?:er)? tablet|duration|long[- ]acting|fast[- ]acting|profile)\b/i
const LINK_AR = /يعني\s+(?:لمرضاك|مرضاك|المريض|للمريض)|وهذا\s+يعني|هذا\s+يعني|بحيث|حتى\s+(?:مرضاك|المريض)|يساعد\s+(?:مرضاك|المريض)|مرضاك\s+(?:راح|رح|سوف|يقدرون|ما يحتاجون)|المريض\s+(?:راح|رح|سوف|يقدر|ما يحتاج)/u
const FEATURE_AR = /مرة\s+(?:واحدة|وحدة)\s+(?:يوميا|باليوم|في اليوم)|جرعة|الجرعة|حبة|قلم|ابرة|حقنة|تركيبة|مفعول|يبدي\s+مفعوله|مع\s+الاكل|بدون\s+اكل|طويل\s+المفعول|سريع\s+المفعول/u

/** Names a product feature and what it means for the patient ("once daily, which means your patients..."). */
export function linksFeatureToBenefit(text: string): boolean {
  const t = lower(text)
  return (FEATURE_EN.test(t) && LINK_EN.test(t)) || (FEATURE_AR.test(t) && LINK_AR.test(t))
}

// ── True objection: put in proportion (minimise) ───────────────────────────

const MINIMISE_EN = /\b(?:compared (?:to|with) the benefit|outweigh\w*|the benefit (?:is|was) (?:much )?(?:bigger|greater|larger)|(?:mild|short[- ]lived|temporary|transient) and|usually (?:mild|temporary|goes away|settles)|goes away (?:after|within)|settles (?:after|within)|in (?:most|the first) (?:patients|weeks?|days?)|only (?:in )?(?:a few|a small number|\d+ ?(?:%|percent))|for most patients,? it|worth it for (?:the|your) patients?|weigh (?:it|that) against)\b/i
const MINIMISE_AR = /مقارنة\s+(?:ب|مع)\s*الفائدة|الفائدة\s+(?:اكبر|اكثر|اعلى)|بسيط(?:ة)?\s+و\s*(?:مؤقت|مؤقتة)|مؤقت(?:ة)?|يختفي|تختفي|يروح\s+(?:بعد|خلال)|تروح\s+(?:بعد|خلال)|عند\s+(?:قلة|عدد قليل)|اغلب\s+المرضى\s+(?:ما|لا)|تستاهل|يستاهل/u

/** Puts a real side effect or limit in proportion: mild, short, uncommon, or small next to the patient benefit. */
export function minimisesObjection(text: string): boolean {
  const t = lower(text)
  return MINIMISE_EN.test(t) || MINIMISE_AR.test(t)
}

// ── True objection: shown as a class effect (generalise) ──────────────────

const GENERALISE_EN = /\b(?:(?:all|every|most) (?:the )?(?:drugs?|medicines?|medications?|treatments?|products?|agents?) in (?:this|the|that) (?:class|group|category)|class effect|same (?:for|with|in) all (?:the )?(?:drugs?|medicines?|treatments?|\w+s) in|(?:all|every) (?:\w+ ){0,2}(?:inhibitors?|blockers?|statins?|agonists?|antagonists?|antibiotics?|insulins?|biologics?) (?:do|cause|have|can)|not specific to (?:our|this) (?:product|drug|medicine))\b/i
const GENERALISE_AR = /(?:كل|جميع|اغلب)\s+(?:ال)?(?:ادوية|علاجات|منتجات)\s+(?:هذه|هاي|هذي|نفس)\s*(?:ال)?(?:مجموعة|فئة|الصنف)|تأثير\s+(?:عام\s+)?(?:للمجموعة|للفئة)|مو\s+بس\s+(?:دواءنا|منتجنا)|ليس\s+خاصا\s+(?:بدوائنا|بمنتجنا)/u

/** Says the issue is shared by the whole drug class. Only creditable when approved information says so. */
export function generalisesObjection(text: string): boolean {
  const t = lower(text)
  return GENERALISE_EN.test(t) || GENERALISE_AR.test(t)
}

// ── Common ground with the doctor ──────────────────────────────────────────

const COMMON_EN = /\b(?:we both (?:want|need|care|agree|see)|(?:the )?same goal|(?:our|a) shared (?:goal|aim|interest)|like you,? (?:i|we)|you and i (?:both|agree|want)|as you (?:said|mentioned),? (?:your|the) (?:goal|aim|priority)|that(?:'s| is) (?:my|our) goal too|i (?:feel|think) the same|i agree with you that|we are on the same (?:side|page)|what matters to both of us)\b/i
const COMMON_AR = /نفس\s+الهدف|هدفنا\s+(?:واحد|نفسه)|كلنا\s+(?:نريد|نريد|نبي|نحب)|(?:احنا|نحن)\s+(?:الاثنين|الثنين)|مثل\s+(?:حضرتك|ما\s+قلت)|اتفق\s+وياك|اتفق\s+معك|متفقين|هذا\s+هدفي\s+(?:هم|ايضا)/u

/** Names a goal, value or interest the rep shares with the doctor ("We both want your patients to..."). */
export function buildsCommonGround(text: string): boolean {
  const t = lower(text)
  return COMMON_EN.test(t) || COMMON_AR.test(t)
}
