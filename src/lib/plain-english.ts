// Shared wording rules for AI-written English that reps and managers read.
// Most StyleShift users are not native English speakers (Iraq and the wider
// region), so every model that writes English for them gets the same rule.
// Arabic output has its own rules and does not use these lines.

/** For coaching, feedback and scenario text written in English. */
export const PLAIN_ENGLISH_RULE =
  'The reader is NOT a native English speaker, so use plain, simple English: ' +
  'short sentences (about 15 words or fewer), one idea per sentence, common everyday words, and active voice. ' +
  'No idioms, metaphors, slang or phrasal verbs (write "find out", not "uncover"; "ask", not "probe"; ' +
  '"show", not "demonstrate"; "use", not "leverage"). ' +
  'Keep product names, medical terms, numbers and units exactly as given. ' +
  'If you must use another unusual word, explain it in a few simple words.'

/** For an AI doctor or customer who speaks English to the rep. */
export const PLAIN_SPEECH_RULE =
  'The rep may not be a native English speaker: speak naturally but use clear, common words, ' +
  'short sentences and no slang or idioms.'
