import { describe, expect, it } from 'vitest'
import { buildSpeakerPreviews, MAX_LINE_CHARS } from './speaker-previews'

const u = (speaker: string, text: string, startSec: number, endSec: number) => ({ speaker, text, start: startSec * 1000, end: endSec * 1000 })

describe('buildSpeakerPreviews', () => {
  const talk = [
    u('A', 'نعم', 0, 0.5),
    u('B', 'دكتور هذا الدوا ما يحتاج تعديل جرعة', 1, 5),
    u('A', 'شنو الفرق بينه وبين الاملوديبين؟', 6, 9),
    u('B', 'اوكي', 9.5, 10),
    u('A', 'بس المريض يدفع من جيبه', 11, 14),
    u('B', 'السعر قريب من الماركة', 15, 18),
    u('A', 'خلي اشوف الدراسة الكاملة', 19, 22),
  ]
  const [a, b] = buildSpeakerPreviews(talk)

  it('shows up to three of each speaker\'s own lines, preferring lines with a few words, in spoken order', () => {
    expect(a.lines).toEqual(['شنو الفرق بينه وبين الاملوديبين؟', 'بس المريض يدفع من جيبه', 'خلي اشوف الدراسة الكاملة'])
    expect(b.lines).toEqual(['دكتور هذا الدوا ما يحتاج تعديل جرعة', 'اوكي', 'السعر قريب من الماركة'])
  })
  it('gives talk share, turns and who spoke first', () => {
    expect(a.turns).toBe(4)
    expect(b.turns).toBe(3)
    expect(a.talkPercent + b.talkPercent).toBe(100)
    expect(a.talkPercent).toBe(Math.round((9.5 / 17) * 100))
    expect(a.spokeFirst).toBe(true)
    expect(b.spokeFirst).toBe(false)
  })
  it('picks a clip of at least 1.5 s of that voice, capped at 8 s', () => {
    expect(a.clip).toEqual({ start: 6, end: 9 })
    expect(buildSpeakerPreviews([u('A', 'one long monologue here', 0, 30)])[0].clip).toEqual({ start: 0, end: 8 })
  })
  it('keeps sample as the first line, cuts long lines, and ignores empty text', () => {
    const [p] = buildSpeakerPreviews([u('A', '  ', 0, 1), u('A', 'x '.repeat(200), 1, 4)])
    expect(p.sample.trim().startsWith('x')).toBe(true)
    expect(p.lines[0].length).toBeLessThanOrEqual(MAX_LINE_CHARS)
    expect(p.lines[0].endsWith('…')).toBe(true)
  })
})
