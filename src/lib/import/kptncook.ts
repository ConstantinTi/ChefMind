import type { RecipeDraft } from '@/domain/recipe/types';
import type { Quantity } from '@/domain/units/types';
import type { GroceryCategory } from '@/domain/shopping/categories';
import { normalizeUnitToken } from '@/domain/units/parse';

/**
 * Imports a KptnCook recipe in full, through the app's own mobile API.
 *
 * Why this exists at all: the public share page (mobile.kptncook.com/recipe/…)
 * is a deliberate teaser. It publishes the title, the servings, the time and
 * every ingredient as schema.org microdata, then cuts the instructions off
 * after the third step and asks you to install the app. No parser can get past
 * that, because the remaining steps are simply not on the page.
 *
 * The mobile API returns the whole thing — all steps, per-step ingredient
 * links, nutrition, the cover image. The endpoint and the header set below are
 * what the Android app sends; they were documented by
 * https://github.com/gloriousDan/kptncook-api-reverse-engineering and are used
 * the same way by https://github.com/ephes/kptncook (MIT), the CLI that exports
 * KptnCook recipes to Mealie, Tandoor and Paprika.
 *
 * This is an undocumented API that KptnCook can change or close at any time.
 * When it does, the import falls back to the share page and the AI text path,
 * which still yields the ingredients and the first three steps.
 */

const API_BASE = 'https://mobile.kptncook.com';

/**
 * The app's API key. It is not a secret and never was: it ships inside the
 * Android package, and the kptncook CLI publishes it in its README and its
 * docker run example. It is a default rather than a hardcoded constant so that
 * a rotation can be fixed with an env var instead of a deploy.
 */
const DEFAULT_API_KEY = '6q7QNKy-oIgk-IMuWisJ-jfN7s6';

export function kptnCookApiKey(): string {
  return process.env.CHEFMIND_KPTNCOOK_API_KEY?.trim() || DEFAULT_API_KEY;
}

function language(): string {
  return process.env.CHEFMIND_KPTNCOOK_LANG?.trim() || 'de';
}

export class KptnCookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KptnCookError';
  }
}

// ── Link → recipe id ────────────────────────────────────────────────────────

export type KptnCookId = { kind: 'uid'; value: string } | { kind: 'oid'; value: string };

const UID_RE = /^[a-z0-9]{7,8}$/i;
const OID_RE = /^[a-f0-9]{24}$/i;

