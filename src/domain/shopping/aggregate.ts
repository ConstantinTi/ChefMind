import type { Dimension, Quantity, Unit } from '../units/types';
import type { ScaledIngredient } from '../recipe/types';
import { normalizeName } from '../recipe/derive';
import { normalizeQuantity, pickDisplayUnit } from '../units/convert';
import { formatQuantity } from '../units/format';
import { isVague, unitDef } from '../units/units';
import { niceRound } from '../scaling/rounding';
import { CATEGORY_ORDER_INDEX, categorizeIngredient, isLikelyPantryStaple, type GroceryCategory } from './categories';

export interface ShoppingSource {
  recipeId: string;
  recipeTitle: string;
  /** What that recipe asked for, so a line can be traced back. */
  originalDisplay: string;
  servings: number;
}

export interface ShoppingLine {
  /** `${normalizedName}:${dimension}` — the merge key. */
  key: string;
  label: string;
  category: GroceryCategory;
  dimension: Dimension;
  quantity: Quantity | null;
  display: string;
  /** "nach Geschmack", "1 Prise" — real information, but not addable. */
  vagueNotes: string[];
  sources: ShoppingSource[];
  optional: boolean;
}

export interface AggregateInput {
  ingredient: ScaledIngredient;
  source: ShoppingSource;
}

export interface AggregateOptions {
  /** Salt, pepper, water, oil. Off by default — it is the difference between a
   *  12-line list and a 30-line list with "Wasser" on it. */
  includePantryStaples?: boolean;
  /** 'keepRange' preserves "3–4 Zehen"; 'max' collapses to the upper bound so
   *  you never under-buy. */
  rangeStrategy?: 'keepRange' | 'max';
  unicodeFractions?: boolean;
}

interface Bucket {
  key: string;
  label: string;
  category: GroceryCategory;
  dimension: Dimension;
  unitHint: Unit | null;
  min: number;
  max: number;
  hasNumbers: boolean;
  vagueNotes: string[];
  sources: ShoppingSource[];
  optional: boolean;
}

/**
 * Merges the scaled ingredients of many recipes into one shopping list.
 *
 * Merging happens on the canonical amount, so "200 g Mehl" and "0,5 kg Mehl"
 * become "700 g Mehl". Ingredients of the same name but a different dimension
 * ("2 EL Mehl") get their own line rather than being converted through a guessed
 * density — a wrong number on a shopping list is worse than two lines.
 *
 * Order-independent and associative: the list must not change depending on which
 * recipe was added first.
 */
export function aggregateIngredients(
  items: readonly AggregateInput[],
  opts: AggregateOptions = {},
): ShoppingLine[] {
  const buckets = new Map<string, Bucket>();

  for (const { ingredient, source } of items) {
    const ing = ingredient.source;
    if (ing.excludeFromShoppingList) continue;
    if (!opts.includePantryStaples && isLikelyPantryStaple(ing.name)) continue;

    const name = normalizeName(ing.name) || ing.name.toLowerCase();
    const q = ingredient.scaled;
    const canonical = normalizeQuantity(q);
    const unit = 'unit' in q ? q.unit : null;
    // Anything without a usable number shares one 'none' bucket, so "1 Prise
    // Muskat" and "Muskat nach Geschmack" end up on a single line instead of two.
    const isNumeric = canonical !== null && !isVague(unit);
    const dimension: Dimension = isNumeric ? canonical.dimension : 'none';
    const key = `${name}:${dimension}`;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: ing.name.trim(),
        category: ing.category ?? categorizeIngredient(ing.name),
        dimension,
        unitHint: unit,
        min: 0,
        max: 0,
        hasNumbers: false,
        vagueNotes: [],
        sources: [],
        optional: true,
      };
      buckets.set(key, bucket);
    }

    bucket.sources.push(source);
    // A line is only optional if every recipe treats it as optional.
    if (!ing.optional) bucket.optional = false;

    // Vague and unquantified amounts never enter the arithmetic: "1 Prise" plus
    // "2 Prisen" is not a number anyone shops against.
    if (!isNumeric) {
      const note = formatQuantity(q, opts);
      if (note && !bucket.vagueNotes.includes(note)) bucket.vagueNotes.push(note);
      continue;
    }

    bucket.hasNumbers = true;
    bucket.min += canonical.min;
    bucket.max += canonical.max;
    // Prefer the more precise of the units seen, so ml wins over l for display.
    if (unit && bucket.unitHint && unitDef(unit).toBase < unitDef(bucket.unitHint).toBase) {
      bucket.unitHint = unit;
    }
  }

  return [...buckets.values()]
    .map((b) => toLine(b, opts))
    .sort(compareLines);
}

function toLine(b: Bucket, opts: AggregateOptions): ShoppingLine {
  let quantity: Quantity | null = null;

  if (b.hasNumbers) {
    const collapse = opts.rangeStrategy === 'max' || Math.abs(b.max - b.min) < 1e-6;
    if (collapse) {
      const d = pickDisplayUnit(fromBaseOf(b.max, b.unitHint), b.unitHint);
      quantity = { kind: 'exact', amount: niceRound(d.amount, d.unit), unit: d.unit };
    } else {
      const lo = pickDisplayUnit(fromBaseOf(b.min, b.unitHint), b.unitHint);
      const hi = pickDisplayUnit(fromBaseOf(b.max, b.unitHint), b.unitHint);
      quantity = {
        kind: 'range',
        min: niceRound(lo.amount, lo.unit),
        max: niceRound(hi.amount, hi.unit),
        unit: hi.unit,
      };
    }
  }

  const numeric = quantity ? formatQuantity(quantity, opts) : '';
  const display = [numeric, b.vagueNotes.join(' + ')].filter(Boolean).join(' + ');

  return {
    key: b.key,
    label: b.label,
    category: b.category,
    dimension: b.dimension,
    quantity,
    display: display || '—',
    vagueNotes: b.vagueNotes,
    sources: b.sources,
    optional: b.optional,
  };
}

function fromBaseOf(baseValue: number, unit: Unit | null): number {
  return unit === null ? baseValue : baseValue / unitDef(unit).toBase;
}

function compareLines(a: ShoppingLine, b: ShoppingLine): number {
  const byCategory = CATEGORY_ORDER_INDEX[a.category] - CATEGORY_ORDER_INDEX[b.category];
  if (byCategory !== 0) return byCategory;
  return a.label.localeCompare(b.label, 'de');
}

export function groupByCategory(
  lines: readonly ShoppingLine[],
): Array<{ category: GroceryCategory; lines: ShoppingLine[] }> {
  const groups = new Map<GroceryCategory, ShoppingLine[]>();
  for (const line of lines) {
    const bucket = groups.get(line.category);
    if (bucket) bucket.push(line);
    else groups.set(line.category, [line]);
  }
  return [...groups.entries()]
    .map(([category, ls]) => ({ category, lines: ls }))
    .sort((a, b) => CATEGORY_ORDER_INDEX[a.category] - CATEGORY_ORDER_INDEX[b.category]);
}
