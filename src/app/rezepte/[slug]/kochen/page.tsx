import { notFound } from 'next/navigation';
import { getRecipe } from '@/services/recipes';
import { CookingMode } from '@/components/CookingMode';

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

  const requested = Number(portionen);
  const servings = Number.isFinite(requested) && requested > 0 ? requested : recipe.baseServings;

  return <CookingMode recipe={recipe} initialServings={servings} />;
}