export function isKptnCookUrl(value: string): boolean {
  try {
    return /(^|\.)kptncook\.com$/i.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

/**
 * Pulls the recipe id out of a share link, or accepts a bare id.
 *
 * Share links look like `/recipe/pinterest/<slug>/<uid>?lang=de`, so the id is
 * the LAST path segment. Scanning left to right the way the reference CLI does
 * is wrong for short slugs — "Frittata" is eight alphanumerics and would win
 * over the real uid that follows it.
 */
export function parseKptnCookId(input: string): KptnCookId | null {
  const raw = input.trim();
  if (!raw) return null;

  let segments: string[];
  try {
    const url = new URL(raw);
    // A path segment on some other site is not a KptnCook id, however much it
    // looks like one — "…/rezepte/123/Lasagne.html" would otherwise yield
    // "rezepte" and send us off to fetch a recipe that does not exist.
    if (!isKptnCookUrl(raw)) return null;
    segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    segments = raw.split(/[/?#]/).filter(Boolean);
  }
  if (!segments.length) return null;

  for (const segment of [...segments].reverse()) {
    if (OID_RE.test(segment)) return { kind: 'oid', value: segment };
    if (UID_RE.test(segment)) return { kind: 'uid', value: segment };
  }
  return null;
}

/** The canonical, shareable link for a recipe — what we store as sourceUrl. */
export function kptnCookShareUrl(id: KptnCookId, slug: string): string {
  const safe = slug.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'rezept';
  return `${API_BASE}/recipe/pinterest/${encodeURIComponent(safe)}/${id.value}?lang=${language()}`;
}

// ── The bits of the API response we read ────────────────────────────────────

/**
 * A translatable field. With `lang=de` the live API sends a plain German
 * string; older responses (and the odd field still) send a map of language
 * codes, sometimes wrapped in a `{singular, plural, uncountable}` trio. Every
 * reader goes through `localized()`, which copes with all three.
 */
type Localized = string | Record<string, unknown>;

interface RawIngredientDetails {
  _id?: { $oid?: string };
  typ?: string;
  category?: string;
  title?: Localized;
  localizedTitle?: Localized;
  numberTitle?: Localized;
  uncountableTitle?: Localized;
}

interface RawIngredient {
  quantity?: number | null;
  measure?: string | null;
  ingredient?: RawIngredientDetails;
}

interface RawStep {
  title?: Localized;
  text?: Localized;
  timers?: Array<{ minOrExact?: number | null; max?: number | null }> | null;
  ingredients?: Array<{ ingredientId?: string | null } | null> | null;
}

export interface RawKptnCookRecipe {
  _id?: { $oid?: string };
  uid?: string;
  title?: Localized;
  localizedTitle?: Localized;
  authorComment?: Localized;
  preparationTime?: number | null;
  cookingTime?: number | null;
  fixedPortionCount?: number | null;
  recipeNutrition?: {
    calories?: number; protein?: number; fat?: number;
    carbohydrate?: number; fiber?: number;
  };
  activeTags?: string[] | null;
  authors?: Array<{ name?: string | null }> | null;
  imageList?: Array<{ type?: string | null; url?: string | null }> | null;
  ingredients?: RawIngredient[];
  steps?: RawStep[];
}

/**
 * Picks the German text out of a translatable field, whatever shape it arrives in.
 *
 * Three shapes are in circulation and one recipe can mix them: a plain German
 * string (what `lang=de` returns today), a map of language codes (what older
 * responses returned, and what the 2022-era captures in the wild still show),
 * and a `{singular, plural, uncountable}` trio whose members are either of the
 * first two. Reading only one of them is how every imported recipe ended up
 * called "KptnCook-Rezept".
 */
function localized(value: unknown, form: 'singular' | 'plural' | null = null): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (!value || typeof value !== 'object') return null;
  const node = value as Record<string, unknown>;

  if (form && node[form]) return localized(node[form]);
  if (node.singular || node.plural || node.uncountable) {
    return localized(node.singular ?? node.plural ?? node.uncountable);
  }

  for (const lang of [language(), 'de', 'en', 'es', 'fr', 'pt']) {
    const candidate = node[lang];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

// ── Mapping ─────────────────────────────────────────────────────────────────

/**
 * KptnCook's own portion basis. Its API stores every amount for a SINGLE
 * portion, while the app and the share page present the recipe for two — the
 * share page for the fixture recipe lists exactly twice what the API returns
 * (40 g Erbsen become 80 g, 100 g Lachs become 200 g, and so on). We therefore
 * multiply by the portion count and store that count as the base, so the recipe
 * in ChefMind reads exactly as it does in the app and can be checked against it.
 */
const DEFAULT_PORTIONS = 2;

/** The canned mise-en-place step KptnCook prepends to every single recipe. */
const PREP_STEP_TITLES = new Set([
  'all set?', 'alles parat?', '¿todo listo?', 'vous avez tout ?', 'tudo pronto?',
]);

/** KptnCook's ingredient aisles → ours. Anything unlisted falls back to the
 *  name-keyword categorizer, which is why this map may stay incomplete. */
const CATEGORY_MAP: Readonly<Record<string, GroceryCategory>> = {
  fruitvegetables: 'produce',
  vegetables: 'produce',
  fruits: 'produce',
  herbs: 'produce',
  frozen: 'frozen',
  dairyeggs: 'dairy_eggs',
  dairy: 'dairy_eggs',
  cheese: 'dairy_eggs',
  fishseafood: 'meat_fish',
  meat: 'meat_fish',
  meatfish: 'meat_fish',
  meatsausages: 'meat_fish',
  pasta: 'dry_goods_baking',
  grains: 'dry_goods_baking',
  rice: 'dry_goods_baking',
  baking: 'dry_goods_baking',
  nutsseeds: 'dry_goods_baking',
  cerealsspreads: 'dry_goods_baking',
  oilsvinegars: 'spices_sauces',
  spicesseasoning: 'spices_sauces',
  condiments: 'spices_sauces',
  sauces: 'spices_sauces',
  bakery: 'bakery',
  bread: 'bakery',
  canned: 'canned_jarred',
  cannedgoods: 'canned_jarred',
  preserves: 'canned_jarred',
  drinks: 'drinks',
  beverages: 'drinks',
  alcohol: 'drinks',
};

/** Only the tags that mean something to a cook. `main_ingredient_*` and the
 *  internal editorial keys are noise on a recipe card and are dropped. */
const TAG_MAP: Readonly<Record<string, string>> = {
  diet_vegetarian: 'vegetarisch',
  diet_vegan: 'vegan',
  diet_pescetarian: 'pescetarisch',
  diet_high_protein: 'proteinreich',
  diet_low_carb: 'Low Carb',
  diet_gluten_free: 'glutenfrei',
  diet_lactose_free: 'laktosefrei',
  main_dish: 'Hauptgericht',
  side_dish: 'Beilage',
  dessert: 'Dessert',
  breakfast: 'Frühstück',
  snack: 'Snack',
  soup: 'Suppe',
  salad: 'Salat',
  baked: 'Auflauf & Ofen',
  quick: 'Schnell',
  one_pot: 'One Pot',
  meal_prep: 'Meal Prep',
};

function mapCategory(value: string | undefined): GroceryCategory | undefined {
  if (!value) return undefined;
  return CATEGORY_MAP[value.toLowerCase().replace(/[^a-z]/g, '')];
}

/** "Zehe(n)" → "zehe", "EL" → "el". The API pluralizes units in brackets. */
function measureToUnit(measure: string | null | undefined) {
  if (!measure) return null;
  return normalizeUnitToken(measure.replace(/\([^)]*\)/g, '').trim());
}

/** Rounds away the float noise that multiplying 0.5 by a portion count leaves. */
function tidy(amount: number): number {
  return Math.round(amount * 1000) / 1000;
}

function ingredientName(raw: RawIngredient, amount: number | null): string | null {
  const details = raw.ingredient;
  if (!details) return null;
  const plural = amount === null ? false : amount !== 1;
  return localized(details.numberTitle, plural ? 'plural' : 'singular')
    ?? localized(details.uncountableTitle)
    ?? localized(details.title)
    ?? localized(details.localizedTitle);
}

/** "Erbsen, tiefgefroren" → name "Erbsen", preparation "tiefgefroren".
 *  KptnCook puts the state after a comma, exactly where ChefMind wants it. */
function splitName(full: string): { name: string; preparation: string | null } {
  const comma = full.indexOf(',');
  if (comma <= 0) return { name: full, preparation: null };
  const name = full.slice(0, comma).trim();
  const preparation = full.slice(comma + 1).trim();
  return name && preparation ? { name, preparation } : { name: full, preparation: null };
}

const TIMER_PLACEHOLDER = /<timer>/g;

type OvenMode = 'ober_unterhitze' | 'umluft' | 'grill';

/** A temperature plus, optionally, the bracketed oven mode right behind it.
 *  `\s` covers the narrow no-break space (U+202F) the API puts before °C. */
const TEMPERATURE = /(\d{2,3})\s*(?:°\s*C|Grad)\s*(?:\(([^)]{0,60})\))?/gi;
const FAN_OVEN = /umluft|hei[ßss]luft/i;
const TOP_BOTTOM = /ober-?\s*(?:\/|und|u\.)?\s*-?\s*unterhitze/i;
const GRILL = /\bgrillfunktion\b|\bgrillstufe\b/i;

function ovenMode(text: string): OvenMode | null {
  if (FAN_OVEN.test(text)) return 'umluft';
  if (GRILL.test(text)) return 'grill';
  if (TOP_BOTTOM.test(text)) return 'ober_unterhitze';
  return null;
}

/**
 * Reads the oven setting out of a step.
 *
 * A step routinely offers both settings at once — "180 °C (Ober- und
 * Unterhitze, empfohlen) oder 160 °C (Umluft)". Scanning the whole sentence for
 * a mode pairs the FIRST temperature with the LAST mode mentioned, which had
 * the frittata preheating to 180 °C on fan. So each temperature is matched
 * together with its own bracket, and only a temperature without one falls back
 * to the surrounding text.
 */
function readOven(text: string): { celsius: number | null; mode: OvenMode | null } {
  TEMPERATURE.lastIndex = 0;
  const first = TEMPERATURE.exec(text);
  if (!first) return { celsius: null, mode: null };
  const celsius = Number(first[1]);
  const bracket = first[2];
  return { celsius, mode: (bracket ? ovenMode(bracket) : null) ?? ovenMode(text) };
}

function stepText(step: RawStep): string {
  const raw = localized(step.title) ?? localized(step.text) ?? '';
  const timers = step.timers ?? [];
  let index = 0;
  return raw.replace(TIMER_PLACEHOLDER, () => {
    const timer = timers[index];
    index += 1;
    if (!timer) return '';
    if (timer.minOrExact != null && timer.max != null && timer.max !== timer.minOrExact) {
      return `${timer.minOrExact}–${timer.max} Min.`;
    }
    const single = timer.minOrExact ?? timer.max;
    return single == null ? '' : `${single} Min.`;
  }).replace(/\s{2,}/g, ' ').trim();
}

export interface KptnCookDraft {
  draft: RecipeDraft;
  /** The cover image. The key is appended because the CDN the older responses
   *  pointed at required it; images.kptncook.com ignores it and serves the same
   *  bytes either way, so it costs nothing to keep for the older hosts. */
  imageUrl: string | null;
  warnings: string[];
}

export function kptnCookToDraft(raw: RawKptnCookRecipe): KptnCookDraft {
  const warnings: string[] = [];

  const title = localized(raw.title) ?? localized(raw.localizedTitle) ?? 'KptnCook-Rezept';
  const baseServings = raw.fixedPortionCount && raw.fixedPortionCount > 0
    ? raw.fixedPortionCount
    : DEFAULT_PORTIONS;

  // Regular ingredients first, pantry staples under their own heading — the
  // order and the grouping the app itself uses.
  const rawIngredients = [...(raw.ingredients ?? [])].sort((a, b) => {
    const rank = (i: RawIngredient) => (i.ingredient?.typ === 'basic' ? 1 : 0);
    return rank(a) - rank(b);
  });

  /** ingredient oid -> index in the draft, for the per-step links below. */
  const indexByOid = new Map<string, number>();
  const ingredients: RecipeDraft['ingredients'] = [];

  for (const item of rawIngredients) {
    const amount = typeof item.quantity === 'number' && Number.isFinite(item.quantity)
      ? tidy(item.quantity * baseServings)
      : null;
    const full = ingredientName(item, amount);
    if (!full) continue;

    const { name, preparation } = splitName(full);
    const unit = measureToUnit(item.measure);
    const isBasic = item.ingredient?.typ === 'basic';

    const quantity: Quantity = amount === null
      // Salt and pepper arrive with no amount at all; that is "nach Geschmack",
      // not "we forgot" — and it keeps them off the shopping list arithmetic.
      ? (isBasic ? { kind: 'toTaste' } : { kind: 'unquantified' })
      : { kind: 'exact', amount, unit };

    const oid = item.ingredient?._id?.$oid;
    if (oid) indexByOid.set(oid, ingredients.length);

    ingredients.push({
      groupLabel: isBasic ? 'Grundzutaten' : null,
      name,
      preparation,
      note: null,
      // The line as KptnCook would print it, kept so the import stays auditable
      // against the share page even after the name has been split up.
      rawText: [amount, item.measure?.trim(), full].filter(Boolean).join(' '),
      quantity,
      category: mapCategory(item.ingredient?.category),
    });
  }

  const steps: RecipeDraft['steps'] = [];
  for (const step of raw.steps ?? []) {
    const text = stepText(step);
    if (!text) continue;
    if (PREP_STEP_TITLES.has(text.replace(/ /g, ' ').toLowerCase())) continue;

    const firstTimer = step.timers?.[0];
    const duration = firstTimer?.minOrExact ?? firstTimer?.max ?? null;

    const { celsius: temperatureC, mode: temperatureMode } = readOven(text);

    const ingredientIndices = (step.ingredients ?? [])
      .map((link) => (link?.ingredientId ? indexByOid.get(link.ingredientId) : undefined))
      .filter((i): i is number => i !== undefined);

    steps.push({
      text,
      durationMinutes: duration && duration > 0 ? duration : null,
      temperatureC,
      temperatureMode,
      ingredientIndices: ingredientIndices.length ? [...new Set(ingredientIndices)] : undefined,
    });
  }

  if (!steps.length) warnings.push('Die Antwort enthielt keine Arbeitsschritte.');
  if (!ingredients.length) warnings.push('Die Antwort enthielt keine Zutaten.');

  const nutrition = raw.recipeNutrition ?? {};
  const cover = (raw.imageList ?? []).find((i) => i?.type === 'cover')?.url
    ?? (raw.imageList ?? []).find((i) => i?.url)?.url
    ?? null;

  const id: KptnCookId | null = raw.uid
    ? { kind: 'uid', value: raw.uid }
    : (raw._id?.$oid ? { kind: 'oid', value: raw._id.$oid } : null);

  const tags = ['KptnCook'];
  for (const tag of raw.activeTags ?? []) {
    const mapped = TAG_MAP[tag];
    if (mapped && !tags.includes(mapped)) tags.push(mapped);
  }

  const draft: RecipeDraft = {
    title,
    description: localized(raw.authorComment),
    baseServings,
    servingUnit: 'portion',
    prepMinutes: raw.preparationTime ?? null,
    cookMinutes: raw.cookingTime ?? null,
    restMinutes: null,
    sourceType: 'web',
    sourceTitle: 'KptnCook',
    sourceAuthor: raw.authors?.find((a) => a?.name)?.name ?? null,
    sourceUrl: id ? kptnCookShareUrl(id, title) : null,
    ingredients,
    steps,
    tags,
    nutrition: {
      // Already per portion in the API, which is also how ChefMind stores it.
      kcal: nutrition.calories ?? null,
      protein: nutrition.protein ?? null,
      carbs: nutrition.carbohydrate ?? null,
      fat: nutrition.fat ?? null,
      fiber: nutrition.fiber ?? null,
    },
  };

  return {
    draft,
    imageUrl: cover ? `${cover}?kptnkey=${encodeURIComponent(kptnCookApiKey())}` : null,
    warnings,
  };
}

// ── The call itself ─────────────────────────────────────────────────────────

/** The header set the Android app sends. The API answers 403 without them. */
function headers(): Record<string, string> {
  return {
    'content-type': 'application/json',
    Accept: 'application/vnd.kptncook.mobile-v8+json',
    'User-Agent': 'Platform/Android/12.0.1 App/7.10.1',
    hasIngredients: 'yes',
  };
}

export async function fetchKptnCookRecipe(id: KptnCookId): Promise<RawKptnCookRecipe> {
  const query = new URLSearchParams({ kptnkey: kptnCookApiKey(), lang: language() });
  const body = [id.kind === 'uid' ? { uid: id.value } : { identifier: id.value }];

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/recipes/search?${query}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const why = error instanceof Error ? error.message : 'unbekannter Fehler';
    throw new KptnCookError(`Die KptnCook-Schnittstelle war nicht erreichbar (${why}).`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new KptnCookError(
      'KptnCook hat den API-Schlüssel abgelehnt. Er lässt sich über '
      + 'CHEFMIND_KPTNCOOK_API_KEY setzen.',
    );
  }
  if (!response.ok) {
    throw new KptnCookError(`KptnCook antwortete mit HTTP ${response.status}.`);
  }

  const payload: unknown = await response.json().catch(() => null);
  const list = Array.isArray(payload) ? payload : [];
  const recipe = list.find((item): item is RawKptnCookRecipe => !!item && typeof item === 'object');
  if (!recipe) {
    // Naming the id matters: the usual cause is that the wrong part of the link
    // was read as the id, and without it in the message there is nothing to
    // check the link against.
    throw new KptnCookError(
      `KptnCook kennt die Kennung „${id.value}" nicht. Entweder wurde sie falsch `
      + 'aus dem Link gelesen, oder das Rezept ist nicht mehr abrufbar.',
    );
  }
  return recipe;
}
