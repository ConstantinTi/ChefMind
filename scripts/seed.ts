/**
 * Seeds two recipes that between them exercise every awkward case the scaling
 * engine has to handle: ranges, "nach Geschmack", whole eggs, a spice that must
 * scale sublinearly, oil that must not scale at all, and a baking recipe in
 * exact-precision mode.
 *
 * Run with: npm run db:seed
 */
import { createRecipe } from '../src/services/recipes';
import type { CreateRecipeArgs } from '../src/contracts/recipes';

const kartoffelsuppe: CreateRecipeArgs = {
  title: 'Kartoffelsuppe mit Majoran',
  subtitle: 'Deftig, cremig, ein Topf',
  description: 'Klassische Kartoffelsuppe, wie sie im Herbst auf den Tisch gehört.',
  baseServings: 4,
  servingUnit: 'portion',
  yieldNote: null,
  prepMinutes: 20,
  cookMinutes: 30,
  restMinutes: null,
  difficulty: 'easy',
  precisionMode: 'kitchen',
  sourceType: 'own',
  sourceTitle: null, sourceAuthor: null, sourceUrl: null, sourcePage: null,
  isFavorite: true,
  rating: 5,
  notes: 'Mit einem Klecks Schmand servieren. Schmeckt aufgewärmt besser.',
  tags: ['Suppe', 'Herbst', 'vegetarisch'],
  nutrition: { kcal: 310, protein: 7, carbs: 45, fat: 11, fiber: 5 },
  ingredients: [
    { name: 'Kartoffeln', preparation: 'mehligkochend, geschält und gewürfelt',
      quantity: { kind: 'exact', amount: 800, unit: 'g' } },
    { name: 'Möhren', preparation: 'gewürfelt', quantity: { kind: 'exact', amount: 2, unit: null } },
    { name: 'Lauch', preparation: 'in Ringen', quantity: { kind: 'exact', amount: 1, unit: 'stange' } },
    { name: 'Zwiebel', preparation: 'fein gewürfelt', quantity: { kind: 'exact', amount: 1, unit: null } },
    { name: 'Knoblauch', quantity: { kind: 'range', min: 2, max: 3, unit: 'zehe' } },
    { name: 'Gemüsebrühe', quantity: { kind: 'exact', amount: 1.2, unit: 'l' } },
    { name: 'Schlagsahne', quantity: { kind: 'exact', amount: 150, unit: 'ml' } },
    // Sublinear on purpose: a doubled pot does not want double the marjoram.
    { name: 'Majoran', preparation: 'getrocknet', quantity: { kind: 'exact', amount: 2, unit: 'tl' } },
    { name: 'Muskatnuss', quantity: { kind: 'exact', amount: 1, unit: 'prise' } },
    // Fixed on purpose: you fry in the same film of oil regardless of batch size.
    { name: 'Öl zum Anbraten', quantity: { kind: 'unquantified' },
      scaling: { mode: 'fixed' }, excludeFromShoppingList: true },
    { name: 'Salz', quantity: { kind: 'toTaste' } },
    { name: 'Pfeffer', quantity: { kind: 'toTaste' } },
    { name: 'Petersilie', preparation: 'gehackt', quantity: { kind: 'exact', amount: 0.5, unit: 'bund' },
      optional: true },
  ],
  steps: [
    { text: 'Zwiebel und Knoblauch im Öl glasig anschwitzen.', durationMinutes: 5 },
    { text: 'Kartoffeln, Möhren und Lauch zugeben und kurz mitbraten.', durationMinutes: 3 },
    { text: 'Mit der Brühe ablöschen und zugedeckt köcheln lassen, bis die Kartoffeln zerfallen.',
      durationMinutes: 25 },
    { text: 'Etwa die Hälfte der Suppe pürieren, damit sie cremig wird, aber Stücke bleiben.' },
    { text: 'Sahne einrühren, mit Majoran, Muskat, Salz und Pfeffer abschmecken. Mit Petersilie bestreuen.' },
  ],
};

const hefezopf: CreateRecipeArgs = {
  title: 'Hefezopf',
  description: 'Luftiger Hefezopf für den Sonntagstisch.',
  baseServings: 12,
  servingUnit: 'scheibe',
  yieldNote: '1 Zopf, ca. 35 cm',
  prepMinutes: 30,
  cookMinutes: 35,
  restMinutes: 90,
  difficulty: 'medium',
  // Baking: exact amounts, no nice-number rounding — hydration matters.
  precisionMode: 'exact',
  sourceType: 'own',
  sourceTitle: null, sourceAuthor: null, sourceUrl: null, sourcePage: null,
  isFavorite: false,
  rating: null,
  notes: 'Der Teig ist richtig, wenn er sich vollständig von der Schüssel löst.',
  tags: ['Backen', 'Hefeteig', 'Frühstück'],
  nutrition: { kcal: 245, protein: 6, carbs: 38, fat: 7, fiber: 2 },
  ingredients: [
    { name: 'Weizenmehl (Type 550)', quantity: { kind: 'exact', amount: 500, unit: 'g' } },
    { name: 'Milch', preparation: 'lauwarm', quantity: { kind: 'exact', amount: 250, unit: 'ml' } },
    { name: 'Butter', preparation: 'weich', quantity: { kind: 'exact', amount: 80, unit: 'g' } },
    { name: 'Zucker', quantity: { kind: 'exact', amount: 80, unit: 'g' } },
    // Leavening scales sublinearly with an even lower exponent than spices.
    { name: 'Frische Hefe', quantity: { kind: 'exact', amount: 21, unit: 'g' } },
    { name: 'Eier', quantity: { kind: 'exact', amount: 2, unit: null } },
    { name: 'Salz', quantity: { kind: 'exact', amount: 1, unit: 'tl' } },
    { name: 'Hagelzucker', quantity: { kind: 'exact', amount: 2, unit: 'el' }, optional: true },
  ],
  steps: [
    { text: 'Hefe in der lauwarmen Milch mit einem Teelöffel Zucker auflösen und stehen lassen.',
      durationMinutes: 10 },
    { text: 'Alle Zutaten bis auf den Hagelzucker zu einem glatten Teig kneten.', durationMinutes: 10 },
    { text: 'Zugedeckt gehen lassen, bis sich der Teig verdoppelt hat.', durationMinutes: 60 },
    { text: 'Teig dritteln, Stränge rollen und zu einem Zopf flechten.' },
    { text: 'Nochmals gehen lassen, mit Ei bestreichen und mit Hagelzucker bestreuen.',
      durationMinutes: 30 },
    { text: 'Im vorgeheizten Ofen goldbraun backen.', durationMinutes: 35, temperatureC: 180 },
  ],
};

for (const recipe of [kartoffelsuppe, hefezopf]) {
  const created = await createRecipe(recipe);
  console.log(`[seed] angelegt: ${created.title} (${created.slug})`);
}
