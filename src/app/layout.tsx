import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Op Koers',
  description: 'Slimme sport- en herstelapp voor marathon training en fysio',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Op Koers',
  },
}

export const viewport: Viewport = {
  themeColor: '#f97316',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className="h-full">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="h-full antialiased">
        {children}
        <script dangerouslySetInnerHTML={{
          __html: `if('serviceWorker'in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js')})}`
        }} />
      </body>
    </html>
  )
}
