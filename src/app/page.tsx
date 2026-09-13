import Link from 'next/link';
import { listRecipes, listTagsInUse } from '@/services/recipes';
import {
  Badge, ButtonLink, Card, EmptyState, PageHeader, Stars, formatMinutes, inputClass,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

interface Params { q?: string; tag?: string; favoriten?: string }

/** Builds a link to this page with one filter flipped, keeping the others. */
function filterHref(current: Params, patch: Partial<Params>): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set('q', next.q);
  if (next.tag) params.set('tag', next.tag);
  if (next.favoriten === '1') params.set('favoriten', '1');
  const qs = params.toString();
  return qs ? `/?${qs}` : '/';
}

export default async function RecipeListPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const [{ recipes, total }, tags] = await Promise.all([
    listRecipes({
      query: params.q,
      tags: params.tag ? [params.tag] : undefined,
      favoritesOnly: params.favoriten === '1',
      limit: 60,
      offset: 0,
    }),
    listTagsInUse(),
  ]);

  const isFiltered = Boolean(params.q || params.tag || params.favoriten);

  return (
    <>
      <PageHeader
        title="Rezepte"
        subtitle={total === 1 ? '1 Rezept' : `${total} Rezepte`}
        action={<ButtonLink href="/import">Importieren</ButtonLink>}
      />

      <form className="mb-3 flex flex-wrap gap-2" action="/">
        {/* Keep the other filters when searching. */}
        {params.tag ? <input type="hidden" name="tag" value={params.tag} /> : null}
        {params.favoriten === '1' ? <input type="hidden" name="favoriten" value="1" /> : null}
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ''}
          placeholder="Suche in Titeln, Beschreibungen und Zutaten…"
          aria-label="Rezepte durchsuchen"
          className={`${inputClass} min-w-[14rem] flex-1`}
        />
        <button type="submit" className="min-h-11 cursor-pointer rounded-lg border border-line px-4 text-sm hover:bg-accent-soft">
          Suchen
        </button>
      </form>

      {/* Filters are links rather than a form: one tap, no submit button, and
          every filtered view has its own shareable address. */}
      <div className="no-print mb-6 flex flex-wrap items-center gap-1.5 text-xs">
        <Link
          href={filterHref(params, { favoriten: params.favoriten === '1' ? undefined : '1' })}
          aria-pressed={params.favoriten === '1'}
          className={`rounded-full border px-2.5 py-1.5 transition ${
            params.favoriten === '1'
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-line text-muted hover:border-accent'
          }`}
        >
          ★ Favoriten
        </Link>

        {tags.slice(0, 12).map((tag) => {
          const active = params.tag === tag.name;
          return (
            <Link
              key={tag.name}
              href={filterHref(params, { tag: active ? undefined : tag.name })}
              aria-pressed={active}
              className={`rounded-full border px-2.5 py-1.5 transition ${
                active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:border-accent'
              }`}
            >
              {tag.name}
              <span className="ml-1 opacity-60 tabular-nums">{tag.count}</span>
            </Link>
          );
        })}

        {isFiltered ? (
          <Link href="/" className="ml-1 px-2 py-1.5 text-muted underline underline-offset-2 hover:text-ink">
            Filter zurücksetzen
          </Link>
        ) : null}
      </div>

      {recipes.length === 0 ? (
        <EmptyState
          title={isFiltered ? 'Nichts gefunden.' : 'Noch keine Rezepte.'}
          hint={isFiltered
            ? 'Andere Suchbegriffe versuchen, oder die Filter zurücksetzen.'
            : 'Lege das erste Rezept von Hand an, importiere es aus einer URL oder fotografiere eine Rezeptkarte ab.'}
          action={isFiltered
            ? <ButtonLink href="/">Filter zurücksetzen</ButtonLink>
            : <ButtonLink href="/rezepte/neu" variant="primary">Erstes Rezept anlegen</ButtonLink>}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <Link href={`/rezepte/${recipe.slug}`} className="block h-full">
                <Card className="flex h-full flex-col overflow-hidden transition hover:border-accent">
                  {/* The photos were already there; the list just never showed them. */}
                  {recipe.heroThumbKey ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/media/${recipe.heroThumbKey}`}
                      alt=""
                      loading="lazy"
                      className="h-32 w-full object-cover"
                    />
                  ) : null}
                  <div className="flex flex-1 flex-col p-4">
                    <div className="mb-1 flex items-start gap-2">
                      <h2 className="mr-auto font-medium leading-snug">{recipe.title}</h2>
                      {recipe.isFavorite ? (
                        <span aria-label="Favorit" title="Favorit" className="text-accent">★</span>
                      ) : null}
                    </div>
                    <Stars value={recipe.rating} className="text-xs" />
                    {recipe.subtitle ? (
                      <p className="text-sm text-muted">{recipe.subtitle}</p>
                    ) : null}
                    {recipe.description ? (
                      <p className="mt-2 line-clamp-2 text-sm text-muted">{recipe.description}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-1">
                      {formatMinutes(recipe.totalMinutes) ? (
                        <Badge>{formatMinutes(recipe.totalMinutes)}</Badge>
                      ) : null}
                      <Badge>{recipe.baseServings} Portionen</Badge>
                      {recipe.sourceType === 'ai' ? <Badge tone="warn">KI-erzeugt</Badge> : null}
                      {recipe.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} tone="accent">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
