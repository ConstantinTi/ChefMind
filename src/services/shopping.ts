import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { shoppingListItems, shoppingListSources, shoppingLists } from '@/db/schema';
import {
  aggregateIngredients, groupByCategory, type AggregateInput, type ShoppingLine,
} from '@/domain/shopping/aggregate';
import { CATEGORY_LABELS, type GroceryCategory } from '@/domain/shopping/categories';
import { scaleRecipe, normalizeName } from '@/domain/recipe/derive';
import {
  AddShoppingItemInput, BuildShoppingListInput, CheckShoppingItemInput,
  ClearCheckedItemsInput, DeleteShoppingItemInput, DeleteShoppingListInput, GetShoppingListInput,
} from '@/contracts/planning';
import { getRecipe } from './recipes';
import { addDays, plannedRecipes, startOfWeek } from './mealplan';

export interface ShoppingListView {
  id: string | null;
  name: string;
  createdAt: Date | null;
  groups: Array<{
    category: GroceryCategory;
    label: string;
    items: Array<{
      id: string | null;
      label: string;
      display: string;
      checked: boolean;
      isManual: boolean;
      sources: Array<{ recipeId: string; recipeTitle: string; originalDisplay: string }>;
    }>;
  }>;
  sources: Array<{ recipeId: string; recipeTitle: string; servings: number }>;
}

/**
 * Computes a shopping list from either an explicit set of recipes or a stretch
 * of the meal plan. Pure computation by default — `save: true` persists it.
 */
export async function buildShoppingList(
  args: z.infer<typeof BuildShoppingListInput>,
): Promise<ShoppingListView> {
  const requested = args.recipes?.length
    ? args.recipes.map((r) => ({ recipeId: r.recipeId, servings: r.servings, title: '' }))
    : await plannedRecipes(
        args.weekStart ?? startOfWeek(),
        args.weekEnd ?? addDays(args.weekStart ?? startOfWeek(), 6),
      );

  const inputs: AggregateInput[] = [];
  const sources: ShoppingListView['sources'] = [];

  for (const entry of requested) {
    const recipe = await getRecipe(entry.recipeId);
    if (!recipe) continue;
    const servings = entry.servings ?? recipe.baseServings;
    // Scale first, aggregate second — aggregation only ever sees canonical numbers.
    const scaled = scaleRecipe(recipe, servings);
    sources.push({ recipeId: recipe.id, recipeTitle: recipe.title, servings });

    for (const ingredient of scaled.ingredients) {
      inputs.push({
        ingredient,
        source: {
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          originalDisplay: ingredient.display,
          servings,
        },
      });
    }
  }

  const lines = aggregateIngredients(inputs, {
    includePantryStaples: args.includePantryStaples,
    rangeStrategy: args.rangeStrategy,
  });

  const name = args.name ?? defaultListName(args);

  if (!args.save) return { id: null, name, createdAt: null, ...toGroups(lines), sources };

  const [list] = await db.insert(shoppingLists).values({ name }).returning({ id: shoppingLists.id });
  if (!list) throw new Error('Einkaufsliste konnte nicht gespeichert werden.');

  if (sources.length) {
    await db.insert(shoppingListSources).values(
      sources.map((s) => ({ listId: list.id, recipeId: s.recipeId, servings: s.servings })),
    );
  }

  if (lines.length) {
    await db.insert(shoppingListItems).values(lines.map((line, i) => ({
      listId: list.id,
      label: line.label,
      nameNormalized: normalizeName(line.label),
      category: line.category,
      display: line.display,
      dimension: line.dimension,
      amountMin: line.quantity && 'amount' in line.quantity ? line.quantity.amount
        : line.quantity && 'min' in line.quantity ? line.quantity.min : null,
      amountMax: line.quantity && 'amount' in line.quantity ? line.quantity.amount
        : line.quantity && 'max' in line.quantity ? line.quantity.max : null,
      unit: line.quantity && 'unit' in line.quantity ? line.quantity.unit : null,
      sources: line.sources.map((s) => ({
        recipeId: s.recipeId, recipeTitle: s.recipeTitle, originalDisplay: s.originalDisplay,
      })),
      sortOrder: i,
    })));
  }

  const saved = await getShoppingList({ id: list.id });
  if (!saved) throw new Error('Einkaufsliste konnte nach dem Speichern nicht gelesen werden.');
  return saved;
}

function defaultListName(args: z.infer<typeof BuildShoppingListInput>): string {
  if (args.weekStart) return `Einkauf ab ${args.weekStart}`;
  return `Einkauf ${new Date().toLocaleDateString('de-DE')}`;
}

