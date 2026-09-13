import { describe, expect, it } from 'vitest';
import { aggregateIngredients, groupByCategory, type AggregateInput } from './aggregate';
import { categorizeIngredient } from './categories';
import { normalizeQuantity } from '../units/convert';
import { formatQuantity } from '../units/format';
import type { Quantity } from '../units/types';
import type { RecipeIngredient, ScaledIngredient } from '../recipe/types';

let seq = 0;
function ing(name: string, quantity: Quantity, over: Partial<RecipeIngredient> = {}): ScaledIngredient {
  const source: RecipeIngredient = {
    id: `i${seq++}`,
    recipeId: 'r1',
    sortOrder: 0,
    groupLabel: null,
    name,
    preparation: null,
    note: null,
    rawText: null,
    quantity,
    canonical: normalizeQuantity(quantity),
    scaling: { mode: 'linear' },
    rounding: 'nice',
    category: categorizeIngredient(name),
    optional: false,
    excludeFromShoppingList: false,
    ...over,
  };
  return {
    source,
    scaled: quantity,
    exact: null,
    display: formatQuantity(quantity),
    didRound: false,
    didNotScale: false,
  };
}

function input(i: ScaledIngredient, recipeTitle = 'Rezept'): AggregateInput {
  return {
    ingredient: i,
    source: { recipeId: i.source.recipeId, recipeTitle, originalDisplay: i.display, servings: 4 },
  };
}

