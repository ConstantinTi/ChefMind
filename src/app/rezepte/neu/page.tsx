import type { Metadata } from 'next';
import { RecipeEditor } from '@/components/RecipeEditor';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Neues Rezept' };
export const dynamic = 'force-dynamic';

export default function NewRecipePage() {
  return (
    <>
      <PageHeader
        title="Neues Rezept"
        subtitle="Mengen werden standardisiert gespeichert, damit sich Portionen später zuverlässig umrechnen lassen."
      />
      <RecipeEditor />
    </>
  );
}
