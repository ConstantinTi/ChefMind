import { and, asc, desc, eq, inArray, like, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  photos, recipeIngredients, recipeSteps, recipeTags, recipes, stepIngredients, tags,
} from '@/db/schema';
import type { Recipe, ScaledRecipe } from '@/domain/recipe/types';
import { computeTotalMinutes, normalizeName, scaleRecipe, slugify } from '@/domain/recipe/derive';
import type {
  CreateRecipeArgs, GetRecipeArgs, ListRecipesArgs, SuggestRecipesArgs, UpdateRecipeArgs,
} from '@/contracts/recipes';
import type { RecipeInput } from '@/contracts/common';
import {
  ingredientInputToColumns, rowToImportReview, rowToIngredient, rowToNutrition, rowToStep,
} from './mappers';

export interface RecipeSummary {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  baseServings: number;
  totalMinutes: number | null;
  difficulty: string | null;
  tags: string[];
  isFavorite: boolean;
  rating: number | null;
  heroPhotoId: string | null;
  /** Thumbnail path for the hero photo, so the list can show it without a
   *  second round trip per card. */
  heroThumbKey: string | null;
  sourceType: string;
}

/** Slugs must be unique; append -2, -3 ... rather than failing the save. */
async function uniqueSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugify(title);
  const taken = await db.select({ slug: recipes.slug }).from(recipes)
    .where(like(recipes.slug, `${base}%`));
  const used = new Set(
    taken.filter((r) => r.slug !== undefined).map((r) => r.slug),
  );
  if (excludeId) {
    const current = await db.select({ slug: recipes.slug }).from(recipes)
      .where(eq(recipes.id, excludeId)).limit(1);
    if (current[0]) used.delete(current[0].slug);
  }
  if (!used.has(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

async function resolveTagIds(names: readonly string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const normalized = normalizeName(name);
    const existing = await db.select().from(tags).where(eq(tags.nameNormalized, normalized)).limit(1);
    if (existing[0]) {
      ids.push(existing[0].id);
      continue;
    }
    const [inserted] = await db.insert(tags)
      .values({ name, nameNormalized: normalized, kind: 'frei' })
      .returning({ id: tags.id });
    if (inserted) ids.push(inserted.id);
  }
  return ids;
}

export async function listRecipes(args: ListRecipesArgs): Promise<{ recipes: RecipeSummary[]; total: number }> {
  const conditions = [sql`${recipes.archivedAt} is null`];

  if (args.query?.trim()) {
    const q = `%${args.query.trim().toLowerCase()}%`;
    // Also match on ingredient names, so "Zucchini" finds recipes that use it
    // without naming it in the title.
    const ingredientMatch = db.select({ id: recipeIngredients.recipeId })
      .from(recipeIngredients)
      .where(like(recipeIngredients.nameNormalized, `%${normalizeName(args.query)}%`));
    const clause = or(
      like(sql`lower(${recipes.title})`, q),
      like(sql`lower(coalesce(${recipes.description}, ''))`, q),
      inArray(recipes.id, ingredientMatch),
    );
    if (clause) conditions.push(clause);
  }

  if (args.maxTotalMinutes) conditions.push(lte(recipes.totalMinutes, args.maxTotalMinutes));
  if (args.favoritesOnly) conditions.push(eq(recipes.isFavorite, true));

  if (args.tags?.length) {
    for (const tagName of args.tags) {
      const matching = db.select({ id: recipeTags.recipeId })
        .from(recipeTags)
        .innerJoin(tags, eq(tags.id, recipeTags.tagId))
        .where(eq(tags.nameNormalized, normalizeName(tagName)));
      conditions.push(inArray(recipes.id, matching));
    }
  }

  const where = and(...conditions);

  const [{ count = 0 } = {}] = await db
    .select({ count: sql<number>`count(*)` }).from(recipes).where(where);

  const rows = await db.select().from(recipes)
    .where(where)
    .orderBy(desc(recipes.isFavorite), desc(recipes.updatedAt))
    .limit(args.limit)
    .offset(args.offset);

  const [tagsByRecipe, thumbByPhotoId] = await Promise.all([
    tagNamesFor(rows.map((r) => r.id)),
    thumbsFor(rows.map((r) => r.heroPhotoId)),
  ]);

  return {
    total: Number(count),
    recipes: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      subtitle: r.subtitle,
      description: r.description,
      baseServings: r.baseServings,
      totalMinutes: r.totalMinutes,
      difficulty: r.difficulty,
      tags: tagsByRecipe.get(r.id) ?? [],
      isFavorite: r.isFavorite,
      rating: r.rating,
      heroPhotoId: r.heroPhotoId,
      heroThumbKey: r.heroPhotoId ? thumbByPhotoId.get(r.heroPhotoId) ?? null : null,
      sourceType: r.sourceType,
    })),
  };
}

