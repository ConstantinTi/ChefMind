import * as cheerio from 'cheerio';
import type { RecipeDraft } from '@/domain/recipe/types';
import { parseIngredientLine } from '@/domain/units/parse';

/**
 * Imports a recipe from a URL by reading the schema.org/Recipe JSON-LD that
 * almost every cooking site already embeds for Google.
 *
 * This is exact, free and instant — strictly better than running OCR or an LLM
 * over the rendered page, which is why it is tried first and the model is only
 * a fallback.
 */

interface JsonLdRecipe {
  '@type'?: string | string[];
  name?: string;
  description?: string;
  recipeYield?: string | number | Array<string | number>;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  recipeIngredient?: string[];
  ingredients?: string[];
  recipeInstructions?: unknown;
  recipeCategory?: string | string[];
  recipeCuisine?: string | string[];
  keywords?: string | string[];
  author?: { name?: string } | string | Array<{ name?: string }>;
  nutrition?: Record<string, unknown>;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function hasType(node: JsonLdRecipe, type: string): boolean {
  return asArray(node['@type']).some((t) => String(t).toLowerCase() === type.toLowerCase());
}

/** Walks @graph, arrays and nested objects looking for the Recipe node. */
function findRecipeNode(value: unknown, depth = 0): JsonLdRecipe | null {
  if (depth > 6 || value === null || typeof value !== 'object') return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const node = value as JsonLdRecipe & { '@graph'?: unknown };
  if (hasType(node, 'Recipe')) return node;
  if (node['@graph']) return findRecipeNode(node['@graph'], depth + 1);
  return null;
}

/** "PT1H30M" -> 90. Returns null for anything it cannot read. */
export function parseIsoDuration(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return null;
  const [, d, h, min] = m;
  const total = (Number(d ?? 0) * 1440) + (Number(h ?? 0) * 60) + Number(min ?? 0);
  return total > 0 ? total : null;
}

function parseYield(value: JsonLdRecipe['recipeYield']): number {
  for (const candidate of asArray(value)) {
    const m = String(candidate).match(/\d+/);
    if (m) {
      const n = Number(m[0]);
      if (n > 0 && n <= 1000) return n;
    }
  }
  return 4;
}

function flattenInstructions(value: unknown, depth = 0): string[] {
  if (depth > 4) return [];
  if (typeof value === 'string') {
    // Some sites cram every step into one blob separated by newlines.
    return value.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) return value.flatMap((v) => flattenInstructions(v, depth + 1));
  if (value && typeof value === 'object') {
    const node = value as { '@type'?: string; text?: string; name?: string; itemListElement?: unknown };
    if (node.itemListElement) return flattenInstructions(node.itemListElement, depth + 1);
    const text = node.text ?? node.name;
    if (typeof text === 'string' && text.trim()) return [text.trim()];
  }
  return [];
}

function parseNutritionNumber(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const m = value.match(/[\d.,]+/);
  if (!m) return null;
  const n = Number(m[0].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function authorName(author: JsonLdRecipe['author']): string | null {
  for (const a of asArray(author)) {
    if (typeof a === 'string') return a;
    if (a && typeof a === 'object' && typeof a.name === 'string') return a.name;
  }
  return null;
}

export class JsonLdNotFoundError extends Error {
  constructor() {
    super('Auf dieser Seite wurden keine strukturierten Rezeptdaten gefunden.');
    this.name = 'JsonLdNotFoundError';
  }
}

export function extractRecipeFromHtml(html: string, url: string): RecipeDraft {
  const $ = cheerio.load(html);
  let node: JsonLdRecipe | null = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    if (node) return;
    const raw = $(el).contents().text();
    if (!raw.trim()) return;
    try {
      node = findRecipeNode(JSON.parse(raw));
    } catch {
      // A single malformed block must not abort the others.
    }
  });

  if (!node) throw new JsonLdNotFoundError();
  const recipe: JsonLdRecipe = node;

  const ingredientLines = recipe.recipeIngredient ?? recipe.ingredients ?? [];
  const nutrition = recipe.nutrition ?? {};

  return {
    title: recipe.name?.trim() || 'Importiertes Rezept',
    description: recipe.description?.trim() || null,
    baseServings: parseYield(recipe.recipeYield),
    prepMinutes: parseIsoDuration(recipe.prepTime),
    cookMinutes: parseIsoDuration(recipe.cookTime),
    restMinutes: null,
    sourceType: 'web',
    sourceUrl: url,
    sourceTitle: new URL(url).hostname.replace(/^www\./, ''),
    sourceAuthor: authorName(recipe.author),
    ingredients: ingredientLines
      .filter((line) => typeof line === 'string' && line.trim())
      .map((line) => {
        const parsed = parseIngredientLine(line);
        return {
          name: parsed.name || line.trim(),
          preparation: parsed.preparation,
          note: parsed.note,
          rawText: line.trim(),
          quantity: parsed.quantity,
        };
      }),
    steps: flattenInstructions(recipe.recipeInstructions).map((text) => ({ text })),
    tags: [
      ...asArray(recipe.recipeCategory),
      ...asArray(recipe.recipeCuisine),
      ...(typeof recipe.keywords === 'string'
        ? recipe.keywords.split(',')
        : asArray(recipe.keywords)),
    ].map((t) => String(t).trim()).filter(Boolean).slice(0, 12),
    nutrition: {
      kcal: parseNutritionNumber(nutrition.calories),
      protein: parseNutritionNumber(nutrition.proteinContent),
      carbs: parseNutritionNumber(nutrition.carbohydrateContent),
      fat: parseNutritionNumber(nutrition.fatContent),
      fiber: parseNutritionNumber(nutrition.fiberContent),
    },
  };
}

/** Strips scripts and markup so a fallback LLM pass sees only readable text. */
export function extractReadableText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, nav, header, footer, noscript, iframe, svg').remove();
  return $('body').text().replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 40_000);
}
