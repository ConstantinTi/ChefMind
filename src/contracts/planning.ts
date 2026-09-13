import { z } from 'zod';
import { MEAL_SLOTS } from '@/db/schema';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum im Format YYYY-MM-DD');

export const GetMealPlanInput = z.object({
  weekStart: isoDate.optional().describe('Montag der Woche. Ohne Angabe: die aktuelle Woche.'),
});

export const SetMealPlanEntryInput = z.object({
  date: isoDate,
  slot: z.enum(MEAL_SLOTS).default('abend'),
  recipeId: z.string().nullish()
    .describe('Rezept-ID oder Slug. null für einen freien Texteintrag wie "Reste".'),
  freeText: z.string().max(200).nullish().describe('z. B. "Reste" oder "Essen gehen".'),
  // coerce: a form submits "6", an MCP client sends 6. Both are valid here.
  servings: z.coerce.number().positive().max(100).nullish(),
  note: z.string().max(500).nullish(),
});

export const DeleteMealPlanEntryInput = z.object({ id: z.string().min(1) });

export const MoveMealPlanEntryInput = z.object({
  id: z.string().min(1),
  date: isoDate.describe('Zieldatum.'),
  slot: z.enum(MEAL_SLOTS).optional().describe('Ohne Angabe bleibt die Mahlzeit gleich.'),
});

export const BuildShoppingListInput = z.object({
  recipes: z.array(z.object({
    recipeId: z.string().min(1),
    servings: z.number().positive().max(1000).optional(),
  })).optional().describe('Explizite Rezeptliste. Alternativ weekStart/weekEnd angeben.'),
  weekStart: isoDate.optional().describe('Aus dem Wochenplan ab diesem Datum.'),
  weekEnd: isoDate.optional(),
  includePantryStaples: z.boolean().default(false)
    .describe('Salz, Pfeffer und Wasser mit auf die Liste nehmen.'),
  rangeStrategy: z.enum(['keepRange', 'max']).default('keepRange'),
  save: z.boolean().default(false).describe('true = Liste speichern, false = nur berechnen.'),
  name: z.string().max(120).optional(),
});

export const GetShoppingListInput = z.object({
  id: z.string().optional().describe('Ohne ID wird die zuletzt erstellte Liste geliefert.'),
});

export const AddShoppingItemInput = z.object({
  listId: z.string().min(1),
  label: z.string().min(1).max(200),
  display: z.string().max(100).default(''),
});

export const CheckShoppingItemInput = z.object({
  itemId: z.string().min(1),
  checked: z.boolean().default(true),
});

export const DeleteShoppingItemInput = z.object({ itemId: z.string().min(1) });

export const DeleteShoppingListInput = z.object({ id: z.string().min(1) });

export const ClearCheckedItemsInput = z.object({
  listId: z.string().min(1),
  /** false entfernt die abgehakten Positionen, true hakt sie nur wieder ab. */
  restore: z.boolean().default(false),
});
