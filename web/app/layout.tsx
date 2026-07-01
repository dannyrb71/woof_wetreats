import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Woof Wetreats',
  description: 'Dog boarding and daycare bookings',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
