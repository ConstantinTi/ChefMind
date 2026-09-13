import { notFound } from 'next/navigation';
import { getRecipe } from '@/services/recipes';
import { CookingMode } from '@/components/CookingMode';
import { initialServings } from '@/domain/recipe/derive';
import { householdServings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function CookingPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ portionen?: string }>;
}) {
  const [{ slug }, { portionen }] = await Promise.all([params, searchParams]);
  const recipe = await getRecipe(slug);
  if (!recipe) notFound();

  // The scaler passes ?portionen=; without it, open at the household default.
  const requested = Number(portionen);
  const servings = Number.isFinite(requested) && requested > 0
    ? requested
    : initialServings(recipe, householdServings());

  return <CookingMode recipe={recipe} initialServings={servings} />;
}
