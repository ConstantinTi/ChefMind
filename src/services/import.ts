import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { photos, recipes } from '@/db/schema';
import type { Recipe, RecipeDraft } from '@/domain/recipe/types';
import { suggestScalingPolicy } from '@/domain/scaling/policy';
import { categorizeIngredient } from '@/domain/shopping/categories';
import { parseIngredientList } from '@/domain/units/parse';
import type { CreateRecipeArgs } from '@/contracts/recipes';
import { RecipeInputSchema } from '@/contracts/common';
import { extractReadableText, extractRecipeFromHtml, JsonLdNotFoundError } from '@/lib/import/jsonld';
import { aiRecipeToDraft } from '@/lib/ai/schemas';
import { getAiProvider, type ImageInput } from '@/lib/ai/provider';
import { storePhoto, type StoredPhoto } from '@/lib/photos';
import { createRecipe, getRecipe } from './recipes';

export interface ImportResult {
  draft: CreateRecipeArgs;
  /** Set only when `save` was requested. */
  recipe: Recipe | null;
  /** Where it came from, so the UI can label an AI-invented recipe honestly. */
  method: 'jsonld' | 'ai-text' | 'ai-photo' | 'parser';
  confidence: number;
  warnings: string[];
}

/**
 * A draft -> the validated create payload.
 *
 * Fills in the scaling policy and grocery category for every ingredient, so a
 * photo-imported recipe scales as sensibly as a hand-entered one from the
 * moment it is saved.
 */
export function draftToRecipeInput(draft: RecipeDraft): CreateRecipeArgs {
  const ingredients = draft.ingredients.map((ing) => {
    const unit = 'unit' in ing.quantity ? ing.quantity.unit : null;
    const suggestion = suggestScalingPolicy(ing.name, unit);
    return {
      groupLabel: ing.groupLabel ?? null,
      name: ing.name,
      preparation: ing.preparation ?? null,
      note: ing.note ?? null,
      rawText: ing.rawText ?? null,
      quantity: ing.quantity,
      scaling: ing.scaling ?? suggestion.policy,
      rounding: ing.rounding ?? suggestion.rounding,
      category: ing.category ?? categorizeIngredient(ing.name),
      optional: ing.optional ?? false,
    };
  });

  return RecipeInputSchema.parse({
    title: draft.title,
    subtitle: draft.subtitle ?? null,
    description: draft.description ?? null,
    baseServings: draft.baseServings,
    servingUnit: draft.servingUnit ?? 'portion',
    yieldNote: draft.yieldNote ?? null,
    prepMinutes: draft.prepMinutes ?? null,
    cookMinutes: draft.cookMinutes ?? null,
    restMinutes: draft.restMinutes ?? null,
    difficulty: draft.difficulty ?? null,
    sourceType: draft.sourceType,
    sourceTitle: draft.sourceTitle ?? null,
    sourceAuthor: draft.sourceAuthor ?? null,
    sourceUrl: draft.sourceUrl ?? null,
    sourcePage: draft.sourcePage ?? null,
    ingredients,
    steps: draft.steps,
    tags: draft.tags ?? [],
    nutrition: draft.nutrition ?? null,
    notes: draft.notes ?? null,
  });
}

interface ReviewMeta {
  method: ImportResult['method'];
  confidence: number;
  warnings: string[];
}

/**
 * Saves the draft and keeps the importer's own caveats with it.
 *
 * These warnings used to live only in the HTTP response, which the import
 * screen rendered for the fraction of a second before it navigated away. A
 * warning nobody can read is the same as no warning at all, so they are stored
 * on the recipe and shown there until the cook dismisses them.
 */
async function maybeSave(
  draft: CreateRecipeArgs, save: boolean, review: ReviewMeta,
): Promise<Recipe | null> {
  if (!save) return null;
  const created = await createRecipe(draft);
  await db.update(recipes).set({
    importMethod: review.method,
    importConfidence: review.confidence,
    importWarnings: review.warnings,
    importReviewedAt: null,
  }).where(eq(recipes.id, created.id));
  return (await getRecipe(created.id)) ?? created;
}

