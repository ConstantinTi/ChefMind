import { describe, expect, it } from 'vitest';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { AiRecipeSchema, aiRecipeToDraft, type AiRecipe } from './schemas';
import { formatQuantity } from '@/domain/units/format';

/**
 * The Anthropic API rejects a structured-output schema with more than 16
 * union-typed parameters ("exponential compilation cost"). An earlier version of
 * this schema used `.nullable()` on 23 fields and every photo import failed with
 * a 400 that only appeared against the live API. This test makes the limit
 * visible locally.
 */
const UNION_LIMIT = 16;

function countUnions(node: unknown, path = '$', found: string[] = []): string[] {
  if (!node || typeof node !== 'object') return found;
  const n = node as Record<string, unknown>;
  if (Array.isArray(n.type) || n.anyOf || n.oneOf) found.push(path);
  for (const [key, value] of Object.entries(n)) {
    if (value && typeof value === 'object') countUnions(value, `${path}.${key}`, found);
  }
  return found;
}

describe('AiRecipeSchema', () => {
  it('stays within the API limit on union-typed parameters', () => {
    const format = zodOutputFormat(AiRecipeSchema) as unknown as Record<string, unknown>;
    const unions = countUnions(format.schema ?? format);
    expect(unions, `Union-Typen an:\n${unions.join('\n')}`).toHaveLength(0);
    expect(unions.length).toBeLessThanOrEqual(UNION_LIMIT);
  });
});

const base: AiRecipe = {
  title: 'Testgericht',
  subtitle: '',
  description: '',
  servings: 4,
  yieldNote: '',
  prepMinutes: 0,
  cookMinutes: 30,
  restMinutes: 0,
  difficulty: '',
  ingredients: [],
  steps: [],
  tags: [],
  notes: '',
  nutritionPerServing: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  confidence: 0.9,
  warnings: [],
};

describe('aiRecipeToDraft', () => {
  it('maps the sentinel values back to null', () => {
    const draft = aiRecipeToDraft(base, {
      sourceType: 'photo', sourceUrl: null, sourceTitle: null, sourceAuthor: null,
    });
    expect(draft.subtitle).toBeNull();
    expect(draft.description).toBeNull();
    expect(draft.difficulty).toBeNull();
    expect(draft.prepMinutes).toBeNull();
    expect(draft.cookMinutes).toBe(30);
    // An all-zero estimate is no estimate — better than a row of zeroes that
    // looks like a measured value.
    expect(draft.nutrition).toBeNull();
  });

  it('keeps a partial nutrition estimate', () => {
    const draft = aiRecipeToDraft(
      { ...base, nutritionPerServing: { kcal: 320, protein: 8, carbs: 0, fat: 0, fiber: 0 } },
      { sourceType: 'photo', sourceUrl: null, sourceTitle: null, sourceAuthor: null },
    );
    expect(draft.nutrition?.kcal).toBe(320);
    expect(draft.nutrition?.carbs).toBeNull();
  });

  it('turns the flat amount fields into the right quantity kind', () => {
    const ing = (over: Partial<AiRecipe['ingredients'][number]>) => ({
      groupLabel: '', name: 'Zutat', preparation: '', amountMin: 0, amountMax: 0,
      unit: '', toTaste: false, rawText: '', ...over,
    });
    const draft = aiRecipeToDraft({
      ...base,
      ingredients: [
        ing({ name: 'Mehl', amountMin: 200, unit: 'g' }),
        ing({ name: 'Knoblauch', amountMin: 2, amountMax: 3, unit: 'zehe' }),
        ing({ name: 'Salz', toTaste: true }),
        ing({ name: 'Öl zum Braten' }),
        ing({ name: 'Eier', amountMin: 3 }),
      ],
    }, { sourceType: 'photo', sourceUrl: null, sourceTitle: null, sourceAuthor: null });

    expect(draft.ingredients.map((i) => formatQuantity(i.quantity))).toEqual([
      '200 g', '2–3 Zehen', 'nach Geschmack', '', '3',
    ]);
  });

  it('drops entries the model left blank', () => {
    const draft = aiRecipeToDraft({
      ...base,
      ingredients: [{ groupLabel: '', name: '  ', preparation: '', amountMin: 0,
        amountMax: 0, unit: '', toTaste: false, rawText: '' }],
      steps: [{ groupLabel: '', text: '   ', durationMinutes: 0, temperatureC: 0 }],
    }, { sourceType: 'photo', sourceUrl: null, sourceTitle: null, sourceAuthor: null });
    expect(draft.ingredients).toHaveLength(0);
    expect(draft.steps).toHaveLength(0);
  });
});