async function thumbsFor(photoIds: ReadonlyArray<string | null>): Promise<Map<string, string>> {
  const ids = photoIds.filter((id): id is string => Boolean(id));
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const rows = await db.select({ id: photos.id, thumbKey: photos.thumbKey, storageKey: photos.storageKey })
    .from(photos).where(inArray(photos.id, ids));
  for (const row of rows) map.set(row.id, row.thumbKey ?? row.storageKey);
  return map;
}

async function tagNamesFor(recipeIds: readonly string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!recipeIds.length) return map;
  const rows = await db.select({ recipeId: recipeTags.recipeId, name: tags.name })
    .from(recipeTags)
    .innerJoin(tags, eq(tags.id, recipeTags.tagId))
    .where(inArray(recipeTags.recipeId, [...recipeIds]));
  for (const row of rows) {
    const list = map.get(row.recipeId);
    if (list) list.push(row.name);
    else map.set(row.recipeId, [row.name]);
  }
  return map;
}

export async function getRecipe(idOrSlug: string): Promise<Recipe | null> {
  const [row] = await db.select().from(recipes)
    .where(or(eq(recipes.id, idOrSlug), eq(recipes.slug, idOrSlug)))
    .limit(1);
  if (!row) return null;

  const [ingredientRows, stepRows, photoRows, tagRows, refRows] = await Promise.all([
    db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, row.id))
      .orderBy(recipeIngredients.sortOrder),
    db.select().from(recipeSteps).where(eq(recipeSteps.recipeId, row.id))
      .orderBy(recipeSteps.sortOrder),
    db.select().from(photos).where(eq(photos.recipeId, row.id)).orderBy(photos.sortOrder),
    db.select({ id: tags.id, name: tags.name, kind: tags.kind })
      .from(recipeTags).innerJoin(tags, eq(tags.id, recipeTags.tagId))
      .where(eq(recipeTags.recipeId, row.id)),
    db.select().from(stepIngredients)
      .innerJoin(recipeSteps, eq(recipeSteps.id, stepIngredients.stepId))
      .where(eq(recipeSteps.recipeId, row.id)),
  ]);

  const refsByStep = new Map<string, Array<{ recipeIngredientId: string; portion: number }>>();
  for (const r of refRows) {
    const link = r.step_ingredients;
    const list = refsByStep.get(link.stepId);
    const entry = { recipeIngredientId: link.recipeIngredientId, portion: link.portion };
    if (list) list.push(entry);
    else refsByStep.set(link.stepId, [entry]);
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    baseServings: row.baseServings,
    servingUnit: row.servingUnit,
    yieldNote: row.yieldNote,
    prepMinutes: row.prepMinutes,
    cookMinutes: row.cookMinutes,
    restMinutes: row.restMinutes,
    totalMinutes: row.totalMinutes,
    difficulty: row.difficulty,
    precisionMode: row.precisionMode,
    sourceType: row.sourceType,
    sourceTitle: row.sourceTitle,
    sourceAuthor: row.sourceAuthor,
    sourceUrl: row.sourceUrl,
    sourcePage: row.sourcePage,
    ingredients: ingredientRows.map(rowToIngredient),
    steps: stepRows.map((s) => rowToStep(s, refsByStep.get(s.id) ?? [])),
    tags: tagRows.map((t) => ({ id: t.id, name: t.name, kind: t.kind })),
    photos: photoRows.map((p) => ({
      id: p.id, storageKey: p.storageKey, thumbKey: p.thumbKey, caption: p.caption,
    })),
    heroPhotoId: row.heroPhotoId,
    nutrition: rowToNutrition(row),
    importReview: rowToImportReview(row),
    notes: row.notes,
    rating: row.rating,
    isFavorite: row.isFavorite,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * The form the MCP tools hand to a language model: already scaled, already
 * formatted. Models are bad at unit arithmetic and worse at "1.333 Tassen".
 */
export async function getScaledRecipe(args: GetRecipeArgs): Promise<ScaledRecipe | null> {
  const recipe = await getRecipe(args.idOrSlug);
  if (!recipe) return null;
  return scaleRecipe(recipe, args.servings ?? recipe.baseServings);
}

function recipeColumns(input: Partial<RecipeInput>) {
  return {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.subtitle !== undefined ? { subtitle: input.subtitle ?? null } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.baseServings !== undefined ? { baseServings: input.baseServings } : {}),
    ...(input.servingUnit !== undefined ? { servingUnit: input.servingUnit } : {}),
    ...(input.yieldNote !== undefined ? { yieldNote: input.yieldNote ?? null } : {}),
    ...(input.prepMinutes !== undefined ? { prepMinutes: input.prepMinutes ?? null } : {}),
    ...(input.cookMinutes !== undefined ? { cookMinutes: input.cookMinutes ?? null } : {}),
    ...(input.restMinutes !== undefined ? { restMinutes: input.restMinutes ?? null } : {}),
    ...(input.difficulty !== undefined ? { difficulty: input.difficulty ?? null } : {}),
    ...(input.precisionMode !== undefined ? { precisionMode: input.precisionMode } : {}),
    ...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
    ...(input.sourceTitle !== undefined ? { sourceTitle: input.sourceTitle ?? null } : {}),
    ...(input.sourceAuthor !== undefined ? { sourceAuthor: input.sourceAuthor ?? null } : {}),
    ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl || null } : {}),
    ...(input.sourcePage !== undefined ? { sourcePage: input.sourcePage ?? null } : {}),
    ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
    ...(input.rating !== undefined ? { rating: input.rating ?? null } : {}),
    ...(input.isFavorite !== undefined ? { isFavorite: input.isFavorite } : {}),
    ...(input.nutrition !== undefined ? {
      nutritionKcal: input.nutrition?.kcal ?? null,
      nutritionProtein: input.nutrition?.protein ?? null,
      nutritionCarbs: input.nutrition?.carbs ?? null,
      nutritionFat: input.nutrition?.fat ?? null,
      nutritionFiber: input.nutrition?.fiber ?? null,
    } : {}),
  };
}

