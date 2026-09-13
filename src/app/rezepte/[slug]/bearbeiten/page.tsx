import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getRecipe } from '@/services/recipes';
import { RecipeEditor } from '@/components/RecipeEditor';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const recipe = await getRecipe((await params).slug);
  return { title: recipe ? `${recipe.title} bearbeiten` : 'Rezept bearbeiten' };
}

/**
 * Editing lives at the recipe's own address rather than at
 * `/rezepte/neu?bearbeiten=<id>`, which read like a new recipe in the address
 * bar and titled every edit "Neues Rezept".
 */
export default async function EditRecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const recipe = await getRecipe(slug);
  if (!recipe) notFound();

  return (
    <>
      <PageHeader
        title={`„${recipe.title}“ bearbeiten`}
        subtitle="Zutaten, Schritte und Tags werden beim Speichern komplett ersetzt."
      />
      <RecipeEditor recipe={recipe} />
    </>
  );
}