describe('aggregateIngredients', () => {
  it('merges the same ingredient across recipes and units', () => {
    const lines = aggregateIngredients([
      input(ing('Mehl', { kind: 'exact', amount: 200, unit: 'g' })),
      input(ing('Mehl', { kind: 'exact', amount: 0.5, unit: 'kg' })),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.display).toBe('700 g');
  });

  it('keeps incompatible dimensions on separate lines instead of guessing a density', () => {
    const lines = aggregateIngredients([
      input(ing('Mehl', { kind: 'exact', amount: 200, unit: 'g' })),
      input(ing('Mehl', { kind: 'exact', amount: 2, unit: 'el' })),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.display).sort()).toEqual(['2 EL', '200 g']);
  });

  it('matches names that differ only by parenthetical detail or case', () => {
    const lines = aggregateIngredients([
      input(ing('Mehl (Type 550)', { kind: 'exact', amount: 300, unit: 'g' })),
      input(ing('mehl', { kind: 'exact', amount: 200, unit: 'g' })),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.display).toBe('500 g');
  });

  it('sums both ends of a range', () => {
    const lines = aggregateIngredients([
      input(ing('Knoblauch', { kind: 'range', min: 2, max: 3, unit: 'zehe' })),
      input(ing('Knoblauch', { kind: 'exact', amount: 1, unit: 'zehe' })),
    ]);
    expect(lines[0]!.display).toBe('3–4 Zehen');
  });

  it('collapses a range to its upper bound when asked — never under-buy', () => {
    const lines = aggregateIngredients(
      [input(ing('Knoblauch', { kind: 'range', min: 2, max: 3, unit: 'zehe' }))],
      { rangeStrategy: 'max' },
    );
    expect(lines[0]!.display).toBe('3 Zehen');
  });

  it('keeps vague amounts as notes rather than adding them up', () => {
    const lines = aggregateIngredients(
      [
        input(ing('Muskat', { kind: 'exact', amount: 1, unit: 'prise' })),
        input(ing('Muskat', { kind: 'toTaste' })),
      ],
      { includePantryStaples: true },
    );
    expect(lines[0]!.quantity).toBeNull();
    expect(lines[0]!.display).toContain('1 Prise');
    expect(lines[0]!.display).toContain('nach Geschmack');
  });

  it('drops pantry staples by default and keeps them on request', () => {
    const items = [input(ing('Salz', { kind: 'toTaste' }))];
    expect(aggregateIngredients(items)).toHaveLength(0);
    expect(aggregateIngredients(items, { includePantryStaples: true })).toHaveLength(1);
  });

  it('honours excludeFromShoppingList', () => {
    const items = [input(ing('Wasser zum Kochen', { kind: 'exact', amount: 2, unit: 'l' },
      { excludeFromShoppingList: true }))];
    expect(aggregateIngredients(items)).toHaveLength(0);
  });

  it('tracks which recipes each line came from', () => {
    const lines = aggregateIngredients([
      input(ing('Butter', { kind: 'exact', amount: 100, unit: 'g' }), 'Kuchen'),
      input(ing('Butter', { kind: 'exact', amount: 50, unit: 'g' }), 'Sauce'),
    ]);
    expect(lines[0]!.sources.map((s) => s.recipeTitle)).toEqual(['Kuchen', 'Sauce']);
  });

  it('is order-independent — the list must not depend on which recipe came first', () => {
    const items = [
      input(ing('Mehl', { kind: 'exact', amount: 200, unit: 'g' })),
      input(ing('Butter', { kind: 'exact', amount: 100, unit: 'g' })),
      input(ing('Mehl', { kind: 'exact', amount: 300, unit: 'g' })),
    ];
    const forward = aggregateIngredients(items).map((l) => `${l.label} ${l.display}`);
    const reverse = aggregateIngredients([...items].reverse()).map((l) => `${l.label} ${l.display}`);
    expect(forward).toEqual(reverse);
  });

  it('orders lines as a walk through the supermarket', () => {
    const lines = aggregateIngredients([
      input(ing('Mehl', { kind: 'exact', amount: 200, unit: 'g' })),
      input(ing('Zwiebel', { kind: 'exact', amount: 2, unit: null })),
      input(ing('Hackfleisch', { kind: 'exact', amount: 500, unit: 'g' })),
    ]);
    // Obst & Gemüse -> Fleisch & Fisch -> Trockenwaren
    expect(lines.map((l) => l.category)).toEqual(['produce', 'meat_fish', 'dry_goods_baking']);
  });
});

describe('groupByCategory', () => {
  it('groups and orders by aisle', () => {
    const groups = groupByCategory(aggregateIngredients([
      input(ing('Mehl', { kind: 'exact', amount: 200, unit: 'g' })),
      input(ing('Zwiebel', { kind: 'exact', amount: 2, unit: null })),
    ]));
    expect(groups.map((g) => g.category)).toEqual(['produce', 'dry_goods_baking']);
  });
});

describe('categorizeIngredient', () => {
  it('files common German ingredients into the right aisle', () => {
    expect(categorizeIngredient('Zwiebeln')).toBe('produce');
    expect(categorizeIngredient('Hähnchenbrust')).toBe('meat_fish');
    expect(categorizeIngredient('Schlagsahne')).toBe('dairy_eggs');
    expect(categorizeIngredient('Weizenmehl')).toBe('dry_goods_baking');
    expect(categorizeIngredient('Anthrazit')).toBe('other');
  });
});

describe('category edge cases', () => {
  it('does not file Muskatnuss under baking supplies because of "nuss"', () => {
    expect(categorizeIngredient('Muskatnuss')).toBe('spices_sauces');
    // The specific nuts must still land in baking.
    expect(categorizeIngredient('Haselnüsse')).toBe('dry_goods_baking');
  });

  it('knows the German herb cupboard', () => {
    expect(categorizeIngredient('Majoran')).toBe('spices_sauces');
    expect(categorizeIngredient('Lorbeerblatt')).toBe('spices_sauces');
  });
});

describe('most specific keyword wins', () => {
  it('sends tinned tomatoes to the canned aisle and fresh ones to produce', () => {
    expect(categorizeIngredient('Passierte Tomaten')).toBe('canned_jarred');
    expect(categorizeIngredient('Tomaten')).toBe('produce');
  });

  it('files Vanillezucker with the baking supplies, not the spices', () => {
    expect(categorizeIngredient('Vanillezucker')).toBe('dry_goods_baking');
    expect(categorizeIngredient('Vanille')).toBe('spices_sauces');
  });
});
