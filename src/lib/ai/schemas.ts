import { z } from 'zod';
import { UNIT_IDS, isUnit } from '@/domain/units/units';
import type { Quantity, Unit } from '@/domain/units/types';
import type { RecipeDraft } from '@/domain/recipe/types';

/**
 * The shape the model is constrained to return.
 *
 * Two deliberate constraints shape this schema:
 *
 * 1. It is flatter than the domain's `Quantity` union. Discriminated unions make
 *    brittle JSON schemas, and a model that must pick a `kind` before filling in
 *    fields gets it wrong more often than one that just fills numbers.
 *
 * 2. **No field is nullable.** Every `.nullable()` compiles to a union
 *    (`type: [..., "null"]` or `anyOf`), and the Anthropic API rejects a schema
 *    with more than 16 union-typed parameters — "This causes exponential
 *    compilation cost". An earlier version had 23 and every photo import failed
 *    with a 400. Instead, absence is expressed with sentinel values that the
 *    model can always produce: `""` for text, `0` for numbers. `aiRecipeToDraft`
 *    maps them back to null.
 */

/** Units plus "" for a bare count ("3 Eier"). An enum stays a single type. */
const UNIT_OR_EMPTY = [...UNIT_IDS, ''] as [string, ...string[]];

export const AiIngredientSchema = z.object({
  groupLabel: z.string()
    .describe('Zwischenüberschrift wie "Für den Teig". Leerer String, wenn es keine gibt.'),
  name: z.string().describe('Nur die Zutat selbst, ohne Menge und ohne Zubereitung.'),
  preparation: z.string()
    .describe('Zubereitung wie "fein gewürfelt" oder "zimmerwarm". Leerer String, wenn keine genannt.'),
  amountMin: z.number()
    .describe('Menge. Bei einem Bereich ("2-3") der untere Wert. 0, wenn keine Menge genannt ist.'),
  amountMax: z.number()
    .describe('Nur bei einem Bereich der obere Wert, sonst 0.'),
  unit: z.enum(UNIT_OR_EMPTY)
    .describe('Einheit aus der erlaubten Liste. Leerer String bei Stückzahlen ohne Einheit, z. B. "3 Eier".'),
  toTaste: z.boolean()
    .describe('true bei "nach Geschmack" oder "nach Belieben" — dann bleiben amountMin und amountMax 0.'),
  rawText: z.string().describe('Die Originalzeile, so wie sie in der Quelle steht.'),
});

export const AiStepSchema = z.object({
  groupLabel: z.string().describe('Zwischenüberschrift, sonst leerer String.'),
  text: z.string().describe('Ein Arbeitsschritt, als vollständiger Satz.'),
  durationMinutes: z.number().int()
    .describe('Dauer in Minuten, wenn im Schritt genannt (z. B. "20 Minuten backen"), sonst 0.'),
  temperatureC: z.number().int().describe('Temperatur in °C, wenn genannt, sonst 0.'),
});

export const AiNutritionSchema = z.object({
  kcal: z.number().describe('Kilokalorien je Portion, 0 wenn nicht schätzbar.'),
  protein: z.number().describe('Eiweiß in Gramm je Portion, 0 wenn nicht schätzbar.'),
  carbs: z.number().describe('Kohlenhydrate in Gramm je Portion, 0 wenn nicht schätzbar.'),
  fat: z.number().describe('Fett in Gramm je Portion, 0 wenn nicht schätzbar.'),
  fiber: z.number().describe('Ballaststoffe in Gramm je Portion, 0 wenn nicht schätzbar.'),
});

