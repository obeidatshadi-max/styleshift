// What the "Which voice is you?" screen shows for each separated speaker, so a rep can tell
// the two voices apart quickly: a few of their own lines, how much and how often they spoke,
// who spoke first, and one clip of that voice to listen to.

export interface PreviewUtterance { speaker: string; text: string; start: number; end: number }

export interface SpeakerPreview {
  speaker: string
  /** First line, kept for callers that show only one. */
  sample: string
  /** Up to MAX_LINES of the speaker's own lines, in the order spoken, each cut to MAX_LINE_CHARS. */
  lines: string[]
  /** Share of all talk time, 0 to 100. */
  talkPercent: number
  turns: number
  spokeFirst: boolean
  /** One clear line of this voice to play back, in seconds into the recording; null when there are no times. */
  clip: { start: number; end: number } | null
}

export const MAX_LINES = 3
export const MAX_LINE_CHARS = 140
/** A line this short ("yes", "ok") says little about who is speaking; longer ones are preferred. */
const MIN_WORDS = 3
/** Clip length bounds, in seconds. */
const CLIP_MIN_SEC = 1.5
const CLIP_MAX_SEC = 8

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length
const cut = (t: string) => {
  const s = t.trim()
  return s.length <= MAX_LINE_CHARS ? s : `${s.slice(0, MAX_LINE_CHARS - 1).trimEnd()}…`
}

export function buildSpeakerPreviews(utterances: readonly PreviewUtterance[]): SpeakerPreview[] {
  const spoken = utterances.filter(u => u.text.trim())
  const speakers = Array.from(new Set(spoken.map(u => u.speaker)))
  const durationOf = (u: PreviewUtterance) => Math.max(0, u.end - u.start)
  const totalMs = spoken.reduce((sum, u) => sum + durationOf(u), 0)
  const first = spoken[0]?.speaker ?? null

  return speakers.map(speaker => {
    const own = spoken.filter(u => u.speaker === speaker)
    // Prefer lines with a few words; fill with short ones only when there are not enough.
    const meaningful = own.filter(u => words(u.text) >= MIN_WORDS)
    const picked = (meaningful.length >= MAX_LINES ? meaningful : [...meaningful, ...own.filter(u => words(u.text) < MIN_WORDS)])
      .slice(0, MAX_LINES)
      .sort((a, b) => a.start - b.start)
    const ms = own.reduce((sum, u) => sum + durationOf(u), 0)
    const clipSource = own.find(u => durationOf(u) >= CLIP_MIN_SEC * 1000) ?? own.find(u => durationOf(u) > 0) ?? null
    return {
      speaker,
      sample: own[0]?.text ?? '',
      lines: picked.map(u => cut(u.text)),
      talkPercent: totalMs > 0 ? Math.round((ms / totalMs) * 100) : 0,
      turns: own.length,
      spokeFirst: speaker === first,
      clip: clipSource
        ? { start: clipSource.start / 1000, end: Math.min(clipSource.end, clipSource.start + CLIP_MAX_SEC * 1000) / 1000 }
        : null,
    }
  })
}
