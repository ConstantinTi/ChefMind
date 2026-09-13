import type { Quantity, Unit } from './types';
import { prefersFractions, unitDef } from './units';

export interface Fraction {
  whole: number;
  numerator: number;
  denominator: number;
}

/** The only fractions a kitchen actually uses. Order matters — see `toFraction`. */
export const KITCHEN_DENOMINATORS = [2, 3, 4, 8] as const;

const VULGAR: Record<string, string> = {
  '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾',
  '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞',
};

export interface FormatOptions {
  /** 'auto' uses fractions only where the unit prefers them (spoons, cups, pieces). */
  style?: 'auto' | 'fraction' | 'decimal';
  unicodeFractions?: boolean;
  denominators?: readonly number[];
  tolerance?: number;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Snaps to a kitchen-legal fraction, or returns null so the caller falls back
 * to a decimal.
 *
 * Deliberately NOT a general continued-fraction approximation: that would
 * happily hand you "5/7 Tassen". Trying the denominators in ascending order is
 * what makes 0.5 render as 1/2 rather than 4/8.
 */
export function toFraction(
  value: number,
  opts: Pick<FormatOptions, 'denominators' | 'tolerance'> = {},
): Fraction | null {
  const denominators = opts.denominators ?? KITCHEN_DENOMINATORS;
  const tolerance = opts.tolerance ?? 0.02;

  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const whole = Math.floor(abs);
  const frac = abs - whole;

  if (frac < tolerance) return { whole: sign * whole, numerator: 0, denominator: 1 };
  if (1 - frac < tolerance) return { whole: sign * (whole + 1), numerator: 0, denominator: 1 };

  for (const d of denominators) {
    const n = Math.round(frac * d);
    if (n === 0 || n === d) continue;
    if (Math.abs(n / d - frac) <= tolerance) {
      const g = gcd(n, d);
      return { whole: sign * whole, numerator: n / g, denominator: d / g };
    }
  }
  return null;
}

/** German decimal comma, trailing zeros stripped. */
export function formatDecimal(value: number, maxDecimals = 2): string {
  const rounded = Math.round(value * 10 ** maxDecimals) / 10 ** maxDecimals;
  return rounded.toLocaleString('de-DE', { maximumFractionDigits: maxDecimals });
}

export function formatFraction(f: Fraction, unicode = false): string {
  if (f.numerator === 0) return String(f.whole);
  const frac = `${f.numerator}/${f.denominator}`;
  const rendered = unicode ? (VULGAR[frac] ?? frac) : frac;
  if (f.whole === 0) return rendered;
  return unicode && VULGAR[frac] ? `${f.whole}${rendered}` : `${f.whole} ${rendered}`;
}

export function formatAmount(value: number, unit: Unit | null, opts: FormatOptions = {}): string {
  const style = opts.style ?? 'auto';
  const useFraction = style === 'fraction' || (style === 'auto' && prefersFractions(unit));

  if (useFraction) {
    const f = toFraction(value, opts);
    // "1 1/3 kg" is wrong; "1,33 kg" then gets upgraded to grams elsewhere.
    if (f) return formatFraction(f, opts.unicodeFractions ?? false);
  }
  // Small numbers carry real precision (1,25 kg is 1250 g — "1,3" would lose
  // 50 g); large ones do not (nobody writes 1234,5 g).
  return formatDecimal(value, Math.abs(value) < 10 ? 2 : 0);
}

export function formatUnit(unit: Unit | null, amount: number): string {
  if (unit === null) return '';
  const d = unitDef(unit);
  // Abbreviations don't inflect; spelled-out units do.
  if (d.label.abbrev !== d.label.one) return d.label.abbrev;
  return Math.abs(amount) === 1 ? d.label.one : d.label.many;
}

/** Renders a full quantity, including the kinds that carry no number at all. */
export function formatQuantity(q: Quantity, opts: FormatOptions = {}): string {
  switch (q.kind) {
    case 'toTaste':
      return 'nach Geschmack';
    case 'unquantified':
      return '';
    case 'exact':
    case 'approx': {
      const amount = formatAmount(q.amount, q.unit, opts);
      const unit = formatUnit(q.unit, q.amount);
      const body = unit ? `${amount} ${unit}` : amount;
      return q.kind === 'approx' ? `ca. ${body}` : body;
    }
    case 'range': {
      const lo = formatAmount(q.min, q.unit, opts);
      const hi = formatAmount(q.max, q.unit, opts);
      const unit = formatUnit(q.unit, q.max);
      return unit ? `${lo}–${hi} ${unit}` : `${lo}–${hi}`;
    }
  }
}
