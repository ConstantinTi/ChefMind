import type { CanonicalQuantity, Dimension, Quantity, Unit } from './types';
import { BASE_UNIT_OF, dimensionOf, unitDef } from './units';

/**
 * Per-food-item density, used only when the caller explicitly opts into
 * cross-dimension conversion. One cup of flour is anywhere from 120 to 150 g
 * depending on whether you scoop or spoon it, so this is off by default and
 * "700 g Mehl" and "2 EL Mehl" stay two lines on the shopping list.
 */
export interface DensityContext {
  gramsPerMl?: number | null;
  gramsPerPiece?: number | null;
}

/** Amounts are stored as reals; round to 4 decimals so float noise never accumulates. */
export function roundBase(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

export function toBase(amount: number, unit: Unit | null): { dimension: Dimension; value: number } {
  if (unit === null) return { dimension: 'count', value: roundBase(amount) };
  const d = unitDef(unit);
  return { dimension: d.dimension, value: roundBase(amount * d.toBase) };
}

export function fromBase(value: number, unit: Unit | null): number {
  if (unit === null) return value;
  return value / unitDef(unit).toBase;
}

export function canConvert(from: Unit | null, to: Unit | null, ctx?: DensityContext): boolean {
  const a = dimensionOf(from);
  const b = dimensionOf(to);
  if (a === b) return true;
  if (!ctx) return false;
  const pair = new Set([a, b]);
  if (pair.has('mass') && pair.has('volume')) return !!ctx.gramsPerMl;
  if (pair.has('mass') && pair.has('count')) return !!ctx.gramsPerPiece;
  return false;
}

/**
 * Returns `null` — rather than throwing — when a conversion is impossible.
 * Callers then keep the two lines separate instead of inventing a number, and
 * aggregation stays branch-free.
 */
export function convert(amount: number, from: Unit | null, to: Unit | null, ctx?: DensityContext): number | null {
  const fromDim = dimensionOf(from);
  const toDim = dimensionOf(to);
  const base = toBase(amount, from).value;

  if (fromDim === toDim) return fromBase(base, to);
  if (!ctx) return null;

  // Cross-dimension: route everything through grams.
  let grams: number | null = null;
  if (fromDim === 'mass') grams = base;
  else if (fromDim === 'volume' && ctx.gramsPerMl) grams = base * ctx.gramsPerMl;
  else if (fromDim === 'count' && ctx.gramsPerPiece) grams = base * ctx.gramsPerPiece;
  if (grams === null) return null;

  if (toDim === 'mass') return fromBase(grams, to);
  if (toDim === 'volume' && ctx.gramsPerMl) return fromBase(grams / ctx.gramsPerMl, to);
  if (toDim === 'count' && ctx.gramsPerPiece) return fromBase(grams / ctx.gramsPerPiece, to);
  return null;
}

/**
 * Layer 1 -> layer 2. Recomputed on every write, never at read time: shopping
 * list aggregation over 20 recipes must be a single pass with no unit lookups.
 */
export function normalizeQuantity(q: Quantity): CanonicalQuantity | null {
  switch (q.kind) {
    case 'toTaste':
    case 'unquantified':
      return null;
    case 'exact':
    case 'approx': {
      const { dimension, value } = toBase(q.amount, q.unit);
      return { dimension, min: value, max: value };
    }
    case 'range': {
      const lo = toBase(q.min, q.unit);
      const hi = toBase(q.max, q.unit);
      return { dimension: lo.dimension, min: lo.value, max: hi.value };
    }
  }
}

/**
 * Picks the unit a human would actually write: 1200 g -> 1,2 kg, 0.5 l -> 500 ml,
 * 3 TL -> 1 EL. Only ever moves within a unit family, so "3 Zehen" never becomes
 * grams and "250 g Mehl" never becomes a cup.
 */
export function pickDisplayUnit(amount: number, unit: Unit | null): { amount: number; unit: Unit | null } {
  if (unit === null) return { amount, unit };
  const d = unitDef(unit);
  if (d.vague || d.dimension === 'count') return { amount, unit };

  const base = toBase(amount, unit).value;

  if (d.family === 'mass-metric') {
    if (base >= 1000) return { amount: fromBase(base, 'kg'), unit: 'kg' };
    if (base < 1) return { amount: fromBase(base, 'mg'), unit: 'mg' };
    return { amount: fromBase(base, 'g'), unit: 'g' };
  }

  if (d.family === 'volume-metric') {
    if (base >= 1000) return { amount: fromBase(base, 'l'), unit: 'l' };
    return { amount: fromBase(base, 'ml'), unit: 'ml' };
  }

  if (d.family === 'spoon') {
    // Above ~4 tablespoons, millilitres read better than a pile of spoons.
    if (base >= 60) return { amount: fromBase(base, 'ml'), unit: 'ml' };
    // Promote to tablespoons only when it lands on (near) whole or half spoons.
    // 20.8 ml is "4 TL", not "1 3/8 EL" — the teaspoon count is the measurable one.
    if (base >= 15) {
      const el = base / 15;
      const snapped = Math.round(el * 2) / 2;
      if (Math.abs(el - snapped) < 0.08) return { amount: el, unit: 'el' };
    }
    return { amount: fromBase(base, 'tl'), unit: 'tl' };
  }

  return { amount, unit };
}

export function baseUnitFor(dimension: Dimension) {
  return dimension === 'none' ? null : BASE_UNIT_OF[dimension];
}
