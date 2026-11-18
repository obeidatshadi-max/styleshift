import { notFound } from 'next/navigation'
import ConversationCoachView from '@/components/report/ConversationCoachView'
import { groundCoach } from '@/lib/conversation-coach/ground'
import {
  SYNTHETIC_AR, SYNTHETIC_AR_MODEL_OUTPUT, SYNTHETIC_EN, SYNTHETIC_EN_MODEL_OUTPUT, SYNTHETIC_MIXED, SYNTHETIC_MIXED_QUALITY,
} from '@/lib/conversation-coach/fixtures'

/**
 * DEVELOPMENT FIXTURE ONLY. Shows the conversation coach built from hand-written synthetic transcripts and
 * hand-written model output, run through the real grounding code. Never available in a production build,
 * never saved, and every card is labelled SYNTHETIC. Use it to review layout when live AI keys are missing.
 */
export default function ConversationCoachFixturePage() {
  if (process.env.NODE_ENV === 'production') notFound()
  const examples = [
    { title: 'English (synthetic)', coach: groundCoach(SYNTHETIC_EN_MODEL_OUTPUT, SYNTHETIC_EN, { lang: 'en', partialRecording: false, transcriptQuality: null, delivery: { wpm: 152, totalHesitations: 4, pitchRange: 88 } }) },
    { title: 'Iraqi Arabic (synthetic, Arabic output)', coach: groundCoach(SYNTHETIC_AR_MODEL_OUTPUT, SYNTHETIC_AR, { lang: 'ar', partialRecording: false, transcriptQuality: null, delivery: null }) },
    { title: 'Mixed Arabic-English, partial visit, uncertain dose words, no model output (synthetic)', coach: groundCoach(null, SYNTHETIC_MIXED, { lang: 'en', partialRecording: true, transcriptQuality: SYNTHETIC_MIXED_QUALITY, delivery: null }) },
  ].map(e => ({ ...e, coach: { ...e.coach, synthetic: true } }))
  return <main style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: 'auto', padding: 16 }}>
    <h1 style={{ fontSize: 20 }}>Conversation coach — development fixtures</h1>
    <p>Synthetic examples only. Not real conversations, not live analysis, not validated Iraqi Arabic. Switch the app language to see Arabic labels.</p>
    {examples.map(e => <section key={e.title} style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 16 }}>{e.title}</h2>
      <ConversationCoachView coach={e.coach} sessionId="fixture" audioUrl={null} />
    </section>)}
  </main>
}
