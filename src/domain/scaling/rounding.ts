import type { RoundingRule, Unit } from '../units/types';
import { toFraction, KITCHEN_DENOMINATORS } from '../units/format';
import { dimensionOf, unitDef } from '../units/units';
import { fromBase, toBase } from '../units/convert';

export interface RoundResult {
  value: number;
  didRound: boolean;
}

const EPS = 1e-6;
const changed = (a: number, b: number): boolean => Math.abs(a - b) > EPS;

/**
 * The "nice number" ladder. Its entire purpose is that no scaled recipe ever
 * shows "213,33 g" — a number no kitchen scale and no cook cares about.
 *
 * The ladder operates on CANONICAL units (grams / millilitres), not on the
 * display value. Applying a gram-sized ladder to a value already expressed in
 * kilograms would round 1,2 kg down to 1 kg and silently lose 200 g.
 */
export function niceRound(value: number, unit: Unit | null): number {
  const dim = dimensionOf(unit);

  if (dim === 'count') {
    // Pieces tolerate halves but not sevenths.
    return Math.abs(value) < 10 ? Math.round(value * 2) / 2 : Math.round(value);
  }

  const base = toBase(value, unit).value;
  const abs = Math.abs(base);
  const step =
    abs < 1 ? 0.01 :
    abs < 10 ? 0.5 :
    abs < 20 ? 1 :
    abs < 250 ? 5 :
    abs < 1000 ? 10 :
    25;

  return fromBase(Math.round(base / step) * step, unit);
}

/**
 * Rounds to the coarsest step still worth distinguishing at that size: quarters
 * for small amounts, halves up to ten, whole numbers beyond. A quarter of a
 * teaspoon is a real measurement; three eighths of a tablespoon is not.
 */
export function niceFraction(value: number): number {
  const abs = Math.abs(value);
  if (abs < 4) return Math.round(value * 4) / 4;
  if (abs < 10) return Math.round(value * 2) / 2;
  return Math.round(value);
}

export function snapToFraction(value: number, denominators: readonly number[] = KITCHEN_DENOMINATORS): number {
  const f = toFraction(value, { denominators });
  if (!f) return value;
  const sign = f.whole < 0 ? -1 : 1;
  return f.whole + sign * (f.numerator / f.denominator);
}

export function roundAmount(value: number, rule: RoundingRule, unit: Unit | null): RoundResult {
  if (!Number.isFinite(value)) return { value, didRound: false };

  switch (rule) {
    case 'none':
      return { value, didRound: false };

    case 'integer': {
      // Never round a real ingredient away to nothing: half an egg is one egg.
      const r = Math.max(value > 0 ? 1 : 0, Math.round(value));
      return { value: r, didRound: changed(r, value) };
    }

    case 'ceilInteger': {
      const r = Math.ceil(value - EPS);
      return { value: r, didRound: changed(r, value) };
    }

    case 'fraction': {
      const r = snapToFraction(value);
      return { value: r, didRound: changed(r, value) };
    }

    case 'nice': {
      // Spoons, cups and pieces read as fractions; weights and volumes as round
      // numbers. `snapToFraction` is deliberately NOT used here: it gives up on
      // anything that is not an exact kitchen fraction and leaves you with
      // "1,39 EL", and when it does succeed it can produce "1 3/8 EL". Snapping
      // to a coarse step always yields something a cook can actually measure.
      const r = unit && unitDef(unit).prefersFractions
        ? niceFraction(value)
        : niceRound(value, unit);
      return { value: r, didRound: changed(r, value) };
    }
  }
}
