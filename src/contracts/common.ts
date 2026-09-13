import { z } from 'zod';
import { UNIT_IDS } from '@/domain/units/units';
import { GROCERY_CATEGORIES } from '@/domain/shopping/categories';

/**
 * The single source of truth for every input boundary in the app: HTML forms,
 * REST handlers and MCP tool schemas all validate against these. Sharing them
 * is what makes it impossible for the MCP tool surface to drift from the UI.
 */

export const UnitSchema = z.enum(UNIT_IDS).nullable();
export const CategorySchema = z.enum(GROCERY_CATEGORIES);

export const QuantitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('exact'), amount: z.number().finite(), unit: UnitSchema }),
  z.object({
    kind: z.literal('range'),
    min: z.number().finite(),
    max: z.number().finite(),
    unit: UnitSchema,
  }),
  z.object({ kind: z.literal('approx'), amount: z.number().finite(), unit: UnitSchema }),
  z.object({ kind: z.literal('toTaste') }),
  z.object({ kind: z.literal('unquantified') }),
]).describe('Menge einer Zutat. "toTaste" = nach Geschmack, "unquantified" = ohne Mengenangabe.');

export const ScalingPolicySchema = z.object({
  mode: z.enum(['linear', 'fixed', 'sublinear', 'stepped']).default('linear'),
  exponent: z.number().positive().max(1).nullish(),
  step: z.number().positive().nullish(),
  min: z.number().nullish(),
  max: z.number().nullish(),
}).describe(
  'Wie die Menge auf andere Portionszahlen umgerechnet wird. '
  + '"linear" = proportional, "fixed" = gar nicht (z. B. Öl zum Braten), '
  + '"sublinear" = unterproportional (Gewürze, Hefe), "stepped" = in ganzen Schritten (Dosen).',
);

export const RoundingSchema = z.enum(['none', 'integer', 'ceilInteger', 'fraction', 'nice']);

export const IngredientInputSchema = z.object({
  groupLabel: z.string().max(120).nullish(),
  name: z.string().min(1, 'Zutat braucht einen Namen').max(200),
  preparation: z.string().max(200).nullish(),
  note: z.string().max(200).nullish(),
  rawText: z.string().max(500).nullish(),
  quantity: QuantitySchema,
  scaling: ScalingPolicySchema.optional(),
  rounding: RoundingSchema.optional(),
  category: CategorySchema.optional(),
  optional: z.boolean().optional(),
  excludeFromShoppingList: z.boolean().optional(),
});

export const StepInputSchema = z.object({
  groupLabel: z.string().max(120).nullish(),
  text: z.string().min(1, 'Schritt darf nicht leer sein').max(4000),
  durationMinutes: z.number().int().positive().max(10_000).nullish(),
  temperatureC: z.number().int().min(0).max(400).nullish(),
  temperatureMode: z.enum(['ober_unterhitze', 'umluft', 'grill', 'herd']).nullish(),
  /** Indices into the ingredients array — stable across a create/update payload. */
  ingredientIndices: z.array(z.number().int().nonnegative()).optional(),
});

export const NutritionSchema = z.object({
  kcal: z.number().nonnegative().nullish(),
  protein: z.number().nonnegative().nullish(),
  carbs: z.number().nonnegative().nullish(),
  fat: z.number().nonnegative().nullish(),
  fiber: z.number().nonnegative().nullish(),
}).describe('Nährwerte je Basis-Portion.');

export const RecipeInputSchema = z.object({
  title: z.string().min(1, 'Titel fehlt').max(200),
  subtitle: z.string().max(200).nullish(),
  description: z.string().max(4000).nullish(),
  baseServings: z.number().positive().max(1000).default(4),
  servingUnit: z.enum(['portion', 'stueck', 'scheibe', 'glas', 'liter']).default('portion'),
  yieldNote: z.string().max(200).nullish(),
  prepMinutes: z.number().int().nonnegative().max(10_000).nullish(),
  cookMinutes: z.number().int().nonnegative().max(10_000).nullish(),
  restMinutes: z.number().int().nonnegative().max(100_000).nullish(),
  difficulty: z.enum(['easy', 'medium', 'hard']).nullish(),
  precisionMode: z.enum(['kitchen', 'exact']).default('kitchen'),
  sourceType: z.enum(['own', 'book', 'web', 'person', 'photo', 'ai', 'other']).default('own'),
  sourceTitle: z.string().max(300).nullish(),
  sourceAuthor: z.string().max(200).nullish(),
  sourceUrl: z.string().url().max(2000).nullish().or(z.literal('')),
  sourcePage: z.string().max(50).nullish(),
  ingredients: z.array(IngredientInputSchema).default([]),
  steps: z.array(StepInputSchema).default([]),
  tags: z.array(z.string().min(1).max(60)).default([]),
  nutrition: NutritionSchema.nullish(),
  notes: z.string().max(8000).nullish(),
  rating: z.number().int().min(1).max(5).nullish(),
  isFavorite: z.boolean().default(false),
});

export type RecipeInput = z.infer<typeof RecipeInputSchema>;
export type IngredientInput = z.infer<typeof IngredientInputSchema>;
export type StepInput = z.infer<typeof StepInputSchema>;
