import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { mealPlanEntries, recipes } from '@/db/schema';
import { getRecipe } from './recipes';
import type { MealSlot } from '@/domain/recipe/types';
import {
  DeleteMealPlanEntryInput, GetMealPlanInput, MoveMealPlanEntryInput, SetMealPlanEntryInput,
} from '@/contracts/planning';

export const SLOT_LABELS: Readonly<Record<MealSlot, string>> = {
  fruehstueck: 'Frühstück',
  mittag: 'Mittagessen',
  abend: 'Abendessen',
  snack: 'Snack',
};

export const WEEKDAY_LABELS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'] as const;

export function toIsoDate(d: Date): string {
  // Build from local parts, not toISOString(), which shifts across midnight in
  // any timezone east or west of UTC and would file Monday's dinner under Sunday.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The Monday of the week containing `date`. */
export function startOfWeek(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - weekday);
  return toIsoDate(d);
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export interface MealPlanEntry {
  id: string;
  date: string;
  slot: MealSlot;
  recipeId: string | null;
  recipeTitle: string | null;
  recipeSlug: string | null;
  freeText: string | null;
  servings: number | null;
  note: string | null;
}

export interface MealPlanWeek {
  weekStart: string;
  weekEnd: string;
  days: Array<{ date: string; weekday: string; entries: MealPlanEntry[] }>;
}

export async function getMealPlan(args: z.infer<typeof GetMealPlanInput>): Promise<MealPlanWeek> {
  const weekStart = args.weekStart ?? startOfWeek();
  const weekEnd = addDays(weekStart, 6);

  const rows = await db.select({
    entry: mealPlanEntries,
    recipeTitle: recipes.title,
    recipeSlug: recipes.slug,
  })
    .from(mealPlanEntries)
    .leftJoin(recipes, eq(recipes.id, mealPlanEntries.recipeId))
    .where(and(gte(mealPlanEntries.date, weekStart), lte(mealPlanEntries.date, weekEnd)))
    .orderBy(asc(mealPlanEntries.date), asc(mealPlanEntries.sortOrder));

  const entries: MealPlanEntry[] = rows.map((r) => ({
    id: r.entry.id,
    date: r.entry.date,
    slot: r.entry.slot,
    recipeId: r.entry.recipeId,
    recipeTitle: r.recipeTitle ?? null,
    recipeSlug: r.recipeSlug ?? null,
    freeText: r.entry.freeText,
    servings: r.entry.servings,
    note: r.entry.note,
  }));

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    return {
      date,
      weekday: WEEKDAY_LABELS[i] ?? '',
      entries: entries.filter((e) => e.date === date),
    };
  });

  return { weekStart, weekEnd, days };
}

export async function setMealPlanEntry(args: z.infer<typeof SetMealPlanEntryInput>): Promise<MealPlanEntry> {
  if (!args.recipeId && !args.freeText?.trim()) {
    throw new Error('Ein Eintrag braucht entweder ein Rezept oder einen Text.');
  }

  // Accept a slug as well as an id: list_recipes shows slugs, so that is what a
  // caller naturally passes back. Without this the insert fails downstream with
  // a bare "FOREIGN KEY constraint failed", which says nothing useful.
  let recipeId: string | null = null;
  if (args.recipeId) {
    const recipe = await getRecipe(args.recipeId);
    if (!recipe) throw new Error(`Rezept nicht gefunden: ${args.recipeId}`);
    recipeId = recipe.id;
  }

  const [row] = await db.insert(mealPlanEntries).values({
    date: args.date,
    slot: args.slot,
    recipeId,
    freeText: args.freeText ?? null,
    servings: args.servings ?? null,
    note: args.note ?? null,
  }).returning({ id: mealPlanEntries.id });

  if (!row) throw new Error('Eintrag konnte nicht gespeichert werden.');

  const plan = await getMealPlan({ weekStart: startOfWeekOf(args.date) });
  const created = plan.days.flatMap((d) => d.entries).find((e) => e.id === row.id);
  if (!created) throw new Error('Eintrag konnte nach dem Speichern nicht gelesen werden.');
  return created;
}

function startOfWeekOf(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return startOfWeek(new Date(y!, (m ?? 1) - 1, d ?? 1));
}

/** Moves a planned meal to another day or slot, keeping recipe and servings. */
export async function moveMealPlanEntry(args: z.infer<typeof MoveMealPlanEntryInput>) {
  await db.update(mealPlanEntries)
    .set({ date: args.date, ...(args.slot ? { slot: args.slot } : {}) })
    .where(eq(mealPlanEntries.id, args.id));
  return { moved: true };
}

export async function deleteMealPlanEntry(args: z.infer<typeof DeleteMealPlanEntryInput>) {
  await db.delete(mealPlanEntries).where(eq(mealPlanEntries.id, args.id));
  return { deleted: true };
}

/** Every recipe planned in a date range, with the servings each entry asked for. */
export async function plannedRecipes(weekStart: string, weekEnd: string) {
  const rows = await db.select({
    recipeId: mealPlanEntries.recipeId,
    servings: mealPlanEntries.servings,
    baseServings: recipes.baseServings,
    title: recipes.title,
  })
    .from(mealPlanEntries)
    .innerJoin(recipes, eq(recipes.id, mealPlanEntries.recipeId))
    .where(and(gte(mealPlanEntries.date, weekStart), lte(mealPlanEntries.date, weekEnd)));

  return rows
    .filter((r): r is typeof r & { recipeId: string } => r.recipeId !== null)
    .map((r) => ({
      recipeId: r.recipeId,
      servings: r.servings ?? r.baseServings,
      title: r.title,
    }));
}
