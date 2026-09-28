import type { Metadata } from 'next';
import { IBM_Plex_Mono, Newsreader, Schibsted_Grotesk } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
});

const schibsted = Schibsted_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-schibsted',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
});

export const metadata: Metadata = {
  title: 'monis.rent — build your workspace in 3D',
  description: 'Rent desks, monitors and accessories. Arrange your setup in a 3D room, then reserve it.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${newsreader.variable} ${schibsted.variable} ${plexMono.variable} flex min-h-dvh flex-col antialiased`}
      >
        <header className="shrink-0 border-b border-line bg-bone">
          <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4">
            <Link href="/" className="font-display text-xl tracking-tight">
              monis<span className="font-mono text-sm font-normal text-ink-soft">.rent</span>
            </Link>
            <div className="flex items-center gap-3">
              {/* The five category tiles — the brand's color system, at a glance. */}
              <div aria-hidden="true" className="flex gap-1">
                {[
                  'var(--tile-desk)',
                  'var(--tile-chair)',
                  'var(--tile-monitor)',
                  'var(--tile-lamp)',
                  'var(--tile-accessory)',
                ].map((tile) => (
                  <span key={tile} className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: tile }} />
                ))}
              </div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft">
                Rent by the week
              </p>
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
