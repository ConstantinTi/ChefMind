import type { InferSelectModel } from 'drizzle-orm';
import type { recipeIngredients, recipes, recipeSteps } from '@/db/schema';
import type { Quantity, ScalingPolicy } from '@/domain/units/types';
import type { ImportReview, Nutrition, RecipeIngredient, RecipeStep } from '@/domain/recipe/types';
import { normalizeQuantity } from '@/domain/units/convert';
import { normalizeName } from '@/domain/recipe/derive';
import type { IngredientInput } from '@/contracts/common';
import { categorizeIngredient } from '@/domain/shopping/categories';
import { suggestScalingPolicy } from '@/domain/scaling/policy';

type IngredientRow = InferSelectModel<typeof recipeIngredients>;
type StepRow = InferSelectModel<typeof recipeSteps>;
type RecipeRow = InferSelectModel<typeof recipes>;

/** DB columns -> the tagged union the domain works with. */
export function rowToQuantity(row: IngredientRow): Quantity {
  switch (row.quantityKind) {
    case 'toTaste':
      return { kind: 'toTaste' };
    case 'unquantified':
      return { kind: 'unquantified' };
    case 'range':
      return { kind: 'range', min: row.amountMin ?? 0, max: row.amountMax ?? 0, unit: row.unit ?? null };
    case 'approx':
      return { kind: 'approx', amount: row.amountMin ?? 0, unit: row.unit ?? null };
    case 'exact':
    default:
      return { kind: 'exact', amount: row.amountMin ?? 0, unit: row.unit ?? null };
  }
}

/**
 * The tagged union -> flat columns, with the canonical amount recomputed.
 *
 * Canonical values are derived on every write and never at read time: that is
 * what lets the shopping list aggregate twenty recipes in a single pass.
 */
export function quantityToColumns(q: Quantity) {
  const canonical = normalizeQuantity(q);
  const base = {
    dimension: canonical?.dimension ?? ('none' as const),
    baseMin: canonical?.min ?? null,
    baseMax: canonical?.max ?? null,
  };

  switch (q.kind) {
    case 'toTaste':
    case 'unquantified':
      return { quantityKind: q.kind, amountMin: null, amountMax: null, unit: null, ...base };
    case 'range':
      return { quantityKind: 'range' as const, amountMin: q.min, amountMax: q.max, unit: q.unit, ...base };
    default:
      return { quantityKind: q.kind, amountMin: q.amount, amountMax: q.amount, unit: q.unit, ...base };
  }
}

export function rowToScalingPolicy(row: IngredientRow): ScalingPolicy {
  return {
    mode: row.scalingMode,
    exponent: row.scalingExponent,
    step: row.scalingStep,
    min: row.scalingMin,
    max: row.scalingMax,
  };
}

export function rowToIngredient(row: IngredientRow): RecipeIngredient {
  const quantity = rowToQuantity(row);
  return {
    id: row.id,
    recipeId: row.recipeId,
    sortOrder: row.sortOrder,
    groupLabel: row.groupLabel,
    name: row.name,
    preparation: row.preparation,
    note: row.note,
    rawText: row.rawText,
    quantity,
    canonical: normalizeQuantity(quantity),
    scaling: rowToScalingPolicy(row),
    rounding: row.rounding,
    category: row.category,
    optional: row.optional,
    excludeFromShoppingList: row.excludeFromShoppingList,
  };
}

export function rowToStep(row: StepRow, refs: Array<{ recipeIngredientId: string; portion: number }>): RecipeStep {
  return {
    id: row.id,
    recipeId: row.recipeId,
    sortOrder: row.sortOrder,
    groupLabel: row.groupLabel,
    text: row.text,
    durationMinutes: row.durationMinutes,
    temperatureC: row.temperatureC,
    temperatureMode: row.temperatureMode,
    ingredientRefs: refs,
  };
}

export function rowToNutrition(row: RecipeRow): Nutrition | null {
  const values = [row.nutritionKcal, row.nutritionProtein, row.nutritionCarbs, row.nutritionFat, row.nutritionFiber];
  if (values.every((v) => v === null || v === undefined)) return null;
  return {
    kcal: row.nutritionKcal,
    protein: row.nutritionProtein,
    carbs: row.nutritionCarbs,
    fat: row.nutritionFat,
    fiber: row.nutritionFiber,
    source: row.nutritionSource ?? 'manual',
  };
}

/**
 * Import findings, but only while they still need a human. Once the cook has
 * marked them reviewed the recipe stops nagging, without losing the record of
 * where it came from.
 */
export function rowToImportReview(row: RecipeRow): ImportReview | null {
  if (!row.importMethod) return null;
  if (row.importReviewedAt) return null;
  const warnings = row.importWarnings ?? [];
  if (!warnings.length) return null;
  return { method: row.importMethod, confidence: row.importConfidence, warnings };
}

/**
 * Fills in everything the caller left out. Scaling behaviour and grocery
 * category are *suggested* from the ingredient name, never forced: an explicit
 * value from the editor or an importer always wins, because a 0.8 exponent
 * silently attached to something the cook thought was linear is a bug they
 * would not notice until dinner.
 */
export function ingredientInputToColumns(input: IngredientInput, recipeId: string, sortOrder: number) {
  const suggestion = suggestScalingPolicy(
    input.name,
    'unit' in input.quantity ? input.quantity.unit : null,
  );
  const scaling = input.scaling ?? suggestion.policy;

  return {
    recipeId,
    sortOrder,
    groupLabel: input.groupLabel ?? null,
    name: input.name.trim(),
    nameNormalized: normalizeName(input.name),
    preparation: input.preparation ?? null,
    note: input.note ?? null,
    rawText: input.rawText ?? null,
    ...quantityToColumns(input.quantity),
    scalingMode: scaling.mode,
    scalingExponent: scaling.exponent ?? null,
    scalingStep: scaling.step ?? null,
    scalingMin: scaling.min ?? null,
    scalingMax: scaling.max ?? null,
    rounding: input.rounding ?? suggestion.rounding,
    category: input.category ?? categorizeIngredient(input.name),
    optional: input.optional ?? false,
    excludeFromShoppingList: input.excludeFromShoppingList ?? false,
  };
}