/** Replaces the ingredient/step/tag rows of a recipe wholesale. */
async function writeChildren(recipeId: string, input: Partial<RecipeInput>) {
  if (input.ingredients) {
    await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId));
    if (input.ingredients.length) {
      await db.insert(recipeIngredients)
        .values(input.ingredients.map((ing, i) => ingredientInputToColumns(ing, recipeId, i)));
    }
  }

  if (input.steps) {
    await db.delete(recipeSteps).where(eq(recipeSteps.recipeId, recipeId));
    if (input.steps.length) {
      const inserted = await db.insert(recipeSteps).values(
        input.steps.map((s, i) => ({
          recipeId,
          sortOrder: i,
          groupLabel: s.groupLabel ?? null,
          text: s.text,
          durationMinutes: s.durationMinutes ?? null,
          temperatureC: s.temperatureC ?? null,
          temperatureMode: s.temperatureMode ?? null,
        })),
      ).returning({ id: recipeSteps.id });

      // Steps reference ingredients by their index in the same payload, which
      // is the only stable handle before the rows have ids.
      const ingredientRows = await db.select({ id: recipeIngredients.id })
        .from(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId))
        .orderBy(recipeIngredients.sortOrder);

      const links = input.steps.flatMap((s, i) =>
        (s.ingredientIndices ?? [])
          .map((idx) => {
            const stepId = inserted[i]?.id;
            const ingredientId = ingredientRows[idx]?.id;
            return stepId && ingredientId
              ? { stepId, recipeIngredientId: ingredientId, portion: 1 }
              : null;
          })
          .filter((l): l is { stepId: string; recipeIngredientId: string; portion: number } => l !== null));

      if (links.length) await db.insert(stepIngredients).values(links);
    }
  }

  if (input.tags) {
    await db.delete(recipeTags).where(eq(recipeTags.recipeId, recipeId));
    const tagIds = await resolveTagIds(input.tags);
    if (tagIds.length) {
      await db.insert(recipeTags).values(tagIds.map((tagId) => ({ recipeId, tagId })));
    }
  }
}

export async function createRecipe(input: CreateRecipeArgs): Promise<Recipe> {
  const slug = await uniqueSlug(input.title);
  const [row] = await db.insert(recipes).values({
    ...recipeColumns(input),
    title: input.title.trim(),
    slug,
    totalMinutes: computeTotalMinutes(
      input.prepMinutes ?? null, input.cookMinutes ?? null, input.restMinutes ?? null,
    ),
    nutritionSource: input.nutrition ? 'manual' : null,
  }).returning({ id: recipes.id });

  if (!row) throw new Error('Rezept konnte nicht angelegt werden.');
  await writeChildren(row.id, input);

  const created = await getRecipe(row.id);
  if (!created) throw new Error('Rezept konnte nach dem Anlegen nicht gelesen werden.');
  return created;
}

