// SYNTHETIC EXAMPLES. Written by hand for tests and the development preview. They are not real
// conversations, not real doctors, and not validated Iraqi Arabic. Product names are invented.
import type { TranscriptSegment } from '@/schemas/conversationReport'
import type { TranscriptQuality } from './types'

const seg = (segmentIndex: number, speakerRole: 'rep' | 'counterpart', text: string, startMs: number, endMs: number): TranscriptSegment =>
  ({ segmentIndex, speakerRole, text, startMs, endMs, createdAt: null })

/** English, about 70 seconds. The tolerability concern is answered with packaging. */
export const SYNTHETIC_EN: TranscriptSegment[] = [
  seg(0, 'rep', 'Good morning doctor, thank you for your time. I wanted to talk about Zelvora for your hypertension patients.', 0, 7000),
  seg(1, 'counterpart', 'Okay, I have about five minutes. What is new?', 7600, 11000),
  seg(2, 'rep', 'How do you usually choose a second medicine when blood pressure is not controlled?', 11400, 16000),
  seg(3, 'counterpart', 'Mostly by cost and by what my patients can tolerate. My concern is patients stopping because of side effects.', 16500, 24000),
  seg(4, 'rep', 'Our packaging is very convenient, it is one tablet a day in a calendar pack.', 24400, 30000),
  seg(5, 'counterpart', 'Hmm. And is it available in the pharmacies near here?', 30600, 34000),
  seg(6, 'rep', 'Yes, it is available in most pharmacies in the area.', 34300, 38000),
  seg(7, 'counterpart', 'Do you have any study on adherence?', 38500, 41000),
  seg(8, 'rep', 'So adherence matters to you. Which part of adherence is the main problem for your patients?', 41300, 47000),
  seg(9, 'counterpart', 'They forget doses and some stop after dizziness in the first week.', 47500, 53000),
  seg(10, 'rep', 'I can bring you the approved data on adherence next Tuesday. Would that suit you?', 53400, 59000),
  seg(11, 'counterpart', 'Yes, Tuesday is fine. Bring the data.', 59500, 62000),
  seg(12, 'rep', 'Thank you doctor, I will see you Tuesday with the data.', 62400, 66000),
  seg(13, 'counterpart', 'Okay, thank you.', 66400, 68000),
]

/** Iraqi Arabic, short. The doctor asks for evidence; the rep answers with a general claim. */
export const SYNTHETIC_AR: TranscriptSegment[] = [
  seg(0, 'rep', 'صباح الخير دكتور، جيت احجيلك عن دواء زيلفورا للضغط.', 0, 5000),
  seg(1, 'counterpart', 'تفضل، بس عندي مرضى هواية اليوم.', 5500, 8000),
  seg(2, 'rep', 'شلون تختار العلاج الثاني للمريض اللي ضغطه ما منضبط؟', 8400, 13000),
  seg(3, 'counterpart', 'حسب السعر، والمريض اذا يتحمل. اكو مرضى يتركون العلاج من الاعراض الجانبية.', 13500, 20000),
  seg(4, 'rep', 'دواءنا اكيد احسن من كل الادوية الثانية.', 20400, 24000),
  seg(5, 'counterpart', 'عندك دراسة على هذا الكلام؟', 24500, 27000),
  seg(6, 'rep', 'اكيد دكتور، اجيبلك المعلومات المعتمدة الزيارة الجاية.', 27300, 32000),
  seg(7, 'counterpart', 'زين، جيبها.', 32500, 34000),
]

/** Mixed Arabic and English pharmaceutical terms, as often spoken in Iraq. */
export const SYNTHETIC_MIXED: TranscriptSegment[] = [
  seg(0, 'rep', 'دكتور، عندنا data جديدة عن ال adherence مال Zelvora.', 0, 5000),
  seg(1, 'counterpart', 'شكد ال dose؟ 5 mg لو 10 mg؟', 5400, 9000),
  seg(2, 'rep', 'تبدي ب 5 mg مرة يوميا حسب النشرة.', 9300, 13000),
  seg(3, 'counterpart', 'والسعر؟ المرضى عدنا ما يكدرون يشترون الغالي.', 13400, 18000),
  seg(4, 'rep', 'فهمت، السعر مهم لمرضاك. شنو السعر اللي يكدرون عليه بالعادة؟', 18300, 24000),
  seg(5, 'counterpart', 'تقريبا عشرة الاف بالشهر.', 24400, 27000),
]

/** Provider confidence for SYNTHETIC_MIXED: the dose words were uncertain. */
export const SYNTHETIC_MIXED_QUALITY: TranscriptQuality = {
  provider: 'assemblyai', languageCode: 'ar', audioDurationSec: 27, wordCount: 40, wordsWithConfidence: 40, meanConfidence: 0.81,
  lowConfidenceThreshold: 0.6, transcriptVersion: 1,
  lowConfidenceWords: [
    { segmentIndex: 1, word: 'mg', confidence: 0.41, kind: 'number', startSec: 6.2 },
    { segmentIndex: 2, word: '5', confidence: 0.52, kind: 'number', startSec: 10.1 },
  ],
}

