import type { CanonicalQuantity, Quantity, RoundingRule, ScalingPolicy } from '../units/types';
import type { GroceryCategory } from '../shopping/categories';

export type SourceType = 'own' | 'book' | 'web' | 'person' | 'photo' | 'ai' | 'other';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type PrecisionMode = 'kitchen' | 'exact';
export type ServingUnit = 'portion' | 'stueck' | 'scheibe' | 'glas' | 'liter';
export type MealSlot = 'fruehstueck' | 'mittag' | 'abend' | 'snack';

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  sortOrder: number;
  /** "Für den Teig", "Für die Sauce" — free text, rendered as a subheading. */
  groupLabel: string | null;

  name: string;
  preparation: string | null;
  note: string | null;
  /** The original line, kept so an import can always be audited against the source. */
  rawText: string | null;

  quantity: Quantity;
  canonical: CanonicalQuantity | null;
  scaling: ScalingPolicy;
  rounding: RoundingRule;

  category: GroceryCategory;
  optional: boolean;
  /** Pantry staples and "Wasser zum Kochen" do not belong on a shopping list. */
  excludeFromShoppingList: boolean;
}

export interface ScaledIngredient {
  source: RecipeIngredient;
  scaled: Quantity;
  /** Pre-rounding, so the UI can show "rechnerisch 4,5" beside "5 Eier". */
  exact: Quantity | null;
  display: string;
  didRound: boolean;
  didNotScale: boolean;
}

export interface RecipeStep {
  id: string;
  recipeId: string;
  sortOrder: number;
  groupLabel: string | null;
  text: string;
  /** Drives the inline timer in cooking mode. */
  durationMinutes: number | null;
  temperatureC: number | null;
  temperatureMode: 'ober_unterhitze' | 'umluft' | 'grill' | 'herd' | null;
  /** Ingredients used in this step; `portion` allows "die Hälfte der Butter". */
  ingredientRefs: Array<{ recipeIngredientId: string; portion: number }>;
}

export interface Nutrition {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  /** 'ai' values are estimates and are labelled as such in the UI. */
  source: 'ai' | 'manual';
}

export interface Tag {
  id: string;
  name: string;
  kind: 'kueche' | 'gang' | 'ernaehrung' | 'saison' | 'anlass' | 'frei';
}

export interface Photo {
  id: string;
  storageKey: string;
  thumbKey: string | null;
  caption: string | null;
}

export interface Recipe {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;

  baseServings: number;
  servingUnit: ServingUnit;
  /** "1 Springform 26 cm" — yield that a portion count cannot express. */
  yieldNote: string | null;

  prepMinutes: number | null;
  cookMinutes: number | null;
  restMinutes: number | null;
  totalMinutes: number | null;
  difficulty: Difficulty | null;
  /** 'exact' turns off nice-number rounding — for doughs, where hydration matters. */
  precisionMode: PrecisionMode;

  sourceType: SourceType;
  sourceTitle: string | null;
  sourceAuthor: string | null;
  sourceUrl: string | null;
  sourcePage: string | null;

  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  tags: Tag[];
  photos: Photo[];
  heroPhotoId: string | null;
  nutrition: Nutrition | null;

  /** What the importer was unsure about, until the cook marks it reviewed. */
  importReview: ImportReview | null;

  notes: string | null;
  rating: number | null;
  isFavorite: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export interface ImportReview {
  method: 'jsonld' | 'ai-text' | 'ai-photo' | 'parser';
  confidence: number | null;
  warnings: string[];
}

export interface ScaledRecipe extends Omit<Recipe, 'ingredients'> {
  targetServings: number;
  factor: number;
  ingredients: ScaledIngredient[];
  /** Per step id, the scaled ingredients that step consumes. */
  stepIngredients: Record<string, ScaledIngredient[]>;
  /** Per serving, unchanged by scaling — that is the point of "per serving". */
  nutritionPerServing: Nutrition | null;
}

/** A recipe that has been parsed but not yet saved — the shape both importers produce. */
export interface RecipeDraft {
  title: string;
  subtitle?: string | null;
  description?: string | null;
  baseServings: number;
  servingUnit?: ServingUnit;
  yieldNote?: string | null;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  restMinutes?: number | null;
  difficulty?: Difficulty | null;
  sourceType: SourceType;
  sourceTitle?: string | null;
  sourceAuthor?: string | null;
  sourceUrl?: string | null;
  sourcePage?: string | null;
  ingredients: Array<{
    groupLabel?: string | null;
    name: string;
    preparation?: string | null;
    note?: string | null;
    rawText?: string | null;
    quantity: Quantity;
    scaling?: ScalingPolicy;
    rounding?: RoundingRule;
    category?: GroceryCategory;
    optional?: boolean;
  }>;
  steps: Array<{
    groupLabel?: string | null;
    text: string;
    durationMinutes?: number | null;
    temperatureC?: number | null;
    temperatureMode?: 'ober_unterhitze' | 'umluft' | 'grill' | 'herd' | null;
    /** Indices into this draft's `ingredients`, for the per-step panel in
     *  cooking mode. Only an importer that knows which ingredient a step uses
     *  can fill these; the AI paths leave them empty. */
    ingredientIndices?: number[];
  }>;
  tags?: string[];
  nutrition?: Omit<Nutrition, 'source'> | null;
  notes?: string | null;
}
