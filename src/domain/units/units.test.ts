import { describe, expect, it } from 'vitest';
import { toBase, fromBase, convert, normalizeQuantity, pickDisplayUnit } from './convert';
import { toFraction, formatAmount, formatQuantity } from './format';
import type { Quantity } from './types';

describe('toBase', () => {
  it('converts German spoon measures to millilitres', () => {
    expect(toBase(2, 'el')).toEqual({ dimension: 'volume', value: 30 });
    expect(toBase(1, 'tl')).toEqual({ dimension: 'volume', value: 5 });
  });

  it('converts metric mass', () => {
    expect(toBase(0.5, 'kg')).toEqual({ dimension: 'mass', value: 500 });
    expect(toBase(250, 'g')).toEqual({ dimension: 'mass', value: 250 });
  });

  it('treats a missing unit as a count of pieces', () => {
    expect(toBase(3, null)).toEqual({ dimension: 'count', value: 3 });
  });

  it('round-trips through fromBase', () => {
    expect(fromBase(toBase(2.5, 'kg').value, 'kg')).toBeCloseTo(2.5);
  });
});

describe('convert', () => {
  it('converts within a dimension', () => {
    expect(convert(1, 'l', 'ml')).toBe(1000);
    expect(convert(3, 'tl', 'el')).toBe(1);
  });

  it('refuses cross-dimension conversion without a density', () => {
    // This is the point: 200 g of flour is not 200 ml of flour, and guessing
    // is worse than keeping two lines on the shopping list.
    expect(convert(200, 'g', 'ml')).toBeNull();
  });

  it('converts across dimensions when a density is supplied', () => {
    expect(convert(100, 'ml', 'g', { gramsPerMl: 1 })).toBe(100);
    expect(convert(100, 'ml', 'g', { gramsPerMl: 0.6 })).toBeCloseTo(60);
  });
});

describe('normalizeQuantity', () => {
  it('normalizes exact amounts', () => {
    expect(normalizeQuantity({ kind: 'exact', amount: 2, unit: 'el' }))
      .toEqual({ dimension: 'volume', min: 30, max: 30 });
  });

  it('keeps both ends of a range', () => {
    expect(normalizeQuantity({ kind: 'range', min: 2, max: 3, unit: 'zehe' }))
      .toEqual({ dimension: 'count', min: 2, max: 3 });
  });

  it('returns null for amounts that carry no number', () => {
    expect(normalizeQuantity({ kind: 'toTaste' })).toBeNull();
    expect(normalizeQuantity({ kind: 'unquantified' })).toBeNull();
  });
});

describe('pickDisplayUnit', () => {
  it('upgrades grams to kilograms past 1000', () => {
    expect(pickDisplayUnit(1200, 'g')).toEqual({ amount: 1.2, unit: 'kg' });
  });

  it('downgrades small litre amounts to millilitres', () => {
    expect(pickDisplayUnit(0.25, 'l')).toEqual({ amount: 250, unit: 'ml' });
  });

  it('promotes three teaspoons to one tablespoon', () => {
    expect(pickDisplayUnit(3, 'tl')).toEqual({ amount: 1, unit: 'el' });
  });

  it('never converts counts away from their unit', () => {
    expect(pickDisplayUnit(6, 'zehe')).toEqual({ amount: 6, unit: 'zehe' });
  });
});

describe('toFraction', () => {
  it('prefers the simplest denominator', () => {
    expect(toFraction(0.5)).toEqual({ whole: 0, numerator: 1, denominator: 2 });
    expect(toFraction(1.3333)).toEqual({ whole: 1, numerator: 1, denominator: 3 });
    expect(toFraction(0.75)).toEqual({ whole: 0, numerator: 3, denominator: 4 });
  });

  it('refuses fractions no kitchen uses', () => {
    // 5/7 of a cup is not a measurement, it is an artefact of a bad algorithm.
    expect(toFraction(0.714)).toBeNull();
  });

  it('collapses near-integers', () => {
    expect(toFraction(2.005)).toEqual({ whole: 2, numerator: 0, denominator: 1 });
  });
});

describe('formatAmount / formatQuantity', () => {
  it('renders spoons as fractions', () => {
    expect(formatAmount(1.3333, 'el')).toBe('1 1/3');
  });

  it('renders weights as German decimals, not fractions', () => {
    expect(formatAmount(1.25, 'kg')).toBe('1,25');
    expect(formatAmount(2.5, 'l')).toBe('2,5');
    expect(formatAmount(250, 'g')).toBe('250');
  });

  it('renders each quantity kind', () => {
    const cases: Array<[Quantity, string]> = [
      [{ kind: 'exact', amount: 200, unit: 'g' }, '200 g'],
      [{ kind: 'approx', amount: 200, unit: 'g' }, 'ca. 200 g'],
      [{ kind: 'range', min: 2, max: 3, unit: 'zehe' }, '2–3 Zehen'],
      [{ kind: 'toTaste' }, 'nach Geschmack'],
      [{ kind: 'exact', amount: 3, unit: null }, '3'],
      [{ kind: 'exact', amount: 1, unit: 'zehe' }, '1 Zehe'],
    ];
    for (const [q, expected] of cases) expect(formatQuantity(q)).toBe(expected);
  });

  it('can render unicode vulgar fractions', () => {
    expect(formatQuantity({ kind: 'exact', amount: 0.5, unit: 'tl' }, { unicodeFractions: true }))
      .toBe('½ TL');
  });
});
