/** Supermarket aisles, in the order you actually walk them — not alphabetical. */
export const GROCERY_CATEGORIES = [
  'produce',
  'bakery',
  'meat_fish',
  'dairy_eggs',
  'frozen',
  'canned_jarred',
  'dry_goods_baking',
  'spices_sauces',
  'drinks',
  'household',
  'other',
] as const;

export type GroceryCategory = (typeof GROCERY_CATEGORIES)[number];

/** Sort weight per category, so a shopping list reads as a walk through the shop. */
export const CATEGORY_ORDER_INDEX: Readonly<Record<GroceryCategory, number>> = Object.freeze(
  Object.fromEntries(GROCERY_CATEGORIES.map((c, i) => [c, i])) as Record<GroceryCategory, number>,
);

export const CATEGORY_LABELS: Readonly<Record<GroceryCategory, string>> = {
  produce: 'Obst & Gemüse',
  bakery: 'Backwaren',
  meat_fish: 'Fleisch & Fisch',
  dairy_eggs: 'Molkereiprodukte & Eier',
  frozen: 'Tiefkühl',
  canned_jarred: 'Konserven & Gläser',
  dry_goods_baking: 'Trockenwaren & Backzutaten',
  spices_sauces: 'Gewürze & Saucen',
  drinks: 'Getränke',
  household: 'Haushalt',
  other: 'Sonstiges',
};

const KEYWORDS: ReadonlyArray<[GroceryCategory, readonly string[]]> = [
  ['produce', ['zwiebel', 'knoblauch', 'karotte', 'möhre', 'kartoffel', 'tomate', 'paprika',
    'gurke', 'salat', 'spinat', 'brokkoli', 'blumenkohl', 'zucchini', 'aubergine', 'lauch',
    'sellerie', 'pilz', 'champignon', 'apfel', 'banane', 'zitrone', 'limette', 'orange',
    'beere', 'birne', 'petersilie', 'schnittlauch', 'basilikum', 'dill', 'kürbis', 'ingwer',
    'kohl', 'bohne', 'erbse', 'rucola', 'avocado', 'mango', 'traube', 'pfirsich', 'radieschen']],
  ['bakery', ['brot', 'brötchen', 'baguette', 'toast', 'semmel', 'brezel', 'croissant', 'fladen']],
  ['meat_fish', ['hähnchen', 'huhn', 'pute', 'rind', 'schwein', 'hack', 'speck', 'schinken',
    'wurst', 'salami', 'lamm', 'ente', 'lachs', 'thunfisch', 'garnele', 'fisch', 'kabeljau',
    'forelle', 'scampi', 'filet', 'steak', 'bacon']],
  ['dairy_eggs', ['milch', 'sahne', 'butter', 'joghurt', 'quark', 'käse', 'frischkäse',
    'mozzarella', 'parmesan', 'feta', 'schmand', 'crème', 'creme fraiche', 'ei', 'eier',
    'buttermilch', 'mascarpone', 'ricotta', 'gouda', 'margarine']],
  ['frozen', ['tiefkühl', 'tk-', 'gefroren', 'eiswürfel', 'blattspinat']],
  ['canned_jarred', ['dose', 'konserve', 'passierte tomaten', 'tomatenmark', 'kichererbsen',
    'mais', 'kokosmilch', 'oliven', 'kapern', 'gewürzgurke', 'pesto']],
  ['dry_goods_baking', ['mehl', 'zucker', 'reis', 'nudel', 'pasta', 'spaghetti', 'couscous',
    'bulgur', 'linsen', 'grieß', 'haferflocken', 'stärke', 'hefe', 'backpulver', 'natron',
    'vanillezucker', 'puderzucker', 'mandel', 'walnuss', 'haselnuss', 'cashew', 'schokolade',
    'kakao', 'kokosraspel', 'semmelbrösel', 'panko', 'polenta', 'quinoa', 'gelatine', 'honig']],
  ['spices_sauces', ['salz', 'pfeffer', 'öl', 'essig', 'senf', 'ketchup', 'sojasauce', 'brühe',
    'paprikapulver', 'curry', 'zimt', 'muskat', 'oregano', 'thymian', 'rosmarin', 'kümmel',
    'majoran', 'safran', 'kurkuma', 'piment', 'anis', 'estragon', 'wacholder', 'beifuß',
    'chili', 'lorbeer', 'vanille', 'kräuter', 'gewürz', 'mayonnaise', 'sauce', 'worcester']],
  ['drinks', ['wasser', 'wein', 'bier', 'saft', 'kaffee', 'tee', 'cola', 'sekt', 'rum',
    'cognac', 'likör', 'sprudel']],
  ['household', ['backpapier', 'alufolie', 'frischhaltefolie', 'zahnstocher', 'küchengarn']],
];

/**
 * Folds umlauts so plurals and inflections still match: "Haselnüsse" has to find
 * the keyword "haselnuss", and "Möhren" has to find "möhre".
 */
function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
}

/**
 * German compounds mean a plain substring match is usually right ("Weizenmehl"
 * really is "Mehl"), but short keywords must match whole words or they match
 * everything — "ei" alone turns "W-ei-zenmehl" into a dairy product.
 */
function matches(haystack: string, keyword: string): boolean {
  const k = fold(keyword);
  if (k.length > 3) return haystack.includes(k);
  return new RegExp(`(^|[^a-z])${k}([^a-z]|$)`).test(haystack);
}

/**
 * All keywords flattened and sorted longest-first, so the most specific match
 * wins regardless of which category it belongs to: "passierte Tomaten" is a tin
 * from the canned aisle, not a fresh tomato, and "Vanillezucker" is a baking
 * ingredient rather than a spice. Built once at module load.
 */
const RANKED_KEYWORDS: ReadonlyArray<readonly [GroceryCategory, string]> = KEYWORDS
  .flatMap(([category, words]) => words.map((w) => [category, fold(w)] as const))
  .sort((a, b) => b[1].length - a[1].length);

/**
 * Best-effort aisle for a free-text ingredient name. Deliberately keyword-based
 * and offline: a wrong guess costs one tap to correct, and an API call per
 * ingredient would make the shopping list slow and unreliable.
 */
export function categorizeIngredient(name: string): GroceryCategory {
  const n = fold(name);
  for (const [category, keyword] of RANKED_KEYWORDS) {
    if (matches(n, keyword)) return category;
  }
  return 'other';
}

/**
 * Things nobody puts on a shopping list because they are always in the cupboard
 * AND are used in amounts too small to run out of.
 *
 * Deliberately short. Flour, sugar and oil are *used up* — silently dropping
 * "500 g Mehl" means standing in the shop without buying flour, which is a far
 * worse failure than one extra line on the list.
 */
const PANTRY_STAPLES = ['salz', 'pfeffer', 'wasser'];

export function isLikelyPantryStaple(name: string): boolean {
  const n = fold(name).trim();
  return PANTRY_STAPLES.some((s) => n === s || n.startsWith(`${s} `) || n.endsWith(` ${s}`));
}
