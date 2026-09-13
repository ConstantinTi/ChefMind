import type {
  Quantity,
  RoundingRule,
  ScalingPolicy,
} from '../units/types';
import { DEFAULT_SUBLINEAR_EXPONENT } from '../units/types';
import { pickDisplayUnit } from '../units/convert';
import { prefersFractions } from '../units/units';
import { formatQuantity, type FormatOptions } from '../units/format';
import { roundAmount } from './rounding';

export interface ScaleOptions extends FormatOptions {
  /** g -> kg at 1000, 3 TL -> 1 EL, etc. Default true. */
  autoUnitUpgrade?: boolean;
  /** 'exact' disables the nice-number ladder everywhere — for baking. */
  precisionMode?: 'kitchen' | 'exact';
}

export function scalingFactor(baseServings: number, targetServings: number): number {
  if (!(baseServings > 0) || !(targetServings > 0)) return 1;
  return targetServings / baseServings;
}

/**
 * The whole scaling engine. Everything else is presentation.
 *
 * `fixed` and `sublinear` are what separate a portion calculator you keep
 * trusting from one you abandon after the first 4x batch came out inedibly salty.
 */
export function scaleAmount(amount: number, factor: number, policy: ScalingPolicy): number {
  let out: number;
  switch (policy.mode) {
    case 'fixed':
      out = amount;
      break;
    case 'sublinear':
      out = amount * factor ** (policy.exponent ?? DEFAULT_SUBLINEAR_EXPONENT);
      break;
    case 'stepped': {
      const step = policy.step && policy.step > 0 ? policy.step : 1;
      out = Math.max(step, Math.round((amount * factor) / step) * step);
      break;
    }
    case 'linear':
    default:
      out = amount * factor;
      break;
  }

  if (policy.min != null) out = Math.max(policy.min, out);
  if (policy.max != null) out = Math.min(policy.max, out);
  return out;
}

export interface ScaleQuantityResult {
  scaled: Quantity;
  /** Pre-rounding value, so the UI can show "rechnerisch 1,5" next to "2 Eier". */
  exact: Quantity | null;
  didRound: boolean;
  didNotScale: boolean;
}

export function scaleQuantity(
  q: Quantity,
  factor: number,
  policy: ScalingPolicy,
  rounding: RoundingRule,
  opts: ScaleOptions = {},
): ScaleQuantityResult {
  // No number to scale — pass straight through.
  if (q.kind === 'toTaste' || q.kind === 'unquantified') {
    return { scaled: q, exact: null, didRound: false, didNotScale: true };
  }

  const didNotScale = policy.mode === 'fixed' || factor === 1;
  // 'exact' mode (baking) keeps weights and volumes unrounded, because 106,7 g of
  // flour really is different from 105 g. It deliberately does NOT apply to
  // spoon-and-pinch units: "1 3/8 TL Salz" is not more precise than "1 1/2 TL",
  // it is just unusable.
  const spoonish = 'unit' in q && prefersFractions(q.unit);
  const effectiveRounding: RoundingRule =
    opts.precisionMode === 'exact' && rounding === 'nice' && !spoonish ? 'none' : rounding;
  const upgrade = opts.autoUnitUpgrade ?? true;

  const one = (raw: number) => {
    const scaledRaw = scaleAmount(raw, factor, policy);
    const display = upgrade ? pickDisplayUnit(scaledRaw, q.unit) : { amount: scaledRaw, unit: q.unit };
    const { value, didRound } = roundAmount(display.amount, effectiveRounding, display.unit);
    return { raw: scaledRaw, value, unit: display.unit, didRound };
  };

  if (q.kind === 'range') {
    const lo = one(q.min);
    const hi = one(q.max);
    return {
      scaled: { kind: 'range', min: lo.value, max: hi.value, unit: hi.unit },
      exact: { kind: 'range', min: lo.raw, max: hi.raw, unit: hi.unit },
      didRound: lo.didRound || hi.didRound,
      didNotScale,
    };
  }

  const r = one(q.amount);
  return {
    scaled: { kind: q.kind, amount: r.value, unit: r.unit },
    exact: { kind: q.kind, amount: r.raw, unit: r.unit },
    didRound: r.didRound,
    didNotScale,
  };
}

export function formatScaled(q: Quantity, opts: ScaleOptions = {}): string {
  return formatQuantity(q, opts);
}
