import { describe, expect, it } from 'vitest';
import {
  isKptnCookUrl, kptnCookToDraft, parseKptnCookId, type RawKptnCookRecipe,
} from './kptncook';
import { RecipeInputSchema } from '@/contracts/common';
import fixture from './fixtures/kptncook-recipe.json';

/**
 * The fixture is a real, recorded `/recipes/search` response for
 * "Überbackene Muschelnudeln mit Lachs & Senf-Dill-Sauce" (uid 6c8c648e), taken
 * from the test fixtures of https://github.com/ephes/kptncook (MIT) with the
 * retailer and product price lists stripped out.
 *
 * The expected amounts below are not guesses: they are what the public share
 * page for that same uid prints ("80 g Erbsen, tiefgefroren", "200 g
 * Lachsfilets, tiefgefroren", "1 Zehe(n) Knoblauch"). That comparison is what
 * established that the API stores amounts per SINGLE portion while the app
 * presents the recipe for two — so if anyone ever "simplifies" the doubling
 * away, these numbers catch it.
 */

const [raw] = fixture as RawKptnCookRecipe[];
if (!raw) throw new Error('Fixture ist leer.');

describe('parseKptnCookId', () => {
  it('reads the uid from a share link', () => {
    expect(parseKptnCookId(
      'https://mobile.kptncook.com/recipe/pinterest/schnelle-frittata-mit-paprika/4cb17656?lang=de',
    )).toEqual({ kind: 'uid', value: '4cb17656' });
  });

  it('ignores an eight-character slug in favour of the trailing uid', () => {
    // "Frittata" is eight alphanumerics; scanning left to right would take it.
    expect(parseKptnCookId(
      'https://mobile.kptncook.com/recipe/pinterest/Frittata/4cb17656',
    )).toEqual({ kind: 'uid', value: '4cb17656' });
  });

  it('survives the branch.io tracking parameters a shared link carries', () => {
    expect(parseKptnCookId(
      'https://mobile.kptncook.com/recipe/pinterest/Rote-Pasta/19e2eda2'
      + '?_branch_match_id=866187386318966341&utm_source=SMS&utm_medium=sharing',
    )).toEqual({ kind: 'uid', value: '19e2eda2' });
  });

  it('recognises a 24-character object id', () => {
    expect(parseKptnCookId('5aa2cbb028000052091b5c6c'))
      .toEqual({ kind: 'oid', value: '5aa2cbb028000052091b5c6c' });
  });

  it('returns null for anything else', () => {
    expect(parseKptnCookId('')).toBeNull();
    expect(parseKptnCookId('https://www.chefkoch.de/rezepte/123/Lasagne.html')).toBeNull();
  });
});

describe('isKptnCookUrl', () => {
  it('matches the mobile host and the bare domain', () => {
    expect(isKptnCookUrl('https://mobile.kptncook.com/recipe/pinterest/x/4cb17656')).toBe(true);
    expect(isKptnCookUrl('https://kptncook.com/de')).toBe(true);
  });

  it('does not match a lookalike host', () => {
    expect(isKptnCookUrl('https://kptncook.com.evil.example/x')).toBe(false);
    expect(isKptnCookUrl('nonsense')).toBe(false);
  });
});

