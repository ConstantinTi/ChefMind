import { DEFAULT_HOUSEHOLD_SERVINGS } from '@/domain/recipe/derive';

/**
 * How many people you normally cook for. Recipes open at this number.
 *
 * Read here rather than in the domain layer, which stays free of environment
 * and I/O so the portion maths can run unchanged in the browser.
 */
export function householdServings(): number {
  const raw = Number(process.env.CHEFMIND_DEFAULT_SERVINGS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_HOUSEHOLD_SERVINGS;
}
