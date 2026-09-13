import type { BaseUnit, Dimension, Unit, UnitDef } from './types';

/**
 * The unit registry, German-first.
 *
 * Deliberate choices:
 *  - TL/EL are the German 5 ml / 15 ml, not the US 4.93 / 14.79. Nobody measures
 *    the difference and the round numbers keep scaled amounts readable.
 *  - "Tasse" is 150 ml (the German baking convention), while the US `cup` is a
 *    separate 240 ml unit marked `foreign` so imported recipes still parse but
 *    it never appears in the picker.
 *  - Prise / Messerspitze / Schuss are `vague`: they have a nominal volume so
 *    they can be *displayed*, but they never merge on a shopping list.
 */
const def = (
  id: Unit,
  dimension: Dimension,
  toBase: number,
  family: string,
  label: UnitDef['label'],
  extra: Partial<Pick<UnitDef, 'prefersFractions' | 'vague' | 'foreign'>> = {},
): UnitDef => ({
  id,
  dimension,
  toBase,
  family,
  label,
  prefersFractions: extra.prefersFractions ?? false,
  vague: extra.vague ?? false,
  ...(extra.foreign ? { foreign: true } : {}),
});

export const UNITS: Readonly<Record<Unit, UnitDef>> = Object.freeze({
  // ── Masse ───────────────────────────────────────────────────────────────
  mg: def('mg', 'mass', 0.001, 'mass-metric', { abbrev: 'mg', one: 'Milligramm', many: 'Milligramm' }),
  g: def('g', 'mass', 1, 'mass-metric', { abbrev: 'g', one: 'Gramm', many: 'Gramm' }),
  kg: def('kg', 'mass', 1000, 'mass-metric', { abbrev: 'kg', one: 'Kilogramm', many: 'Kilogramm' }),

  // ── Volumen ─────────────────────────────────────────────────────────────
  ml: def('ml', 'volume', 1, 'volume-metric', { abbrev: 'ml', one: 'Milliliter', many: 'Milliliter' }),
  cl: def('cl', 'volume', 10, 'volume-metric', { abbrev: 'cl', one: 'Zentiliter', many: 'Zentiliter' }),
  dl: def('dl', 'volume', 100, 'volume-metric', { abbrev: 'dl', one: 'Deziliter', many: 'Deziliter' }),
  l: def('l', 'volume', 1000, 'volume-metric', { abbrev: 'l', one: 'Liter', many: 'Liter' }),
  tl: def('tl', 'volume', 5, 'spoon', { abbrev: 'TL', one: 'Teelöffel', many: 'Teelöffel' }, { prefersFractions: true }),
  el: def('el', 'volume', 15, 'spoon', { abbrev: 'EL', one: 'Esslöffel', many: 'Esslöffel' }, { prefersFractions: true }),
  tasse: def('tasse', 'volume', 150, 'cup', { abbrev: 'Tasse', one: 'Tasse', many: 'Tassen' }, { prefersFractions: true }),
  cup: def('cup', 'volume', 240, 'cup', { abbrev: 'cup', one: 'Cup', many: 'Cups' }, { prefersFractions: true, foreign: true }),

  // ── Stückzahlen ─────────────────────────────────────────────────────────
  stk: def('stk', 'count', 1, 'count', { abbrev: 'Stk.', one: 'Stück', many: 'Stück' }, { prefersFractions: true }),
  zehe: def('zehe', 'count', 1, 'count', { abbrev: 'Zehe', one: 'Zehe', many: 'Zehen' }, { prefersFractions: true }),
  scheibe: def('scheibe', 'count', 1, 'count', { abbrev: 'Scheibe', one: 'Scheibe', many: 'Scheiben' }, { prefersFractions: true }),
  bund: def('bund', 'count', 1, 'count', { abbrev: 'Bund', one: 'Bund', many: 'Bund' }, { prefersFractions: true }),
  dose: def('dose', 'count', 1, 'count', { abbrev: 'Dose', one: 'Dose', many: 'Dosen' }),
  glas: def('glas', 'count', 1, 'count', { abbrev: 'Glas', one: 'Glas', many: 'Gläser' }),
  pck: def('pck', 'count', 1, 'count', { abbrev: 'Pck.', one: 'Packung', many: 'Packungen' }),
  blatt: def('blatt', 'count', 1, 'count', { abbrev: 'Blatt', one: 'Blatt', many: 'Blatt' }),
  stange: def('stange', 'count', 1, 'count', { abbrev: 'Stange', one: 'Stange', many: 'Stangen' }),
  wuerfel: def('wuerfel', 'count', 1, 'count', { abbrev: 'Würfel', one: 'Würfel', many: 'Würfel' }),
  kugel: def('kugel', 'count', 1, 'count', { abbrev: 'Kugel', one: 'Kugel', many: 'Kugeln' }),
  zweig: def('zweig', 'count', 1, 'count', { abbrev: 'Zweig', one: 'Zweig', many: 'Zweige' }),

  // ── Unscharfe Mengen ────────────────────────────────────────────────────
  prise: def('prise', 'count', 1, 'vague', { abbrev: 'Prise', one: 'Prise', many: 'Prisen' }, { vague: true }),
  msp: def('msp', 'count', 1, 'vague', { abbrev: 'Msp.', one: 'Messerspitze', many: 'Messerspitzen' }, { vague: true }),
  schuss: def('schuss', 'count', 1, 'vague', { abbrev: 'Schuss', one: 'Schuss', many: 'Schuss' }, { vague: true }),
  spritzer: def('spritzer', 'count', 1, 'vague', { abbrev: 'Spritzer', one: 'Spritzer', many: 'Spritzer' }, { vague: true }),
  handvoll: def('handvoll', 'count', 1, 'vague', { abbrev: 'Handvoll', one: 'Handvoll', many: 'Handvoll' }, { vague: true }),
  tropfen: def('tropfen', 'count', 1, 'vague', { abbrev: 'Tropfen', one: 'Tropfen', many: 'Tropfen' }, { vague: true }),
  etwas: def('etwas', 'count', 1, 'vague', { abbrev: 'etwas', one: 'etwas', many: 'etwas' }, { vague: true }),
});

