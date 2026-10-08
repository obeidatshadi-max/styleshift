/**
 * Normalizes text for MATCHING only (never for display or storage): lets an
 * approved-claim or prohibited-claim phrase match regardless of diacritics,
 * alef/ya spelling variants, Persian/Arabic-Indic digits, or Iraqi letters
 * (گ چ پ ڤ) that keyboards often replace with their Arabic neighbours.
 * It does not translate and does not turn dialect into MSA.
 */
const TASHKEEL = /[ً-ٰٟۖ-ۭ]/g
const TATWEEL = /ـ/g
const INDIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
}
const LETTER_MAP: Record<string, string> = {
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا',
  'ى': 'ي', 'ئ': 'ي', 'ؤ': 'و', 'ة': 'ه',
  'گ': 'ك', 'ک': 'ك', 'چ': 'ج', 'پ': 'ب', 'ڤ': 'ف',
}

export function normalizeForMatch(input: string): string {
  let out = input.normalize('NFKC').replace(TASHKEEL, '').replace(TATWEEL, '')
  out = out.replace(/[٠-٩۰-۹]/g, d => INDIC_DIGITS[d] ?? d)
  out = out.replace(/[أإآٱىئؤةگکچپڤ]/g, c => LETTER_MAP[c] ?? c)
  return out.toLowerCase().replace(/[،؛؟.,;:!?()[\]{}"'«»]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** True when `phrase` occurs in `text` as whole words after normalization. */
export function containsPhrase(text: string, phrase: string): boolean {
  const p = normalizeForMatch(phrase)
  if (!p) return false
  return ` ${normalizeForMatch(text)} `.includes(` ${p} `)
}

export function hasArabic(text: string): boolean {
  return /[؀-ۿ]/.test(text)
}
