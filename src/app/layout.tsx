import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'StyleShift — Read the room. Win the call.',
  description: 'Social style mastery game for pharma sales reps.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
