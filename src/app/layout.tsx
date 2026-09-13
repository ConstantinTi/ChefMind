import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { BottomNav, HeaderNav } from '@/components/SiteNav';
import { ServiceWorker } from '@/components/ServiceWorker';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ChefMind', template: '%s · ChefMind' },
  description: 'Private Rezeptverwaltung mit Portionsrechner, Wochenplan und Einkaufsliste.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'ChefMind', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    // iOS ignores SVG icons and the manifest entirely for home-screen installs.
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  // The header and the tab bar both sit on --paper, so the browser chrome should
  // follow the palette rather than staying orange in a dark kitchen.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf9f5' },
    { media: '(prefers-color-scheme: dark)', color: '#16150f' },
  ],
  width: 'device-width',
  initialScale: 1,
  // The kitchen use case is one-handed with wet fingers; allow zoom.
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-dvh">
        <a
          href="#inhalt"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink"
        >
          Zum Inhalt springen
        </a>

        <header className="no-print sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
            <Link href="/" className="mr-auto text-lg font-semibold tracking-tight">
              Chef<span className="text-accent">Mind</span>
            </Link>
            <HeaderNav />
            <Link
              href="/rezepte/neu"
              className="inline-flex min-h-11 items-center rounded-full bg-accent px-3.5 whitespace-nowrap text-accent-ink transition hover:opacity-90"
            >
              <span className="text-sm font-medium">+ Neu</span>
            </Link>
          </div>
        </header>

        {/* pb-24 clears the phone tab bar; md drops back to normal spacing. */}
        <main id="inhalt" className="mx-auto max-w-5xl px-4 py-6 pb-24 md:pb-10">{children}</main>

        <BottomNav />
        <ServiceWorker />
      </body>
    </html>
  );
}
