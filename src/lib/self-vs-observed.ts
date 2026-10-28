import type { SocialStyle } from '@/schemas/conversationReport'

// Self-rating vs observed. Personality-state research (Collis et al. 2026,
// Applied Psychology, review of 33 studies) notes that self-report needs
// self-awareness and misses what others can see, so the rep commits to their
// own read of the call first and then compares it with the transcript-based
// read. The outcome is a prompt to look at the quoted signals. It is never a
// verdict: people feel one way and sound another, and the observed style is
// itself only a "possible style" with an alternative explanation.

export type SelfCheckOutcome = 'match' | 'differs' | 'no_observation'

export function compareSelfToObserved(self: SocialStyle, observed: SocialStyle | null): SelfCheckOutcome {
  if (observed === null) return 'no_observation'
  return self === observed ? 'match' : 'differs'
}
