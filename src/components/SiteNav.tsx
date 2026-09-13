'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

interface NavItem { href: string; label: string; icon: ReactNode }

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" aria-hidden className="size-5" {...stroke}>{children}</svg>;
}

const NAV: NavItem[] = [
  {
    href: '/',
    label: 'Rezepte',
    icon: <Icon><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v14H5.5A1.5 1.5 0 0 0 4 19.5zM19 18v2H6" /><path d="M9 8h6M9 11h4" /></Icon>,
  },
  {
    href: '/plan',
    label: 'Wochenplan',
    icon: <Icon><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3.5V6M16 3.5V6" /></Icon>,
  },
  {
    href: '/einkaufsliste',
    label: 'Einkauf',
    icon: <Icon><path d="M4 8h16l-1.4 10.2A2 2 0 0 1 16.6 20H7.4a2 2 0 0 1-2-1.8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></Icon>,
  },
  {
    href: '/import',
    label: 'Import',
    icon: <Icon><path d="M12 3.5v10m0 0 3.5-3.5M12 13.5 8.5 10" /><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" /></Icon>,
  },
];

/** `/rezepte/...` still belongs to the Rezepte tab; every other tab is exact. */
function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/' || pathname.startsWith('/rezepte');
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function HeaderNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Hauptnavigation" className="hidden items-center gap-1 text-sm md:flex">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-full px-3 py-1.5 whitespace-nowrap transition ${
              active ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-accent-soft hover:text-ink'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The phone navigation.
 *
 * This app is used one-handed at a counter, where the top of the screen is the
 * hardest place to reach. The same four destinations sit in the header on a
 * desktop, where a bottom bar would be odd.
 */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Hauptnavigation"
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem] transition ${
                  active ? 'font-medium text-accent' : 'text-muted'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
