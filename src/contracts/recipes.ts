import { z } from 'zod';
import { RecipeInputSchema } from './common';

export const ListRecipesInput = z.object({
  query: z.string().max(200).optional().describe('Freitextsuche über Titel, Beschreibung und Zutaten.'),
  tags: z.array(z.string()).optional().describe('Nur Rezepte mit allen diesen Tags.'),
  maxTotalMinutes: z.number().int().positive().optional().describe('Höchstens so lange Gesamtzeit.'),
  favoritesOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().nonnegative().default(0),
});

export const GetRecipeInput = z.object({
  idOrSlug: z.string().min(1).describe('Rezept-ID (ULID) oder Slug.'),
  servings: z.number().positive().max(1000).optional()
    .describe('Wenn gesetzt, werden alle Mengen auf diese Portionszahl umgerechnet.'),
});

export const CreateRecipeInput = RecipeInputSchema;

export const UpdateRecipeInput = z.object({
  id: z.string().min(1),
  patch: RecipeInputSchema.partial(),
});

export const DeleteRecipeInput = z.object({ id: z.string().min(1) });

export const ScaleRecipeInput = z.object({
  idOrSlug: z.string().min(1),
  servings: z.number().positive().max(1000),
});

export const SuggestRecipesInput = z.object({
  haveIngredients: z.array(z.string()).default([])
    .describe('Zutaten, die vorhanden sind — Rezepte werden nach Übereinstimmung sortiert.'),
  maxTotalMinutes: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

export const ImportFromUrlInput = z.object({
  url: z.string().url().describe('Adresse einer Rezeptseite.'),
  save: z.boolean().default(false)
    .describe('false = nur Entwurf zurückgeben (Standard), true = direkt speichern.'),
});

export const ImportFromTextInput = z.object({
  text: z.string().min(10).max(50_000).describe('Rezepttext, z. B. aus der Zwischenablage.'),
  title: z.string().max(200).optional(),
  save: z.boolean().default(false),
});

export const RecipeSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  description: z.string().nullable(),
  baseServings: z.number(),
  totalMinutes: z.number().nullable(),
  difficulty: z.string().nullable(),
  tags: z.array(z.string()),
  isFavorite: z.boolean(),
  rating: z.number().nullable(),
  heroPhotoId: z.string().nullable(),
  sourceType: z.string(),
});

export const ListRecipesOutput = z.object({
  recipes: z.array(RecipeSummarySchema),
  total: z.number(),
});

export type ListRecipesArgs = z.infer<typeof ListRecipesInput>;
export type GetRecipeArgs = z.infer<typeof GetRecipeInput>;
export type CreateRecipeArgs = z.infer<typeof CreateRecipeInput>;
export type UpdateRecipeArgs = z.infer<typeof UpdateRecipeInput>;
export type SuggestRecipesArgs = z.infer<typeof SuggestRecipesInput>;