export const AiRecipeSchema = z.object({
  title: z.string().describe('Name des Gerichts, auf Deutsch.'),
  subtitle: z.string().describe('Kurzer Zusatz, sonst leerer String.'),
  description: z.string().describe('Ein bis zwei Sätze, was das Gericht ist. Sonst leerer String.'),
  servings: z.number().describe('Für wie viele Portionen die genannten Mengen gelten.'),
  yieldNote: z.string()
    .describe('Ergiebigkeit, die sich nicht in Portionen ausdrücken lässt, z. B. "1 Springform 26 cm". Sonst leerer String.'),
  prepMinutes: z.number().int().describe('Vorbereitungszeit in Minuten, 0 wenn nicht genannt.'),
  cookMinutes: z.number().int().describe('Koch- oder Backzeit in Minuten, 0 wenn nicht genannt.'),
  restMinutes: z.number().int().describe('Ruhe-, Geh- oder Marinierzeit in Minuten, 0 wenn nicht genannt.'),
  difficulty: z.enum(['easy', 'medium', 'hard', ''])
    .describe('Schwierigkeit, oder leerer String wenn nicht einschätzbar.'),
  ingredients: z.array(AiIngredientSchema),
  steps: z.array(AiStepSchema),
  tags: z.array(z.string()).describe('Wenige Schlagworte: Küche, Gang, Ernährungsform.'),
  notes: z.string().describe('Tipps oder Varianten aus der Quelle, sonst leerer String.'),
  nutritionPerServing: AiNutritionSchema
    .describe('Geschätzte Nährwerte pro Portion. Eine Schätzung ist ausdrücklich erwünscht.'),
  confidence: z.number().min(0).max(1)
    .describe('Wie sicher die Extraktion ist. Bei unleserlicher Handschrift deutlich niedriger.'),
  warnings: z.array(z.string())
    .describe('Was unklar war oder geraten wurde — wird dem Nutzer vor dem Speichern angezeigt.'),
});

export type AiRecipe = z.infer<typeof AiRecipeSchema>;

/** "" means "not present" — see the sentinel note above. */
const text = (value: string): string | null => (value.trim() === '' ? null : value.trim());
/** 0 means "not present". No recipe field here has a meaningful zero. */
const num = (value: number): number | null => (value === 0 || !Number.isFinite(value) ? null : value);

function toQuantity(ing: z.infer<typeof AiIngredientSchema>): Quantity {
  if (ing.toTaste) return { kind: 'toTaste' };

  const unit: Unit | null = isUnit(ing.unit) ? ing.unit : null;
  const min = num(ing.amountMin);
  if (min === null) return { kind: 'unquantified' };

  const max = num(ing.amountMax);
  if (max !== null && max !== min) return { kind: 'range', min, max, unit };
  return { kind: 'exact', amount: min, unit };
}

export type NutritionEstimate = {
  kcal: number | null; protein: number | null; carbs: number | null;
  fat: number | null; fiber: number | null;
} | null;

/** Sentinel zeroes -> nulls, and an all-zero estimate -> no estimate at all. */
export function toNutrition(n: z.infer<typeof AiNutritionSchema>): NutritionEstimate {
  const values = {
    kcal: num(n.kcal), protein: num(n.protein), carbs: num(n.carbs),
    fat: num(n.fat), fiber: num(n.fiber),
  };
  // All zeroes means the model had nothing to say — store no nutrition at all
  // rather than a row of misleading zeroes.
  return Object.values(values).every((v) => v === null) ? null : values;
}

/** Model output -> the same draft shape the manual editor and URL importer produce. */
export function aiRecipeToDraft(
  ai: AiRecipe,
  source: Pick<RecipeDraft, 'sourceType' | 'sourceUrl' | 'sourceTitle' | 'sourceAuthor'>,
): RecipeDraft {
  return {
    title: ai.title,
    subtitle: text(ai.subtitle),
    description: text(ai.description),
    baseServings: ai.servings > 0 ? ai.servings : 4,
    yieldNote: text(ai.yieldNote),
    prepMinutes: num(ai.prepMinutes),
    cookMinutes: num(ai.cookMinutes),
    restMinutes: num(ai.restMinutes),
    difficulty: ai.difficulty === '' ? null : ai.difficulty,
    ...source,
    ingredients: ai.ingredients
      .filter((ing) => ing.name.trim())
      .map((ing) => ({
        groupLabel: text(ing.groupLabel),
        name: ing.name.trim(),
        preparation: text(ing.preparation),
        rawText: text(ing.rawText),
        quantity: toQuantity(ing),
      })),
    steps: ai.steps
      .filter((s) => s.text.trim())
      .map((s) => ({
        groupLabel: text(s.groupLabel),
        text: s.text.trim(),
        durationMinutes: num(s.durationMinutes),
        temperatureC: num(s.temperatureC),
      })),
    tags: ai.tags.map((t) => t.trim()).filter(Boolean),
    nutrition: toNutrition(ai.nutritionPerServing),
    notes: text(ai.notes),
  };
}
