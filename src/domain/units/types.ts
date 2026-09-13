/**
 * Core quantity vocabulary. Pure types — no I/O, no framework.
 *
 * An ingredient amount carries four independent layers, and keeping them apart
 * is what makes the whole app work:
 *
 *  1. What the cook typed        — `Quantity` (+ the display unit)
 *  2. Canonical normalization    — `CanonicalQuantity` (g / ml / pieces)
 *  3. How it behaves when scaled — `ScalingPolicy`
 *  4. How it should be rendered  — `RoundingRule`
 *
 * Layer 1 is the display truth ("1 Tasse Mehl" must redisplay as a cup, not as
 * 150 ml). Layer 2 is the arithmetic truth, used for merging and comparison.
 */

export type Dimension = 'mass' | 'volume' | 'count' | 'none';

export type MassUnit = 'mg' | 'g' | 'kg';
export type VolumeUnit = 'ml' | 'cl' | 'dl' | 'l' | 'tl' | 'el' | 'tasse' | 'cup';
export type CountUnit =
  | 'stk' | 'zehe' | 'scheibe' | 'bund' | 'dose' | 'glas'
  | 'pck' | 'blatt' | 'stange' | 'wuerfel' | 'kugel' | 'zweig';
export type VagueUnit = 'prise' | 'msp' | 'schuss' | 'spritzer' | 'handvoll' | 'tropfen' | 'etwas';

export type Unit = MassUnit | VolumeUnit | CountUnit | VagueUnit;

/** The canonical base unit of each dimension. `none` has no base. */
export type BaseUnit = 'g' | 'ml' | 'stk';

export interface UnitDef {
  id: Unit;
  dimension: Dimension;
  /** One of this unit equals `toBase` canonical units (g, ml, or pieces). */
  toBase: number;
  /** Units that read better as "1 1/3" than "1,33" — spoons, cups, pieces. */
  prefersFractions: boolean;
  /**
   * Never merged numerically on a shopping list; collapses to a note instead.
   * "1 Prise" + "2 Prisen" is not information anyone shops against.
   */
  vague: boolean;
  /** Units of the same family can be swapped for display: g<->kg, ml<->l, TL<->EL. */
  family: string;
  /** Hidden from the German unit picker (kept so imported US recipes still parse). */
  foreign?: boolean;
  label: { abbrev: string; one: string; many: string };
}

export type Quantity =
  /** "200 g" */
  | { kind: 'exact'; amount: number; unit: Unit | null }
  /** "2-3 Zehen" — a genuine interval; both ends must survive scaling. */
  | { kind: 'range'; min: number; max: number; unit: Unit | null }
  /** "ca. 200 g" — renders with a "ca." prefix and rounds more aggressively. */
  | { kind: 'approx'; amount: number; unit: Unit | null }
  /** "Salz nach Geschmack" — never enters arithmetic. */
  | { kind: 'toTaste' }
  /** "Öl zum Braten" — an ingredient with no number at all. */
  | { kind: 'unquantified' };

export type QuantityKind = Quantity['kind'];

export interface CanonicalQuantity {
  dimension: Dimension;
  /** In canonical units. Equal to `max` for the 'exact' and 'approx' kinds. */
  min: number;
  max: number;
}

export type ScalingMode =
  /** amount * factor. The default for everything. */
  | 'linear'
  /** Never scales: oil for frying, water for boiling pasta, flour for dusting. */
  | 'fixed'
  /** amount * factor^exponent. Spices and yeast: a 4x batch does not want 4x the pepper. */
  | 'sublinear'
  /** Snaps to whole multiples of `step`. You cannot buy 1.4 cans. */
  | 'stepped';

export interface ScalingPolicy {
  mode: ScalingMode;
  /** 'sublinear' only. 0 < exponent <= 1. Defaults to 0.8. */
  exponent?: number | null;
  /** 'stepped' only. */
  step?: number | null;
  /** Clamp in display units — e.g. never go below 1 egg. */
  min?: number | null;
  max?: number | null;
}

export type RoundingRule =
  /** Leave the number alone. Correct for baking, where 213 g really is 213 g. */
  | 'none'
  /** Nearest whole. Eggs. */
  | 'integer'
  /** Always up. Cans, packets — under-buying is worse than over-buying. */
  | 'ceilInteger'
  /** Snap to a kitchen-legal fraction: 1/2, 1/3, 1/4, 1/8. */
  | 'fraction'
  /** The "nice number" ladder: 213.3 g -> 215 g, 1.27 kg -> 1,25 kg. */
  | 'nice';

export const DEFAULT_SUBLINEAR_EXPONENT = 0.8;