function toGroups(lines: readonly ShoppingLine[]): Pick<ShoppingListView, 'groups'> {
  return {
    groups: groupByCategory(lines).map((g) => ({
      category: g.category,
      label: CATEGORY_LABELS[g.category],
      items: g.lines.map((l) => ({
        id: null,
        label: l.label,
        display: l.display,
        checked: false,
        isManual: false,
        sources: l.sources.map((s) => ({
          recipeId: s.recipeId, recipeTitle: s.recipeTitle, originalDisplay: s.originalDisplay,
        })),
      })),
    })),
  };
}

export async function getShoppingList(
  args: z.infer<typeof GetShoppingListInput>,
): Promise<ShoppingListView | null> {
  const [list] = args.id
    ? await db.select().from(shoppingLists).where(eq(shoppingLists.id, args.id)).limit(1)
    : await db.select().from(shoppingLists).orderBy(desc(shoppingLists.createdAt)).limit(1);
  if (!list) return null;

  const [items, sourceRows] = await Promise.all([
    db.select().from(shoppingListItems).where(eq(shoppingListItems.listId, list.id))
      .orderBy(shoppingListItems.sortOrder),
    db.select().from(shoppingListSources).where(eq(shoppingListSources.listId, list.id)),
  ]);

  const byCategory = new Map<GroceryCategory, ShoppingListView['groups'][number]['items']>();
  for (const item of items) {
    const entry = {
      id: item.id,
      label: item.label,
      display: item.display,
      checked: item.checked,
      isManual: item.isManual,
      sources: item.sources ?? [],
    };
    const bucket = byCategory.get(item.category);
    if (bucket) bucket.push(entry);
    else byCategory.set(item.category, [entry]);
  }

  return {
    id: list.id,
    name: list.name,
    createdAt: list.createdAt,
    groups: [...byCategory.entries()].map(([category, entries]) => ({
      category,
      label: CATEGORY_LABELS[category],
      items: entries,
    })),
    sources: sourceRows.map((s) => ({ recipeId: s.recipeId, recipeTitle: '', servings: s.servings })),
  };
}

export async function addShoppingItem(args: z.infer<typeof AddShoppingItemInput>) {
  const [row] = await db.insert(shoppingListItems).values({
    listId: args.listId,
    label: args.label.trim(),
    nameNormalized: normalizeName(args.label),
    display: args.display,
    isManual: true,
    sortOrder: 9999,
  }).returning({ id: shoppingListItems.id });
  return { id: row?.id ?? null };
}

export async function checkShoppingItem(args: z.infer<typeof CheckShoppingItemInput>) {
  await db.update(shoppingListItems)
    .set({ checked: args.checked })
    .where(eq(shoppingListItems.id, args.itemId));
  return { checked: args.checked };
}

export async function deleteShoppingItem(args: z.infer<typeof DeleteShoppingItemInput>) {
  await db.delete(shoppingListItems).where(eq(shoppingListItems.id, args.itemId));
  return { deleted: true };
}

export async function deleteShoppingList(args: z.infer<typeof DeleteShoppingListInput>) {
  await db.delete(shoppingLists).where(eq(shoppingLists.id, args.id));
  return { deleted: true };
}

/** Clears the trolley: either drops everything already in it, or unticks it. */
export async function clearCheckedItems(args: z.infer<typeof ClearCheckedItemsInput>) {
  const where = and(eq(shoppingListItems.listId, args.listId), eq(shoppingListItems.checked, true));
  if (args.restore) {
    await db.update(shoppingListItems).set({ checked: false }).where(where);
    return { restored: true };
  }
  await db.delete(shoppingListItems).where(where);
  return { removed: true };
}

export interface ShoppingListSummary {
  id: string;
  name: string;
  createdAt: Date;
  itemCount: number;
  checkedCount: number;
}

/** Every saved list, newest first — without this only the latest was reachable. */
export async function listShoppingLists(): Promise<ShoppingListSummary[]> {
  const rows = await db.select({
    id: shoppingLists.id,
    name: shoppingLists.name,
    createdAt: shoppingLists.createdAt,
    itemCount: sql<number>`count(${shoppingListItems.id})`,
    checkedCount: sql<number>`sum(case when ${shoppingListItems.checked} then 1 else 0 end)`,
  })
    .from(shoppingLists)
    .leftJoin(shoppingListItems, eq(shoppingListItems.listId, shoppingLists.id))
    .groupBy(shoppingLists.id)
    .orderBy(desc(shoppingLists.createdAt))
    .limit(50);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.createdAt,
    itemCount: Number(r.itemCount ?? 0),
    checkedCount: Number(r.checkedCount ?? 0),
  }));
}
