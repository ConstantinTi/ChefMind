import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getRecipe } from '@/services/recipes';
import { initialServings } from '@/domain/recipe/derive';
import { householdServings } from '@/lib/settings';
import { ServingsScaler } from '@/components/ServingsScaler';
import { PhotoGallery } from '@/components/PhotoGallery';
import { ConfirmSubmit, PrintButton, SubmitButton } from '@/components/forms';
import { deleteRecipeAction, markImportReviewedAction, toggleFavoriteAction } from '@/app/actions';
import {
  Badge, BadgeLink, buttonClass, Card, formatMinutes, Stars, DIFFICULTY_LABELS,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const recipe = await getRecipe((await params).slug);
  return { title: recipe?.title ?? 'Rezept' };
}

const IMPORT_METHOD_LABELS: Record<string, string> = {
  jsonld: 'aus den strukturierten Daten der Seite gelesen',
  'ai-text': 'von einer KI aus Text ausgewertet',
  'ai-photo': 'von einer KI aus einem Foto ausgewertet',
  parser: 'ohne KI aus der Zutatenliste geparst',
};

export default async function RecipeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const recipe = await getRecipe(slug);
  if (!recipe) notFound();

  const facts = [
    formatMinutes(recipe.totalMinutes),
    recipe.difficulty ? DIFFICULTY_LABELS[recipe.difficulty] : null,
    recipe.yieldNote,
  ].filter(Boolean);

  return (
    <article>
      <nav className="no-print mb-4 text-sm">
        <Link href="/" className="text-muted hover:text-ink">← Alle Rezepte</Link>
      </nav>

      <PhotoGallery
        recipeId={recipe.id}
        slug={recipe.slug}
        photos={recipe.photos}
        heroPhotoId={recipe.heroPhotoId}
        title={recipe.title}
      />

      <header className="mb-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="mr-auto">
            <h1 className="text-3xl font-semibold tracking-tight">{recipe.title}</h1>
            {recipe.subtitle ? <p className="mt-1 text-muted">{recipe.subtitle}</p> : null}
            <Stars value={recipe.rating} className="mt-1 block text-sm" />
          </div>

          <div className="no-print flex flex-wrap gap-2">
            <form action={toggleFavoriteAction.bind(null, recipe.id, !recipe.isFavorite)}>
              <SubmitButton>
                {recipe.isFavorite ? '★ Favorit' : '☆ Merken'}
              </SubmitButton>
            </form>
            <Link href={`/rezepte/${recipe.slug}/bearbeiten`} className={buttonClass()}>
              Bearbeiten
            </Link>
            <PrintButton />
          </div>
        </div>

        {recipe.description ? <p className="mt-3 max-w-prose">{recipe.description}</p> : null}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {facts.map((f) => <Badge key={String(f)}>{f}</Badge>)}
          {/* Tags looked clickable long before they were; now they filter. */}
          {recipe.tags.map((tag) => (
            <BadgeLink key={tag.id} href={`/?tag=${encodeURIComponent(tag.name)}`}>
              {tag.name}
            </BadgeLink>
          ))}
          {recipe.precisionMode === 'exact' ? (
            <Badge title="Mengen werden beim Umrechnen nicht auf glatte Zahlen gerundet.">
              exakte Mengen (Backen)
            </Badge>
          ) : null}
        </div>

        {/* An AI reconstruction must never quietly pass as a transcribed recipe. */}
        {recipe.sourceType === 'ai' ? (
          <p className="mt-4 rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-sm">
            ⚠️ Dieses Rezept wurde von einer KI aus einem Foto des fertigen Gerichts rekonstruiert.
            Es stammt aus keiner Quelle — Mengen und Zeiten sind geschätzt.
          </p>
        ) : null}

        {/* What the importer was unsure about. This used to flash past on the
            import screen for a fraction of a second and was then lost. */}
        {recipe.importReview ? (
          <Card className="no-print mt-4 border-warn-line bg-warn-bg p-4 text-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <strong>Beim Import bitte prüfen</strong>
              {recipe.importReview.confidence != null ? (
                <Badge tone="warn">
                  Konfidenz {Math.round(recipe.importReview.confidence * 100)} %
                </Badge>
              ) : null}
              <span className="text-muted">
                {IMPORT_METHOD_LABELS[recipe.importReview.method] ?? recipe.importReview.method}
              </span>
            </div>
            <ul className="list-inside list-disc space-y-1">
              {recipe.importReview.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/rezepte/${recipe.slug}/bearbeiten`} className={buttonClass()}>
                Rezept bearbeiten
              </Link>
              <form action={markImportReviewedAction.bind(null, recipe.id, recipe.slug)}>
                <SubmitButton variant="ghost">Geprüft, ausblenden</SubmitButton>
              </form>
            </div>
          </Card>
        ) : null}
      </header>

      <ServingsScaler recipe={recipe} initialServings={initialServings(recipe, householdServings())} />

      {recipe.notes ? (
        <section className="mt-8 max-w-prose">
          <h2 className="mb-2 text-lg font-semibold">Notizen</h2>
          <p className="text-sm whitespace-pre-wrap">{recipe.notes}</p>
        </section>
      ) : null}

      <footer className="mt-10 border-t border-line pt-4 text-sm text-muted">
        {recipe.sourceTitle || recipe.sourceAuthor || recipe.sourceUrl ? (
          <p>
            Quelle:{' '}
            {recipe.sourceUrl ? (
              <a href={recipe.sourceUrl} rel="noreferrer noopener" target="_blank" className="underline underline-offset-2">
                {recipe.sourceTitle ?? recipe.sourceUrl}
              </a>
            ) : recipe.sourceTitle}
            {recipe.sourceAuthor ? ` — ${recipe.sourceAuthor}` : ''}
            {recipe.sourcePage ? `, S. ${recipe.sourcePage}` : ''}
          </p>
        ) : null}

        {/* Two steps, because one mistap on a phone used to be enough. */}
        <form action={deleteRecipeAction.bind(null, { id: recipe.id })} className="no-print mt-4">
          <ConfirmSubmit
            label="Rezept löschen"
            confirmLabel="Ja, endgültig löschen"
            question={`„${recipe.title}“ löschen?`}
          />
        </form>
      </footer>
    </article>
  );
}
