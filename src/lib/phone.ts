/**
 * Normalizes a rep-entered mobile number to E.164 for Supabase Phone Auth
 * (SMS OTP). Assumes Iraq (+964) when no country code is present, since
 * that's the only market this rep-login flow serves today. Returns null for
 * anything that doesn't look like a plausible number, so callers can reject
 * it before it reaches Supabase/Twilio.
 */
export function toE164Iraq(raw: string): string | null {
  const digits = raw.trim().replace(/[^\d+]/g, '')

  if (digits.startsWith('+')) {
    const rest = digits.slice(1)
    return /^\d{8,15}$/.test(rest) ? `+${rest}` : null
  }
  if (digits.startsWith('00')) {
    const rest = digits.slice(2)
    return /^\d{8,15}$/.test(rest) ? `+${rest}` : null
  }
  if (digits.startsWith('964')) {
    return /^\d{11,13}$/.test(digits) ? `+${digits}` : null
  }
  if (digits.startsWith('0')) {
    const rest = digits.slice(1)
    return /^\d{9,10}$/.test(rest) ? `+964${rest}` : null
  }
  // Bare local number with the leading 0 already stripped off.
  return /^\d{9,10}$/.test(digits) ? `+964${digits}` : null
}
