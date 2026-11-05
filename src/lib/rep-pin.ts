// A rep who signs in with a mobile number has a hidden login email, <mobile>@s.styleshift.rep, and their
// 6-digit PIN is the account password (see /api/rep-join and /api/rep-login).

export const REP_EMAIL_DOMAIN = '@s.styleshift.rep'
export const PIN_LENGTH = 6

export const isMobileRepEmail = (email: unknown): email is string =>
  typeof email === 'string' && email.toLowerCase().endsWith(REP_EMAIL_DOMAIN)

export const mobileFromEmail = (email: string) => email.slice(0, -REP_EMAIL_DOMAIN.length)

/** Too easy to guess: 000000, 123456, 654321. */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true
  const d = [...pin].map(Number)
  const step = d[1] - d[0]
  return Math.abs(step) === 1 && d.every((x, i) => i === 0 || x - d[i - 1] === step)
}

/** A random 6-digit PIN, every digit equally likely (bytes above 249 are skipped so there is no bias). */
export function generatePin(random: (n: number) => Uint8Array): string {
  for (;;) {
    let pin = ''
    while (pin.length < PIN_LENGTH) {
      for (const b of random(16)) {
        if (b < 250 && pin.length < PIN_LENGTH) pin += String(b % 10)
      }
    }
    if (!isWeakPin(pin)) return pin
  }
}