export const UNIT_IDS = Object.keys(UNITS) as [Unit, ...Unit[]];

/** Units offered in the editor's dropdown, in the order a German cook expects. */
export const PICKER_UNITS: readonly Unit[] = [
  'g', 'kg', 'ml', 'l', 'tl', 'el', 'stk', 'prise',
  'zehe', 'bund', 'scheibe', 'pck', 'dose', 'glas',
  'blatt', 'stange', 'wuerfel', 'zweig', 'kugel',
  'msp', 'schuss', 'spritzer', 'handvoll', 'tropfen', 'etwas',
  'mg', 'cl', 'dl', 'tasse',
];

export const BASE_UNIT_OF: Readonly<Record<Exclude<Dimension, 'none'>, BaseUnit>> = Object.freeze({
  mass: 'g',
  volume: 'ml',
  count: 'stk',
});

export function isUnit(value: string): value is Unit {
  return Object.hasOwn(UNITS, value);
}

export function unitDef(unit: Unit): UnitDef {
  const d = UNITS[unit];
  if (!d) throw new Error(`Unbekannte Einheit: ${unit}`);
  return d;
}

export function dimensionOf(unit: Unit | null): Dimension {
  return unit === null ? 'count' : unitDef(unit).dimension;
}

/** A unitless amount ("3 Eier") behaves as a count of pieces. */
export function isVague(unit: Unit | null): boolean {
  return unit !== null && unitDef(unit).vague;
}

export function prefersFractions(unit: Unit | null): boolean {
  return unit === null ? true : unitDef(unit).prefersFractions;
}
