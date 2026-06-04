import type { Metadata } from 'next'
import './globals.css'
import { LanguageProvider } from '@/lib/i18n'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://style-shift.netlify.app'
const TITLE = 'StyleShift — Read the room. Win the call.'
const DESCRIPTION = 'Social Style mastery game for pharma sales reps — read doctors, defuse objections, and win the call.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  // opengraph-image.tsx auto-supplies the share image for both OG and Twitter.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: 'StyleShift',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  )
}
