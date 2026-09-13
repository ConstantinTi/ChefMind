import { describe, expect, it } from 'vitest';
import { extractRecipeFromHtml, parseIsoDuration, JsonLdNotFoundError } from './jsonld';
import { formatQuantity } from '@/domain/units/format';

const html = (jsonLd: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body></body></html>`;

describe('parseIsoDuration', () => {
  it('reads the ISO 8601 durations schema.org uses', () => {
    expect(parseIsoDuration('PT30M')).toBe(30);
    expect(parseIsoDuration('PT1H30M')).toBe(90);
    expect(parseIsoDuration('P1DT2H')).toBe(1560);
  });

  it('returns null for junk rather than a wrong number', () => {
    expect(parseIsoDuration('bald')).toBeNull();
    expect(parseIsoDuration(undefined)).toBeNull();
  });
});

describe('extractRecipeFromHtml', () => {
  const recipe = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Kartoffelsuppe',
    description: 'Deftige Suppe.',
    recipeYield: '4 Portionen',
    prepTime: 'PT20M',
    cookTime: 'PT40M',
    author: { name: 'Oma' },
    recipeIngredient: ['500 g Kartoffeln', '2-3 Zehen Knoblauch', 'Salz nach Geschmack'],
    recipeInstructions: [
      { '@type': 'HowToStep', text: 'Kartoffeln schälen.' },
      { '@type': 'HowToStep', text: 'Alles 40 Minuten köcheln.' },
    ],
    recipeCuisine: 'Deutsch',
    keywords: 'Suppe, Winter',
    nutrition: { '@type': 'NutritionInformation', calories: '320 kcal', proteinContent: '8 g' },
  };

  it('extracts a complete recipe', () => {
    const draft = extractRecipeFromHtml(html(recipe), 'https://www.example.de/kartoffelsuppe');
    expect(draft.title).toBe('Kartoffelsuppe');
    expect(draft.baseServings).toBe(4);
    expect(draft.prepMinutes).toBe(20);
    expect(draft.cookMinutes).toBe(40);
    expect(draft.sourceAuthor).toBe('Oma');
    expect(draft.sourceTitle).toBe('example.de');
    expect(draft.steps).toHaveLength(2);
    expect(draft.nutrition?.kcal).toBe(320);
    expect(draft.tags).toContain('Deutsch');
  });

  it('parses each ingredient line through the German parser', () => {
    const draft = extractRecipeFromHtml(html(recipe), 'https://example.de/x');
    expect(draft.ingredients.map((i) => i.name)).toEqual(['Kartoffeln', 'Knoblauch', 'Salz']);
    expect(formatQuantity(draft.ingredients[1]!.quantity)).toBe('2–3 Zehen');
    expect(draft.ingredients[2]!.quantity).toEqual({ kind: 'toTaste' });
  });

  it('finds the recipe inside an @graph wrapper', () => {
    const wrapped = { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebSite' }, recipe] };
    expect(extractRecipeFromHtml(html(wrapped), 'https://example.de/x').title).toBe('Kartoffelsuppe');
  });

  it('survives a malformed JSON-LD block next to a good one', () => {
    const page = `<html><head>
      <script type="application/ld+json">{ not json </script>
      <script type="application/ld+json">${JSON.stringify(recipe)}</script>
    </head><body></body></html>`;
    expect(extractRecipeFromHtml(page, 'https://example.de/x').title).toBe('Kartoffelsuppe');
  });

  it('splits instructions given as one newline-separated blob', () => {
    const blob = { ...recipe, recipeInstructions: 'Schritt eins.\nSchritt zwei.\nSchritt drei.' };
    expect(extractRecipeFromHtml(html(blob), 'https://example.de/x').steps).toHaveLength(3);
  });

  it('throws a recognisable error when the page has no recipe data', () => {
    expect(() => extractRecipeFromHtml('<html><body>nichts</body></html>', 'https://example.de/x'))
      .toThrow(JsonLdNotFoundError);
  });
});
