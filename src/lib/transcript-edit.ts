// Pure logic for correcting a saved recording transcript: swap who said a line and fix the words.
// A correction never changes old rows. It becomes a NEW transcript version, so every report can
// still cite the exact version it was written from (see 033_conversation_reports.sql).

export interface SegmentRow {
  segment_index: number
  speaker_role: 'rep' | 'counterpart'
  text: string
  start_ms: number | null
  end_ms: number | null
}

export interface TextEdit { segmentIndex: number; text: string }
export interface PhraseProposal { heard: string; meant: string }

export const MAX_SEGMENT_TEXT = 2000
export const MAX_PROPOSAL_WORDS = 8
export const MAX_PROPOSAL_CHARS = 120

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean)

/** The words that were replaced: what the speech engine wrote and what the speaker really said.
 * Only a clean substitution of a short run of words counts. A pure insertion or deletion, or a
 * rewrite of most of the line, says nothing reliable about a phrase, so it returns null. */
export function diffFragment(original: string, edited: string): PhraseProposal | null {
  const a = words(original)
  const b = words(edited)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  const heard = a.slice(start, endA).join(' ')
  const meant = b.slice(start, endB).join(' ')
  if (!heard || !meant) return null
  if (endA - start > MAX_PROPOSAL_WORDS || endB - start > MAX_PROPOSAL_WORDS) return null
  if (heard.length > MAX_PROPOSAL_CHARS || meant.length > MAX_PROPOSAL_CHARS) return null
  return { heard, meant }
}

export type CorrectionResult =
  | { ok: true; rows: SegmentRow[]; changed: number; proposals: PhraseProposal[] }
  | { ok: false; error: string }

/** Applies speaker swaps and text edits to one transcript version's rows. */
export function applyCorrection(
  rows: SegmentRow[], input: { swapSegmentIndexes?: number[]; edits?: TextEdit[] },
): CorrectionResult {
  const byIndex = new Map(rows.map(r => [r.segment_index, r]))
  const swaps = new Set(input.swapSegmentIndexes ?? [])
  const edits = new Map<number, string>()
  for (const e of input.edits ?? []) {
    if (!Number.isInteger(e.segmentIndex) || !byIndex.has(e.segmentIndex)) return { ok: false, error: 'Unknown segment' }
    if (typeof e.text !== 'string') return { ok: false, error: 'Invalid text' }
    const text = e.text.trim()
    if (!text) return { ok: false, error: 'A line cannot be empty' }
    if (text.length > MAX_SEGMENT_TEXT) return { ok: false, error: 'A line is too long' }
    edits.set(e.segmentIndex, text)
  }
  for (const i of swaps) if (!byIndex.has(i)) return { ok: false, error: 'Unknown segment' }

  let changed = 0
  const proposals: PhraseProposal[] = []
  const seen = new Set<string>()
  const out = rows.map(r => {
    const swapped = swaps.has(r.segment_index)
    const speaker_role: SegmentRow['speaker_role'] = swapped ? (r.speaker_role === 'rep' ? 'counterpart' : 'rep') : r.speaker_role
    const text = edits.get(r.segment_index) ?? r.text
    if (swapped || text !== r.text) changed++
    if (text !== r.text) {
      const p = diffFragment(r.text, text)
      const key = p ? `${p.heard}\u0000${p.meant}` : ''
      if (p && !seen.has(key)) { seen.add(key); proposals.push(p) }
    }
    return { ...r, speaker_role, text }
  })
  return { ok: true, rows: out, changed, proposals }
}
