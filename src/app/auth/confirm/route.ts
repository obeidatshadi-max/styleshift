import { type EmailOtpType } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// Email-confirmation / magic-link callback.
// Supabase sends the user here from the "Confirm signup" email template:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/play
// verifyOtp exchanges the token for a session (cookies set via the server client),
// then we send them on to `next`. No PKCE code_verifier needed, so it works even
// when the link is opened in a different browser / webmail client.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/play'

  const redirectTo = request.nextUrl.clone()
  redirectTo.searchParams.delete('token_hash')
  redirectTo.searchParams.delete('type')
  redirectTo.searchParams.delete('code')
  redirectTo.searchParams.delete('next')

  const supabase = await createClient()

  // Preferred path: token_hash from the "Confirm signup" template. Works in any
  // browser/webmail since it needs no PKCE verifier.
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      redirectTo.pathname = next
      return NextResponse.redirect(redirectTo)
    }
  }

  // Fallback: default {{ .ConfirmationURL }} template returns a PKCE `code`.
  // Only succeeds when the link is opened in the same browser that signed up.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      redirectTo.pathname = next
      return NextResponse.redirect(redirectTo)
    }
  }

  // Token missing/expired/invalid → send back to login with a flag so the form
  // can explain what happened.
  redirectTo.pathname = '/login'
  redirectTo.searchParams.set('confirm_error', '1')
  return NextResponse.redirect(redirectTo)
}
