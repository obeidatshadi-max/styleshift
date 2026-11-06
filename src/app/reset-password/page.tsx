import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import ResetPasswordForm from '@/components/auth/ResetPasswordForm'

export const dynamic = 'force-dynamic'

/** Reached from the emailed link, which signs the person in first (see /auth/confirm). Without that session there is nothing to reset. */
export default async function ResetPasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?confirm_error=reset')
  return <ResetPasswordForm />
}