export async function updateRecipe({ id, patch }: UpdateRecipeArgs): Promise<Recipe> {
  const existing = await getRecipe(id);
  if (!existing) throw new Error(`Rezept nicht gefunden: ${id}`);

  const columns = recipeColumns(patch);
  const totalMinutes = computeTotalMinutes(
    patch.prepMinutes !== undefined ? patch.prepMinutes ?? null : existing.prepMinutes,
    patch.cookMinutes !== undefined ? patch.cookMinutes ?? null : existing.cookMinutes,
    patch.restMinutes !== undefined ? patch.restMinutes ?? null : existing.restMinutes,
  );

  await db.update(recipes).set({
    ...columns,
    ...(patch.title ? { slug: await uniqueSlug(patch.title, existing.id) } : {}),
    ...(patch.nutrition !== undefined ? { nutritionSource: patch.nutrition ? 'manual' as const : null } : {}),
    totalMinutes,
    updatedAt: new Date(),
  }).where(eq(recipes.id, existing.id));

  await writeChildren(existing.id, patch);

  const updated = await getRecipe(existing.id);
  if (!updated) throw new Error('Rezept konnte nach dem Ändern nicht gelesen werden.');
  return updated;
}

export async function deleteRecipe(id: string): Promise<{ deleted: boolean }> {
  const existing = await getRecipe(id);
  if (!existing) return { deleted: false };
  await db.delete(recipes).where(eq(recipes.id, existing.id));
  return { deleted: true };
}

/**
 * Ranks recipes by how many of the supplied ingredients they use. Intentionally
 * simple: "what can I cook with what is in the fridge" does not need embeddings.
 */
export async function suggestRecipes(args: SuggestRecipesArgs) {
  const { recipes: candidates } = await listRecipes({
    tags: args.tags,
    maxTotalMinutes: args.maxTotalMinutes,
    limit: 200,
    offset: 0,
  });
  if (!candidates.length) return { suggestions: [] };

  const wanted = args.haveIngredients.map(normalizeName).filter(Boolean);
  const rows = await db.select({
    recipeId: recipeIngredients.recipeId,
    name: recipeIngredients.nameNormalized,
    optional: recipeIngredients.optional,
  }).from(recipeIngredients)
    .where(inArray(recipeIngredients.recipeId, candidates.map((c) => c.id)));

  const byRecipe = new Map<string, Array<{ name: string; optional: boolean }>>();
  for (const r of rows) {
    const list = byRecipe.get(r.recipeId);
    if (list) list.push({ name: r.name, optional: r.optional });
    else byRecipe.set(r.recipeId, [{ name: r.name, optional: r.optional }]);
  }

  const suggestions = candidates.map((recipe) => {
    const ingredients = (byRecipe.get(recipe.id) ?? []).filter((i) => !i.optional);
    const missing = ingredients
      .filter((i) => !wanted.some((w) => i.name.includes(w) || w.includes(i.name)))
      .map((i) => i.name);
    const matched = ingredients.length - missing.length;
    return {
      recipe,
      matchedCount: matched,
      missingCount: missing.length,
      missing: missing.slice(0, 10),
      score: ingredients.length ? matched / ingredients.length : 0,
    };
  });

  suggestions.sort((a, b) => b.score - a.score || a.missingCount - b.missingCount);
  return { suggestions: suggestions.slice(0, args.limit) };
}

/** Every tag actually in use, with how many recipes carry it. Powers the
 *  filter row on the list page — tags that exist but are unused are noise. */
export async function listTagsInUse(): Promise<Array<{ name: string; count: number }>> {
  const rows = await db.select({
    name: tags.name,
    count: sql<number>`count(${recipeTags.recipeId})`,
  })
    .from(tags)
    .innerJoin(recipeTags, eq(recipeTags.tagId, tags.id))
    .innerJoin(recipes, eq(recipes.id, recipeTags.recipeId))
    .where(sql`${recipes.archivedAt} is null`)
    .groupBy(tags.id)
    .orderBy(desc(sql`count(${recipeTags.recipeId})`), asc(tags.name));

  return rows.map((r) => ({ name: r.name, count: Number(r.count) }));
}
