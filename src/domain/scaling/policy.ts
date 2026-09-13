import type { RoundingRule, ScalingPolicy, Unit } from '../units/types';
import { dimensionOf, unitDef } from '../units/units';

/**
 * Ingredients whose amount should NOT simply multiply.
 *
 * These are suggestions surfaced in the editor, never applied silently: a 0.8
 * exponent quietly attached to something the cook believed was linear is a bug
 * they will not notice until dinner. `suggestScalingPolicy` proposes, the
 * stored per-ingredient policy decides.
 */
const SUBLINEAR_KEYWORDS = [
  'salz', 'pfeffer', 'muskat', 'zimt', 'kardamom', 'nelke', 'paprikapulver',
  'chili', 'cayenne', 'curry', 'kreuzkümmel', 'kümmel', 'koriander', 'oregano',
  'thymian', 'rosmarin', 'majoran', 'lorbeer', 'safran', 'vanille', 'kurkuma',
  'ingwer', 'knoblauchpulver', 'zwiebelpulver', 'gewürz', 'kräuter',
  'hefe', 'backpulver', 'natron', 'weinstein',
];

const FIXED_KEYWORDS = [
  'zum braten', 'zum frittieren', 'zum anbraten', 'zum fetten', 'zum bestreuen',
  'zum ausrollen', 'zum bemehlen', 'für die form', 'zum abschmecken',
  'salzwasser', 'kochwasser', 'wasser zum kochen', 'öl zum',
];

/** Things you buy and use whole. Half an onion in a recipe is fine; half an egg is not. */
const DISCRETE_KEYWORDS = [
  'ei', 'eier', 'eigelb', 'eiweiß', 'zwiebel', 'knoblauchzehe', 'zehe',
  'blatt gelatine', 'gelatine',
];

/** Sold only in whole packages. */
const PACKAGE_UNITS: ReadonlySet<Unit> = new Set(['dose', 'pck', 'glas', 'wuerfel', 'blatt']);

/**
 * Units that only exist in whole numbers, whatever the ingredient is called.
 * Without this, doubling "2-3 Zehen Knoblauch" produces "5-7 1/2 Zehen" — an
 * amount that is arithmetically correct and completely useless at the chopping
 * board. The unit is a stronger signal here than the ingredient name, which may
 * be "Knoblauch" while the unit is "Zehe".
 */
const WHOLE_ITEM_UNITS: ReadonlySet<Unit> = new Set([
  'stk', 'zehe', 'scheibe', 'stange', 'zweig', 'kugel',
]);

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function matchesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

export interface PolicySuggestion {
  policy: ScalingPolicy;
  rounding: RoundingRule;
  /** Shown in the editor so the cook can see why, and override it. */
  reason: string | null;
}

/**
 * Proposes how an ingredient should behave when the recipe is rescaled, based
 * on its name and unit. Everything defaults to plain linear scaling.
 */
export function suggestScalingPolicy(name: string, unit: Unit | null): PolicySuggestion {
  const n = normalize(name);

  if (matchesAny(n, FIXED_KEYWORDS)) {
    return {
      policy: { mode: 'fixed' },
      rounding: 'none',
      reason: 'Menge hängt nicht von der Portionszahl ab (z. B. Öl zum Braten).',
    };
  }

  if (unit && PACKAGE_UNITS.has(unit)) {
    return {
      policy: { mode: 'stepped', step: 1, min: 1 },
      rounding: 'ceilInteger',
      reason: 'Wird nur in ganzen Packungen gekauft.',
    };
  }

  if (matchesAny(n, SUBLINEAR_KEYWORDS)) {
    const isLeavening = /hefe|backpulver|natron|weinstein/.test(n);
    return {
      policy: { mode: 'sublinear', exponent: isLeavening ? 0.7 : 0.8 },
      rounding: 'nice',
      reason: isLeavening
        ? 'Triebmittel skalieren unterproportional — die doppelte Menge Teig braucht nicht die doppelte Hefe.'
        : 'Gewürze skalieren unterproportional — sonst wird die doppelte Menge zu scharf.',
    };
  }

  if ((unit && WHOLE_ITEM_UNITS.has(unit)) || (dimensionOf(unit) === 'count' && matchesAny(n, DISCRETE_KEYWORDS))) {
    return {
      policy: { mode: 'linear', min: 1 },
      rounding: 'integer',
      reason: 'Wird nur in ganzen Stück verwendet.',
    };
  }

  return { policy: { mode: 'linear' }, rounding: defaultRoundingFor(unit), reason: null };
}

export function defaultRoundingFor(unit: Unit | null): RoundingRule {
  if (unit === null) return 'integer';
  const d = unitDef(unit);
  if (d.vague) return 'nice';
  if (d.dimension === 'count') return 'nice';
  return 'nice';
}

export const DEFAULT_POLICY: ScalingPolicy = { mode: 'linear' };
