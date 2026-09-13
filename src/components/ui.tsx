import Link from 'next/link';
import type { ReactNode } from 'react';

// Re-exported so pages keep importing their formatting from one place, while
// the pure functions stay in the domain layer where they are tested.
export {
  formatDateLong, formatDateShort, formatMinutes, isoWeekNumber,
} from '@/domain/calendar/format';

export function Card({ children, className = '', role }: {
  children: ReactNode; className?: string; role?: string;
}) {
  return (
    <div role={role} className={`rounded-xl border border-line bg-card ${className}`}>{children}</div>
  );
}

export function PageHeader({ title, subtitle, action }: {
  title: ReactNode; subtitle?: ReactNode; action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <div className="mr-auto">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <Card className="px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {hint ? <p className="mx-auto mt-2 max-w-md text-sm text-muted">{hint}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </Card>
  );
}

const BADGE_TONES = {
  neutral: 'border-line text-muted',
  accent: 'border-transparent bg-accent-soft text-accent',
  warn: 'border-warn-line bg-warn-bg text-ink',
} as const;

export function Badge({ children, tone = 'neutral', title }: {
  children: ReactNode; tone?: keyof typeof BADGE_TONES; title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** A badge that filters. Used for tags, which looked clickable long before they were. */
export function BadgeLink({ href, children, tone = 'accent' }: {
  href: string; children: ReactNode; tone?: keyof typeof BADGE_TONES;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs transition hover:opacity-80 ${BADGE_TONES[tone]}`}
    >
      {children}
    </Link>
  );
}

export function ButtonLink({ href, children, variant = 'secondary', className = '' }: {
  href: string; children: ReactNode; variant?: ButtonVariant; className?: string;
}) {
  return <Link href={href} className={`${buttonClass(variant)} ${className}`}>{children}</Link>;
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

/**
 * `min-h-11` is 44px — the smallest target a wet fingertip hits reliably, and
 * the reason every button here is taller than it looks like it needs to be.
 */
export function buttonClass(variant: ButtonVariant = 'secondary') {
  const base = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-default disabled:opacity-50';
  if (variant === 'primary') return `${base} bg-accent text-accent-ink hover:opacity-90`;
  if (variant === 'danger') return `${base} border border-danger/50 text-danger hover:bg-danger/10`;
  if (variant === 'ghost') return `${base} text-muted hover:bg-accent-soft hover:text-ink`;
  return `${base} border border-line hover:bg-accent-soft`;
}

export const inputClass =
  'w-full min-h-11 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent';

/** Same look, but for the dense grids where 44px would break the layout. */
export const inputClassCompact =
  'w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-ink focus:border-accent';

export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'einfach', medium: 'mittel', hard: 'anspruchsvoll',
};

export const TEMPERATURE_MODE_LABELS: Record<string, string> = {
  ober_unterhitze: 'Ober-/Unterhitze',
  umluft: 'Umluft',
  grill: 'Grill',
  herd: 'Herd',
};

/** Read-only star rating. `null` renders nothing at all rather than five greys. */
export function Stars({ value, className = '' }: { value: number | null; className?: string }) {
  if (!value) return null;
  return (
    <span
      className={`text-accent ${className}`}
      title={`${value} von 5`}
      aria-label={`Bewertung: ${value} von 5`}
    >
      {'★'.repeat(value)}<span className="text-muted opacity-40">{'★'.repeat(5 - value)}</span>
    </span>
  );
}