/** A model response for SYNTHETIC_EN, shaped like COACH_SHAPE. Includes deliberate bad references the grounding must drop. */
export const SYNTHETIC_EN_MODEL_OUTPUT = {
  mainTopic: 'A second medicine for patients whose blood pressure is not controlled.',
  doctorPriorities: [
    { text: 'Patients stopping because of side effects', evidence: { segmentIndex: 3 } },
    { text: 'Cost for patients', evidence: { segmentIndex: 3 } },
    { text: 'A rep line is not a doctor priority', evidence: { segmentIndex: 4 } },
  ],
  repApproach: 'You opened with the product, asked one good question, then answered questions.',
  nextStep: { agreed: true, text: 'Bring approved adherence data on Tuesday.', evidence: [{ segmentIndex: 10 }, { segmentIndex: 11 }] },
  stages: [
    { stage: 'opening', observed: true, evidence: [{ segmentIndex: 0 }] },
    { stage: 'needs_discovery', observed: true, evidence: [{ segmentIndex: 2 }] },
    { stage: 'product_evidence', observed: true, evidence: [{ segmentIndex: 4 }] },
    { stage: 'concerns', observed: true, evidence: [{ segmentIndex: 3 }] },
    { stage: 'closing', observed: true, evidence: [{ segmentIndex: 999 }] },
  ],
  keyMoments: [
    {
      cueType: 'concern', cue: { segmentIndex: 3 }, response: { segmentIndex: 4 }, addressed: 'not_addressed', domain: 'pharma_skills',
      observation: 'The doctor named side effects as the reason patients stop. You replied about packaging.',
      interpretation: 'The doctor may have needed the side-effect concern explored first.',
      alternativeExplanation: 'You may have planned to come back to side effects later.',
      confidence: 'high', confidenceReason: 'The concern and the reply are both explicit.',
      suggestedResponse: 'Which side effects most often make your patients stop treatment?',
      practiceTask: 'Reply with one acknowledgement and one clarifying question.',
      successCriterion: 'Your reply acknowledges the side-effect concern and asks one question about it, with no product claim.',
    },
    {
      cueType: 'evidence_request', cue: { segmentIndex: 7 }, response: { segmentIndex: 8 }, addressed: 'addressed', domain: 'pharma_skills',
      observation: 'The doctor asked for a study. You summarised and asked which part of adherence matters.',
      interpretation: null, alternativeExplanation: 'ignored because there is no interpretation',
      confidence: 'medium', confidenceReason: 'Clear wording.',
      suggestedResponse: null, practiceTask: null, successCriterion: null,
    },
    { cueType: 'question', cue: { segmentIndex: 4 }, response: { segmentIndex: 5 }, addressed: 'addressed', observation: 'Wrong roles: must be dropped.' },
    { cueType: 'question', cue: { segmentIndex: 5 }, response: { segmentIndex: 2 }, addressed: 'addressed', observation: 'Reply before cue: must be dropped.' },
  ],
  concerns: [
    { cue: { segmentIndex: 3 }, clarifiedBeforeAnswering: false },
    { cue: { segmentIndex: 7 }, clarifiedBeforeAnswering: true },
    { cue: { segmentIndex: 5 }, clarifiedBeforeAnswering: null },
  ],
  listeningSummaries: [{ segmentIndex: 8 }, { segmentIndex: 9 }],
  evidenceClaims: [],
  priority: {
    behavior: 'Clarify a concern before answering it.',
    whyItMatters: 'The doctor\'s main worry was side effects, and it was not explored.',
    successCriterion: 'Your reply acknowledges the concern and asks one question about it.',
    momentIndex: 0,
  },
}

/** A model response for SYNTHETIC_AR (Arabic free text, as the Arabic report would be). */
export const SYNTHETIC_AR_MODEL_OUTPUT = {
  mainTopic: 'علاج ثانٍ لمرضى الضغط غير المنضبط.',
  doctorPriorities: [{ text: 'السعر وتحمّل المريض للعلاج', evidence: { segmentIndex: 3 } }],
  repApproach: 'سألت سؤالًا مفتوحًا جيدًا، ثم قدّمت ادعاء مقارنة عامًا.',
  nextStep: { agreed: true, text: 'جلب المعلومات المعتمدة في الزيارة القادمة.', evidence: [{ segmentIndex: 6 }, { segmentIndex: 7 }] },
  stages: [
    { stage: 'opening', observed: true, evidence: [{ segmentIndex: 0 }] },
    { stage: 'needs_discovery', observed: true, evidence: [{ segmentIndex: 2 }] },
    { stage: 'concerns', observed: true, evidence: [{ segmentIndex: 3 }] },
    { stage: 'closing', observed: true, evidence: [{ segmentIndex: 6 }] },
  ],
  keyMoments: [{
    cueType: 'concern', cue: { segmentIndex: 3 }, response: { segmentIndex: 4 }, addressed: 'not_addressed', domain: 'pharma_skills',
    observation: 'ذكر الطبيب أن بعض المرضى يتركون العلاج بسبب الأعراض الجانبية. رددت بادعاء أن دواءك أفضل من كل الأدوية.',
    interpretation: 'ربما كان الطبيب يحتاج أن تسأل عن الأعراض أولًا.', alternativeExplanation: 'ربما أردت جذب اهتمامه قبل التفاصيل.',
    confidence: 'high', confidenceReason: 'كلام الطبيب وردك واضحان.',
    suggestedResponse: 'أي أعراض جانبية تخلي مرضاك يتركون العلاج أكثر شي؟',
    practiceTask: 'رد بجملة تقدير وسؤال واحد عن الأعراض.',
    successCriterion: 'ردك يعترف بقلق الطبيب ويسأل سؤالًا واحدًا عن الأعراض، بدون أي ادعاء عن الدواء.',
  }],
  concerns: [{ cue: { segmentIndex: 3 }, clarifiedBeforeAnswering: false }],
  listeningSummaries: [],
  evidenceClaims: [{ segmentIndex: 4 }],
  priority: { behavior: 'اسأل عن القلق قبل أن تجيب.', whyItMatters: 'قلق الطبيب الأساسي كان ترك المرضى للعلاج.', successCriterion: 'ردك يعترف بالقلق ويسأل سؤالًا واحدًا عنه.', momentIndex: 0 },
}