/** Clears the import banner once the cook has been through the recipe. */
export async function markImportReviewed(recipeId: string) {
  await db.update(recipes)
    .set({ importReviewedAt: new Date() })
    .where(eq(recipes.id, recipeId));
  return { reviewed: true };
}

/**
 * URL import. JSON-LD first because it is exact and free; the LLM is only a
 * fallback for the minority of sites that publish no structured data.
 */
export async function importFromUrl(
  args: { url: string; save?: boolean },
): Promise<ImportResult> {
  const response = await fetch(args.url, {
    headers: {
      // Some sites serve a stub to unknown agents; identify honestly anyway.
      'User-Agent': 'ChefMind/0.1 (+https://github.com/ConstantinTi/ChefMind)',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`Seite konnte nicht geladen werden (HTTP ${response.status}).`);
  }
  const html = await response.text();

  try {
    const draft = draftToRecipeInput(extractRecipeFromHtml(html, args.url));
    return {
      draft,
      recipe: await maybeSave(draft, args.save ?? false, {
        method: 'jsonld', confidence: 0.95, warnings: [],
      }),
      method: 'jsonld',
      confidence: 0.95,
      warnings: [],
    };
  } catch (err) {
    if (!(err instanceof JsonLdNotFoundError)) throw err;
  }

  const provider = await getAiProvider();
  const ai = await provider.extractFromText(extractReadableText(html), `Quelle: ${args.url}`);
  const draft = draftToRecipeInput(aiRecipeToDraft(ai, {
    sourceType: 'web',
    sourceUrl: args.url,
    sourceTitle: new URL(args.url).hostname.replace(/^www\./, ''),
    sourceAuthor: null,
  }));
  return {
    draft,
    recipe: await maybeSave(draft, args.save ?? false, {
      method: 'ai-text', confidence: ai.confidence, warnings: ai.warnings,
    }),
    method: 'ai-text',
    confidence: ai.confidence,
    warnings: ai.warnings,
  };
}

export async function importFromText(
  args: { text: string; title?: string; save?: boolean },
): Promise<ImportResult> {
  try {
    const provider = await getAiProvider();
    const ai = await provider.extractFromText(args.text, args.title ? `Titel: ${args.title}` : undefined);
    const draft = draftToRecipeInput(aiRecipeToDraft(ai, {
      sourceType: 'own', sourceUrl: null, sourceTitle: null, sourceAuthor: null,
    }));
    return {
      draft,
      recipe: await maybeSave(draft, args.save ?? false, {
        method: 'ai-text', confidence: ai.confidence, warnings: ai.warnings,
      }),
      method: 'ai-text',
      confidence: ai.confidence,
      warnings: ai.warnings,
    };
  } catch {
    // No API key, or the model failed: fall back to the offline parser. It only
    // understands ingredient lists, but that beats refusing the import outright.
    const parsed = parseIngredientList(args.text);
    const draft = draftToRecipeInput({
      title: args.title ?? 'Importiertes Rezept',
      baseServings: 4,
      sourceType: 'own',
      ingredients: parsed.map((p) => ({
        name: p.name,
        preparation: p.preparation,
        note: p.note,
        quantity: p.quantity,
      })),
      steps: [],
    });
    const warnings = ['Ohne KI wurden nur die Zutaten erkannt — Arbeitsschritte bitte selbst ergänzen.'];
    return {
      draft,
      recipe: await maybeSave(draft, args.save ?? false, {
        method: 'parser', confidence: 0.4, warnings,
      }),
      method: 'parser',
      confidence: 0.4,
      warnings,
    };
  }
}

export interface PhotoImportArgs {
  images: Array<{ bytes: Buffer; mediaType: ImageInput['mediaType'] }>;
  mode: 'recipe' | 'dish';
  hint?: string;
  save?: boolean;
}

/**
 * Photo import. A photo of a *dish* produces an invented recipe, so it is saved
 * with sourceType 'ai' and carries an explicit warning — an AI reconstruction
 * must never quietly pass itself off as a transcribed one.
 */
export async function importFromPhotos(args: PhotoImportArgs): Promise<ImportResult> {
  if (!args.images.length) throw new Error('Kein Bild übergeben.');

  const provider = await getAiProvider();
  const ai = await provider.extractFromImages(
    args.images.map((i) => ({ base64: i.bytes.toString('base64'), mediaType: i.mediaType })),
    args.mode,
    args.hint,
  );

  const draft = draftToRecipeInput(aiRecipeToDraft(ai, {
    sourceType: args.mode === 'dish' ? 'ai' : 'photo',
    sourceUrl: null,
    sourceTitle: args.mode === 'dish' ? 'Aus einem Foto des Gerichts erzeugt' : 'Abfotografiertes Rezept',
    sourceAuthor: null,
  }));

  const warnings = args.mode === 'dish'
    ? ['Dieses Rezept wurde aus einem Foto des fertigen Gerichts rekonstruiert und stammt aus keiner Quelle.', ...ai.warnings]
    : ai.warnings;

  const recipe = await maybeSave(draft, args.save ?? false, {
    method: 'ai-photo', confidence: ai.confidence, warnings,
  });

  // Keep the source photos with the recipe — they are the audit trail for the
  // transcription, and the best illustration the recipe will ever have.
  if (recipe) {
    const stored: StoredPhoto[] = [];
    for (const image of args.images) stored.push(await storePhoto(image.bytes));
    if (stored.length) {
      const inserted = await db.insert(photos).values(
        stored.map((p, i) => ({
          recipeId: recipe.id,
          storageKey: p.storageKey,
          thumbKey: p.thumbKey,
          width: p.width,
          height: p.height,
          sortOrder: i,
        })),
      ).returning({ id: photos.id });
      if (inserted[0]) {
        await db.update(recipes).set({ heroPhotoId: inserted[0].id }).where(eq(recipes.id, recipe.id));
      }
    }
  }

  return { draft, recipe, method: 'ai-photo', confidence: ai.confidence, warnings };
}

/** Re-estimates nutrition for a saved recipe and stores the result. */
export async function estimateNutritionFor(recipeId: string) {
  const { getRecipe } = await import('./recipes');
  const recipe = await getRecipe(recipeId);
  if (!recipe) throw new Error('Rezept nicht gefunden.');

  const provider = await getAiProvider();
  const nutrition = await provider.estimateNutrition({
    title: recipe.title,
    baseServings: recipe.baseServings,
    sourceType: recipe.sourceType,
    ingredients: recipe.ingredients.map((i) => ({ name: i.name, quantity: i.quantity })),
    steps: [],
  });
  if (!nutrition) return null;

  await db.update(recipes).set({
    nutritionKcal: nutrition.kcal,
    nutritionProtein: nutrition.protein,
    nutritionCarbs: nutrition.carbs,
    nutritionFat: nutrition.fat,
    nutritionFiber: nutrition.fiber,
    nutritionSource: 'ai',
    updatedAt: new Date(),
  }).where(eq(recipes.id, recipeId));

  return { ...nutrition, source: 'ai' as const };
}

export const ImportFromPhotoToolInput = z.object({
  imagesBase64: z.array(z.string().min(1)).min(1).max(8)
    .describe('Ein oder mehrere Bilder als base64, ohne data:-Präfix.'),
  mode: z.enum(['recipe', 'dish']).default('recipe')
    .describe('"recipe" = Foto eines Rezepts, "dish" = Foto eines fertigen Gerichts.'),
  hint: z.string().max(500).optional(),
  save: z.boolean().default(false),
});
