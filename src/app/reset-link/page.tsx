import { Suspense } from 'react'
import ResetLinkForm from '@/components/auth/ResetLinkForm'

/** The page the password-reset email links to. See ResetLinkForm for why it asks for a button press. */
export default function ResetLinkPage() {
  return (
    <Suspense fallback={null}>
      <ResetLinkForm />
    </Suspense>
  )
}
