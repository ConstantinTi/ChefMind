/**
 * Pure display formatting for times and dates.
 *
 * Lives in the domain layer because it is pure and because it is exactly the
 * kind of code that is worth a test: ISO week numbers and year boundaries are
 * quietly wrong far more often than they look.
 */

export function formatMinutes(total: number | null): string | null {
  if (!total || total <= 0) return null;
  if (total < 60) return `${total} Min.`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
] as const;

/** "2026-09-07" -> "7. September". ISO dates belong in URLs, not on screen. */
export function formatDateLong(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}. ${MONTHS[(m ?? 1) - 1]}`;
}

/** "2026-09-07" -> "7.9." */
export function formatDateShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}.${m}.`;
}

/**
 * ISO-8601 week number — the "KW" a German shopping week is named by.
 *
 * Built in UTC on purpose: doing this in local time shifts the reference
 * Thursday across a day boundary during a DST changeover and hands back the
 * neighbouring week.
 */
export function isoWeekNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  // Shift to the Thursday of this week; the year that Thursday falls in owns it.
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
