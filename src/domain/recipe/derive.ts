import type { Recipe, ScaledIngredient, ScaledRecipe } from './types';
import { scaleQuantity, scalingFactor, type ScaleOptions } from '../scaling/scale';
import { formatQuantity } from '../units/format';

export function computeTotalMinutes(
  prep: number | null,
  cook: number | null,
  rest: number | null,
): number | null {
  const parts = [prep, cook, rest].filter((n): n is number => typeof n === 'number' && n > 0);
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
}

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'rezept';
}

/** Merge key for ingredients: "Mehl (Type 550)" and "mehl" are the same thing. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[äöüß]/g, (c) => UMLAUTS[c] ?? c)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Projects a recipe onto a different portion count.
 *
 * Always scales from the stored base, never from a previously scaled value, so
 * sliding 4 -> 6 -> 3 -> 4 returns exactly the original numbers instead of
 * accumulating rounding drift.
 */
export function scaleRecipe(
  recipe: Recipe,
  targetServings: number,
  opts: ScaleOptions = {},
): ScaledRecipe {
  const factor = scalingFactor(recipe.baseServings, targetServings);
  const effective: ScaleOptions = { precisionMode: recipe.precisionMode, ...opts };

  const ingredients: ScaledIngredient[] = recipe.ingredients.map((ing) => {
    const r = scaleQuantity(ing.quantity, factor, ing.scaling, ing.rounding, effective);
    return {
      source: ing,
      scaled: r.scaled,
      exact: r.exact,
      display: formatQuantity(r.scaled, effective),
      didRound: r.didRound,
      didNotScale: r.didNotScale,
    };
  });

  const byId = new Map(ingredients.map((i) => [i.source.id, i]));
  const stepIngredients: Record<string, ScaledIngredient[]> = {};
  for (const step of recipe.steps) {
    stepIngredients[step.id] = step.ingredientRefs
      .map((ref) => byId.get(ref.recipeIngredientId))
      .filter((i): i is ScaledIngredient => Boolean(i));
  }

  // Times and temperatures are deliberately NOT scaled. A doubled roast really
  // does take longer, but not by any factor you can compute — the UI shows a
  // note instead of a wrong number.
  return {
    ...recipe,
    targetServings,
    factor,
    ingredients,
    stepIngredients,
    nutritionPerServing: recipe.nutrition,
  };
}

/** Fallback when nothing is configured: most households cook for four. */
export const DEFAULT_HOUSEHOLD_SERVINGS = 4;

/**
 * The portion count a recipe should open at.
 *
 * Opening every recipe at its own base servings means constantly re-dialling to
 * the number you actually cook for. So recipes measured in portions open at the
 * household default instead, with the original still shown next to the stepper.
 *
 * Anything measured in something else keeps its own number. A Hefezopf stored
 * as 12 Scheiben with "1 Zopf, ca. 35 cm" is not a thing you bake four of, and
 * silently rescaling it to 4 would produce a third of a loaf.
 */
export function initialServings(
  recipe: Pick<Recipe, 'baseServings' | 'servingUnit'>,
  householdServings: number,
): number {
  if (recipe.servingUnit !== 'portion') return recipe.baseServings;
  return householdServings > 0 ? householdServings : recipe.baseServings;
}