describe('kptnCookToDraft', () => {
  const { draft, imageUrl, warnings } = kptnCookToDraft(raw);

  it('reports nothing missing for a complete recipe', () => {
    expect(warnings).toEqual([]);
  });

  it('takes title, description, times and the source', () => {
    expect(draft.title).toBe('Überbackene Muschelnudeln mit Lachs & Senf-Dill-Sauce');
    expect(draft.prepMinutes).toBe(25);
    expect(draft.cookMinutes).toBe(10);
    expect(draft.sourceType).toBe('web');
    expect(draft.sourceTitle).toBe('KptnCook');
    expect(draft.sourceUrl).toContain('6c8c648e');
  });

  it('stores two portions and the amounts the app shows for two', () => {
    expect(draft.baseServings).toBe(2);
    const byName = new Map(draft.ingredients.map((i) => [i.name, i]));

    // Per-portion values in the API were 40 g, 100 g, 5 g, 1 EL, 0.5 clove.
    expect(byName.get('Erbsen')?.quantity).toEqual({ kind: 'exact', amount: 80, unit: 'g' });
    expect(byName.get('Lachsfilets')?.quantity).toEqual({ kind: 'exact', amount: 200, unit: 'g' });
    expect(byName.get('Parmesan')?.quantity).toEqual({ kind: 'exact', amount: 10, unit: 'g' });
    expect(byName.get('Olivenöl')?.quantity).toEqual({ kind: 'exact', amount: 2, unit: 'el' });
    expect(byName.get('Knoblauch')?.quantity).toEqual({ kind: 'exact', amount: 1, unit: 'zehe' });
  });

  it('keeps a countable ingredient without a unit', () => {
    const onion = draft.ingredients.find((i) => i.name === 'Speisezwiebeln');
    expect(onion?.quantity).toEqual({ kind: 'exact', amount: 2, unit: null });
  });

  it('singularises a single piece and pluralises the rest', () => {
    // 0.5 lemon per portion becomes exactly one, so the name must not be plural.
    const lemon = draft.ingredients.find((i) => i.quantity.kind === 'exact'
      && i.quantity.amount === 1 && i.name.startsWith('Zitrone'));
    expect(lemon?.name).toBe('Zitrone');
  });

  it('moves the state after the comma into preparation', () => {
    const peas = draft.ingredients.find((i) => i.name === 'Erbsen');
    expect(peas?.preparation).toBe('tiefgefroren');
    expect(peas?.rawText).toBe('80 g Erbsen, tiefgefroren');
  });

  it('treats an amountless pantry staple as "nach Geschmack"', () => {
    const salt = draft.ingredients.find((i) => i.name === 'Salz');
    expect(salt?.quantity).toEqual({ kind: 'toTaste' });
    expect(salt?.groupLabel).toBe('Grundzutaten');
  });

  it('puts the pantry staples last, under their own heading', () => {
    const labels = draft.ingredients.map((i) => i.groupLabel);
    const firstBasic = labels.indexOf('Grundzutaten');
    expect(firstBasic).toBeGreaterThan(0);
    expect(labels.slice(firstBasic).every((l) => l === 'Grundzutaten')).toBe(true);
  });

  it('maps the aisles it knows', () => {
    expect(draft.ingredients.find((i) => i.name === 'Erbsen')?.category).toBe('frozen');
    expect(draft.ingredients.find((i) => i.name === 'Lachsfilets')?.category).toBe('meat_fish');
    expect(draft.ingredients.find((i) => i.name === 'Parmesan')?.category).toBe('dairy_eggs');
  });

  it('takes every step and drops the canned mise-en-place one', () => {
    // 17 in the response, the first of which is "Alles parat?".
    expect(draft.steps).toHaveLength(16);
    expect(draft.steps.some((s) => /Alles parat/i.test(s.text))).toBe(false);
    expect(draft.steps[0]?.text).toBe('Lachsfilets bei Bedarf auftauen.');
  });

  it('links steps to the ingredients they use', () => {
    const withLinks = draft.steps.filter((s) => s.ingredientIndices?.length);
    expect(withLinks.length).toBeGreaterThan(5);
    const first = draft.steps[0];
    expect(first?.ingredientIndices?.map((i) => draft.ingredients[i]?.name)).toEqual(['Lachsfilets']);
  });

  it('reads the oven temperature out of the step text', () => {
    const baking = draft.steps.find((s) => s.temperatureC != null);
    expect(baking?.temperatureC).toBe(200);
  });

  it('keeps nutrition per portion and tags the recipe as imported', () => {
    expect(draft.nutrition).toEqual({ kcal: 900, protein: 40, carbs: 85, fat: 41, fiber: null });
    expect(draft.tags).toContain('KptnCook');
    expect(draft.tags).toContain('pescetarisch');
    // main_ingredient_* is editorial noise and must not reach the recipe card.
    expect(draft.tags?.some((t) => t.includes('main_ingredient'))).toBe(false);
  });

  it('returns the cover image with the key the CDN requires', () => {
    expect(imageUrl).toContain('636936644f000036005a5593');
    expect(imageUrl).toContain('kptnkey=');
  });
});

describe('kptnCookToDraft on a threadbare response', () => {
  it('says what was missing instead of throwing', () => {
    const { draft, imageUrl, warnings } = kptnCookToDraft({ localizedTitle: { de: 'Leer' } });
    expect(draft.title).toBe('Leer');
    expect(draft.baseServings).toBe(2);
    expect(imageUrl).toBeNull();
    expect(warnings).toHaveLength(2);
  });
});

describe('the draft through the shared contract', () => {
  it('validates, keeping the per-step ingredient links intact', () => {
    // draftToRecipeInput lives in the service layer and would drag the database
    // in, so the contract it parses against is checked here directly. It is the
    // boundary where a field the RecipeDraft type gained but the schema did not
    // would be stripped without a word.
    const { draft } = kptnCookToDraft(raw);
    const parsed = RecipeInputSchema.parse({ ...draft, tags: draft.tags ?? [] });

    expect(parsed.ingredients).toHaveLength(13);
    expect(parsed.steps).toHaveLength(16);
    expect(parsed.steps[0]?.ingredientIndices).toEqual([draft.steps[0]?.ingredientIndices?.[0]]);
    expect(parsed.steps.filter((s) => s.ingredientIndices?.length).length).toBeGreaterThan(5);
    expect(parsed.steps.find((s) => s.temperatureC != null)?.temperatureC).toBe(200);
  });
});
