import { sqliteTable, text, integer, real, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { ulid } from 'ulid';
import { UNIT_IDS } from '@/domain/units/units';
import { GROCERY_CATEGORIES } from '@/domain/shopping/categories';

/**
 * Text ULID primary keys rather than integer rowids.
 *
 * These ids are handed to a language model through the MCP tools. Stable opaque
 * strings are far harder to hallucinate or do arithmetic on than small integers,
 * and at a few thousand recipes the storage cost is irrelevant.
 */
const id = () => text('id').primaryKey().$defaultFn(() => ulid());
const ts = (name: string) => integer(name, { mode: 'timestamp' });
const now = () => new Date();

export const QUANTITY_KINDS = ['exact', 'range', 'approx', 'toTaste', 'unquantified'] as const;
export const SCALING_MODES = ['linear', 'fixed', 'sublinear', 'stepped'] as const;
export const ROUNDING_RULES = ['none', 'integer', 'ceilInteger', 'fraction', 'nice'] as const;
export const DIMENSIONS = ['mass', 'volume', 'count', 'none'] as const;
export const SOURCE_TYPES = ['own', 'book', 'web', 'person', 'photo', 'ai', 'other'] as const;
export const MEAL_SLOTS = ['fruehstueck', 'mittag', 'abend', 'snack'] as const;
export const IMPORT_METHODS = ['jsonld', 'ai-text', 'ai-photo', 'parser'] as const;

export const recipes = sqliteTable('recipes', {
  id: id(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  description: text('description'),

  baseServings: real('base_servings').notNull().default(4),
  servingUnit: text('serving_unit', { enum: ['portion', 'stueck', 'scheibe', 'glas', 'liter'] })
    .notNull().default('portion'),
  yieldNote: text('yield_note'),

  prepMinutes: integer('prep_minutes'),
  cookMinutes: integer('cook_minutes'),
  restMinutes: integer('rest_minutes'),
  /** Derived on write so list views can sort by time without summing three columns. */
  totalMinutes: integer('total_minutes'),
  difficulty: text('difficulty', { enum: ['easy', 'medium', 'hard'] }),
  /** 'exact' disables nice-number rounding — for doughs, where hydration matters. */
  precisionMode: text('precision_mode', { enum: ['kitchen', 'exact'] }).notNull().default('kitchen'),

  sourceType: text('source_type', { enum: SOURCE_TYPES }).notNull().default('own'),
  sourceTitle: text('source_title'),
  sourceAuthor: text('source_author'),
  sourceUrl: text('source_url'),
  sourcePage: text('source_page'),

  heroPhotoId: text('hero_photo_id'),

  // Nutrition is 1:1 and optional, so it lives here rather than in a join table
  // that would be null-or-one row and one more query on every recipe read.
  // Values are per BASE serving; 'ai' ones are estimates and labelled in the UI.
  nutritionKcal: real('nutrition_kcal'),
  nutritionProtein: real('nutrition_protein'),
  nutritionCarbs: real('nutrition_carbs'),
  nutritionFat: real('nutrition_fat'),
  nutritionFiber: real('nutrition_fiber'),
  nutritionSource: text('nutrition_source', { enum: ['ai', 'manual'] }),

  // What an import was unsure about, kept until the cook has looked at it.
  // These used to be shown once on the import screen and then thrown away,
  // which meant "Menge für Basilikum geraten" was never read by anyone.
  importMethod: text('import_method', { enum: IMPORT_METHODS }),
  importConfidence: real('import_confidence'),
  importWarnings: text('import_warnings', { mode: 'json' }).$type<string[]>(),
  importReviewedAt: ts('import_reviewed_at'),

  notes: text('notes'),
  rating: integer('rating'),
  isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
  archivedAt: ts('archived_at'),

  createdAt: ts('created_at').notNull().$defaultFn(now),
  updatedAt: ts('updated_at').notNull().$defaultFn(now),
}, (t) => [
  uniqueIndex('recipes_slug_idx').on(t.slug),
  index('recipes_total_minutes_idx').on(t.totalMinutes),
  index('recipes_title_idx').on(t.title),
]);

export const recipeIngredients = sqliteTable('recipe_ingredients', {
  id: id(),
  recipeId: text('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  groupLabel: text('group_label'),

  name: text('name').notNull(),
  /** Lowercased, de-umlauted merge key — the shopping list groups on this. */
  nameNormalized: text('name_normalized').notNull(),
  preparation: text('preparation'),
  note: text('note'),
  /** The original line, so an import can always be audited against its source. */
  rawText: text('raw_text'),

  // Layer 1 — as the cook typed it. This is the display truth.
  quantityKind: text('quantity_kind', { enum: QUANTITY_KINDS }).notNull(),
  amountMin: real('amount_min'),
  amountMax: real('amount_max'),
  unit: text('unit', { enum: UNIT_IDS }),

  // Layer 2 — canonical (g / ml / pieces). Derived on write, never at read time,
  // so aggregating 20 recipes is a single pass with no unit-table lookups.
  dimension: text('dimension', { enum: DIMENSIONS }).notNull().default('none'),
  baseMin: real('base_min'),
  baseMax: real('base_max'),

  // Layer 3 — how it behaves when the recipe is rescaled.
  scalingMode: text('scaling_mode', { enum: SCALING_MODES }).notNull().default('linear'),
  scalingExponent: real('scaling_exponent'),
  scalingStep: real('scaling_step'),
  scalingMin: real('scaling_min'),
  scalingMax: real('scaling_max'),

  // Layer 4 — how it should be rendered.
  rounding: text('rounding', { enum: ROUNDING_RULES }).notNull().default('nice'),

  category: text('category', { enum: GROCERY_CATEGORIES }).notNull().default('other'),
  optional: integer('optional', { mode: 'boolean' }).notNull().default(false),
  excludeFromShoppingList: integer('exclude_from_shopping_list', { mode: 'boolean' })
    .notNull().default(false),
}, (t) => [
  index('recipe_ingredients_recipe_idx').on(t.recipeId, t.sortOrder),
  index('recipe_ingredients_name_idx').on(t.nameNormalized),
]);

export const recipeSteps = sqliteTable('recipe_steps', {
  id: id(),
  recipeId: text('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  groupLabel: text('group_label'),
  text: text('text').notNull(),
  durationMinutes: integer('duration_minutes'),
  temperatureC: integer('temperature_c'),
  temperatureMode: text('temperature_mode', {
    enum: ['ober_unterhitze', 'umluft', 'grill', 'herd'],
  }),
}, (t) => [index('recipe_steps_recipe_idx').on(t.recipeId, t.sortOrder)]);

/** Which ingredients a step uses. `portion` allows "die Hälfte der Butter". */
export const stepIngredients = sqliteTable('step_ingredients', {
  stepId: text('step_id').notNull().references(() => recipeSteps.id, { onDelete: 'cascade' }),
  recipeIngredientId: text('recipe_ingredient_id').notNull()
    .references(() => recipeIngredients.id, { onDelete: 'cascade' }),
  portion: real('portion').notNull().default(1),
}, (t) => [primaryKey({ columns: [t.stepId, t.recipeIngredientId] })]);

export const tags = sqliteTable('tags', {
  id: id(),
  name: text('name').notNull(),
  nameNormalized: text('name_normalized').notNull(),
  kind: text('kind', { enum: ['kueche', 'gang', 'ernaehrung', 'saison', 'anlass', 'frei'] })
    .notNull().default('frei'),
}, (t) => [uniqueIndex('tags_name_norm_idx').on(t.nameNormalized)]);

export const recipeTags = sqliteTable('recipe_tags', {
  recipeId: text('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.recipeId, t.tagId] })]);

export const photos = sqliteTable('photos', {
  id: id(),
  recipeId: text('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  /** Path relative to CHEFMIND_UPLOAD_DIR — never inside public/, which is
   *  rebuilt into the image and would wipe your photos on every deploy. */
  storageKey: text('storage_key').notNull(),
  thumbKey: text('thumb_key'),
  width: integer('width'),
  height: integer('height'),
  caption: text('caption'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: ts('created_at').notNull().$defaultFn(now),
}, (t) => [index('photos_recipe_idx').on(t.recipeId, t.sortOrder)]);

export const mealPlanEntries = sqliteTable('meal_plan_entries', {
  id: id(),
  /** ISO yyyy-mm-dd — sorts lexically, no timezone ambiguity. */
  date: text('date').notNull(),
  slot: text('slot', { enum: MEAL_SLOTS }).notNull(),
  recipeId: text('recipe_id').references(() => recipes.id, { onDelete: 'cascade' }),
  /** For "Reste" or "Essen gehen" — plan entries without a recipe. */
  freeText: text('free_text'),
  servings: real('servings'),
  note: text('note'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: ts('created_at').notNull().$defaultFn(now),
}, (t) => [index('meal_plan_date_idx').on(t.date, t.slot)]);

export const shoppingLists = sqliteTable('shopping_lists', {
  id: id(),
  name: text('name').notNull(),
  createdAt: ts('created_at').notNull().$defaultFn(now),
  completedAt: ts('completed_at'),
});

/** Provenance, so a list can be regenerated after a portion count changes. */
export const shoppingListSources = sqliteTable('shopping_list_sources', {
  id: id(),
  listId: text('list_id').notNull().references(() => shoppingLists.id, { onDelete: 'cascade' }),
  recipeId: text('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  servings: real('servings').notNull(),
}, (t) => [index('shopping_list_sources_list_idx').on(t.listId)]);

export const shoppingListItems = sqliteTable('shopping_list_items', {
  id: id(),
  listId: text('list_id').notNull().references(() => shoppingLists.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  nameNormalized: text('name_normalized').notNull(),
  category: text('category', { enum: GROCERY_CATEGORIES }).notNull().default('other'),
  /** Rendered amount, e.g. "700 g" or "1 Prise + nach Geschmack". */
  display: text('display').notNull().default(''),
  dimension: text('dimension', { enum: DIMENSIONS }).notNull().default('none'),
  amountMin: real('amount_min'),
  amountMax: real('amount_max'),
  unit: text('unit', { enum: UNIT_IDS }),
  /** Which recipes contributed to this line. */
  sources: text('sources', { mode: 'json' }).$type<Array<{ recipeId: string; recipeTitle: string; originalDisplay: string }>>(),
  isManual: integer('is_manual', { mode: 'boolean' }).notNull().default(false),
  checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [index('shopping_list_items_list_idx').on(t.listId, t.category, t.sortOrder)]);

// ── Relations ────────────────────────────────────────────────────────────────

export const recipesRelations = relations(recipes, ({ many }) => ({
  ingredients: many(recipeIngredients),
  steps: many(recipeSteps),
  photos: many(photos),
  recipeTags: many(recipeTags),
}));

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one, many }) => ({
  recipe: one(recipes, { fields: [recipeIngredients.recipeId], references: [recipes.id] }),
  stepLinks: many(stepIngredients),
}));

export const recipeStepsRelations = relations(recipeSteps, ({ one, many }) => ({
  recipe: one(recipes, { fields: [recipeSteps.recipeId], references: [recipes.id] }),
  ingredientLinks: many(stepIngredients),
}));

export const stepIngredientsRelations = relations(stepIngredients, ({ one }) => ({
  step: one(recipeSteps, { fields: [stepIngredients.stepId], references: [recipeSteps.id] }),
  ingredient: one(recipeIngredients, {
    fields: [stepIngredients.recipeIngredientId], references: [recipeIngredients.id],
  }),
}));

export const recipeTagsRelations = relations(recipeTags, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeTags.recipeId], references: [recipes.id] }),
  tag: one(tags, { fields: [recipeTags.tagId], references: [tags.id] }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({ recipeTags: many(recipeTags) }));

export const photosRelations = relations(photos, ({ one }) => ({
  recipe: one(recipes, { fields: [photos.recipeId], references: [recipes.id] }),
}));

export const mealPlanEntriesRelations = relations(mealPlanEntries, ({ one }) => ({
  recipe: one(recipes, { fields: [mealPlanEntries.recipeId], references: [recipes.id] }),
}));

export const shoppingListsRelations = relations(shoppingLists, ({ many }) => ({
  items: many(shoppingListItems),
  sources: many(shoppingListSources),
}));

export const shoppingListItemsRelations = relations(shoppingListItems, ({ one }) => ({
  list: one(shoppingLists, { fields: [shoppingListItems.listId], references: [shoppingLists.id] }),
}));

export const shoppingListSourcesRelations = relations(shoppingListSources, ({ one }) => ({
  list: one(shoppingLists, { fields: [shoppingListSources.listId], references: [shoppingLists.id] }),
  recipe: one(recipes, { fields: [shoppingListSources.recipeId], references: [recipes.id] }),
}));
