import { describe, expect, it } from 'vitest';
import { scaleAmount, scaleQuantity, scalingFactor } from './scale';
import { niceRound, roundAmount } from './rounding';
import { formatQuantity } from '../units/format';
import type { ScalingPolicy } from '../units/types';

const linear: ScalingPolicy = { mode: 'linear' };
const fixed: ScalingPolicy = { mode: 'fixed' };
const sublinear: ScalingPolicy = { mode: 'sublinear', exponent: 0.8 };

describe('scalingFactor', () => {
  it('computes the ratio', () => {
    expect(scalingFactor(4, 6)).toBe(1.5);
    expect(scalingFactor(2, 1)).toBe(0.5);
  });

  it('falls back to 1 on nonsense input rather than producing Infinity', () => {
    expect(scalingFactor(0, 4)).toBe(1);
    expect(scalingFactor(4, 0)).toBe(1);
  });
});

describe('scaleAmount', () => {
  it('scales linearly by default', () => {
    expect(scaleAmount(200, 2, linear)).toBe(400);
  });

  it('leaves fixed amounts alone — oil for frying does not double', () => {
    expect(scaleAmount(2, 4, fixed)).toBe(2);
  });

  it('scales spices sublinearly', () => {
    // A 4x batch wants roughly 3x the salt, not 4x.
    const out = scaleAmount(1, 4, sublinear);
    expect(out).toBeGreaterThan(2.9);
    expect(out).toBeLessThan(3.1);
  });

  it('snaps stepped amounts to whole packages', () => {
    expect(scaleAmount(1, 1.4, { mode: 'stepped', step: 1 })).toBe(1);
    expect(scaleAmount(1, 1.6, { mode: 'stepped', step: 1 })).toBe(2);
  });

  it('respects a minimum clamp', () => {
    expect(scaleAmount(2, 0.1, { mode: 'linear', min: 1 })).toBe(1);
  });
});

describe('roundAmount', () => {
  it('never rounds a real ingredient down to nothing', () => {
    // Half an egg is one egg, not zero eggs.
    expect(roundAmount(0.5, 'integer', null)).toEqual({ value: 1, didRound: true });
  });

  it('always rounds packages up — under-buying is the worse failure', () => {
    expect(roundAmount(1.1, 'ceilInteger', 'dose')).toEqual({ value: 2, didRound: true });
  });

  it('reports when it did nothing', () => {
    expect(roundAmount(200, 'none', 'g')).toEqual({ value: 200, didRound: false });
  });
});

describe('niceRound', () => {
  it('never emits numbers a kitchen scale cannot show', () => {
    expect(niceRound(213.33, 'g')).toBe(215);
    expect(niceRound(7.3, 'g')).toBe(7.5);
    expect(niceRound(1247, 'g')).toBe(1250);
  });

  it('allows halves for small counts', () => {
    expect(niceRound(2.4, 'stk')).toBe(2.5);
  });
});

describe('scaleQuantity', () => {
  it('doubles a weight and upgrades the unit', () => {
    const r = scaleQuantity({ kind: 'exact', amount: 600, unit: 'g' }, 2, linear, 'nice');
    expect(formatQuantity(r.scaled)).toBe('1,2 kg');
  });

  it('scales both ends of a range', () => {
    const r = scaleQuantity({ kind: 'range', min: 2, max: 3, unit: 'zehe' }, 2, linear, 'integer');
    expect(formatQuantity(r.scaled)).toBe('4–6 Zehen');
  });

  it('rounds eggs to whole units and reports the rounding', () => {
    // 3 eggs at 4 -> 6 servings is 4.5 eggs. The cook must be told it rounded.
    const r = scaleQuantity({ kind: 'exact', amount: 3, unit: null }, 1.5, linear, 'integer');
    expect(formatQuantity(r.scaled)).toBe('5');
    expect(r.didRound).toBe(true);
    expect(r.exact).toEqual({ kind: 'exact', amount: 4.5, unit: null });
  });

  it('passes "nach Geschmack" straight through', () => {
    const r = scaleQuantity({ kind: 'toTaste' }, 4, linear, 'nice');
    expect(r.scaled).toEqual({ kind: 'toTaste' });
    expect(r.didNotScale).toBe(true);
  });

  it('marks fixed ingredients as unscaled', () => {
    const r = scaleQuantity({ kind: 'exact', amount: 2, unit: 'el' }, 3, fixed, 'nice');
    expect(formatQuantity(r.scaled)).toBe('2 EL');
    expect(r.didNotScale).toBe(true);
  });

  it('keeps exact amounts exact in baking mode', () => {
    const r = scaleQuantity(
      { kind: 'exact', amount: 320, unit: 'g' }, 1 / 3, linear, 'nice',
      { precisionMode: 'exact' },
    );
    // 106.67 g, not the nice-rounded 105 g — hydration matters in a dough.
    expect((r.scaled as { amount: number }).amount).toBeCloseTo(106.667, 2);
  });

  it('is idempotent: scaling up then back down returns the original', () => {
    const start = { kind: 'exact' as const, amount: 250, unit: 'g' as const };
    const up = scaleQuantity(start, 3, linear, 'none');
    const back = scaleQuantity(up.scaled, 1 / 3, linear, 'none');
    expect((back.scaled as { amount: number }).amount).toBeCloseTo(250, 6);
  });
});

describe('kitchen usability of scaled amounts', () => {
  // These assert the difference between arithmetically correct and actually
  // measurable. Every one of them was a real bug found by scaling a seeded recipe.
  it('keeps whole-item units whole', () => {
    const r = scaleQuantity(
      { kind: 'range', min: 2, max: 3, unit: 'zehe' }, 2.5,
      { mode: 'linear', min: 1 }, 'integer',
    );
    // Not "5–7 1/2 Zehen".
    expect(formatQuantity(r.scaled)).toBe('5–8 Zehen');
  });

  it('never produces eighths of a tablespoon', () => {
    // 2 TL scaled sublinearly by 2.5 is 20.8 ml — readable as teaspoons,
    // absurd as "1 3/8 EL".
    const r = scaleQuantity(
      { kind: 'exact', amount: 2, unit: 'tl' }, 2.5,
      { mode: 'sublinear', exponent: 0.8 }, 'nice',
    );
    expect(formatQuantity(r.scaled)).toBe('4 TL');
  });

  it('still promotes clean tablespoon amounts', () => {
    const r = scaleQuantity({ kind: 'exact', amount: 3, unit: 'tl' }, 2, { mode: 'linear' }, 'nice');
    expect(formatQuantity(r.scaled)).toBe('2 EL');
  });

  it('rounds spoon amounts to quarters, not to decimals', () => {
    const r = scaleQuantity({ kind: 'exact', amount: 1, unit: 'tl' }, 1.3, { mode: 'linear' }, 'nice');
    expect(formatQuantity(r.scaled)).toBe('1 1/4 TL');
  });
});
