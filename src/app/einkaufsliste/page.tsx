import Link from 'next/link';
import type { Metadata } from 'next';
import { buildShoppingList, getShoppingList, listShoppingLists } from '@/services/shopping';
import { addDays } from '@/services/mealplan';
import {
  addShoppingItemAction, buildShoppingListAction, checkShoppingItemAction,
  clearCheckedItemsAction, deleteShoppingItemAction, deleteShoppingListAction,
} from '@/app/actions';
import { ConfirmSubmit, IconSubmit, PrintButton, SubmitButton } from '@/components/forms';
import { Card, EmptyState, PageHeader, buttonClass, formatDateLong, inputClass } from '@/components/ui';

export const metadata: Metadata = { title: 'Einkaufsliste' };
export const dynamic = 'force-dynamic';

interface Params { woche?: string; liste?: string; vorrat?: string; erledigt?: string }

export default async function ShoppingListPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const { woche, liste, vorrat, erledigt } = await searchParams;
  const hideChecked = erledigt === 'aus';

  // A week in the URL means "preview what this week would need" — computed, not
  // stored, so revisiting the page never quietly creates duplicate lists.
  const [list, savedLists] = await Promise.all([
    woche
      ? buildShoppingList({
          weekStart: woche,
          weekEnd: addDays(woche, 6),
          includePantryStaples: vorrat === '1',
          rangeStrategy: 'keepRange',
          save: false,
        })
      : getShoppingList({ id: liste }),
    listShoppingLists(),
  ]);

  if (!list) {
    return (
      <>
        <PageHeader title="Einkaufsliste" />
        <EmptyState
          title="Noch keine Einkaufsliste."
          hint="Plane zuerst eine Woche, dann lässt sich daraus eine Liste erzeugen."
          action={<Link href="/plan" className={buttonClass('primary')}>Zum Wochenplan</Link>}
        />
      </>
    );
  }

  const allItems = list.groups.flatMap((g) => g.items);
  const itemCount = allItems.length;
  const checkedCount = allItems.filter((i) => i.checked).length;
  const isPreview = Boolean(woche);

  return (
    <>
      <PageHeader
        title={isPreview ? `Vorschau: Woche ab ${formatDateLong(woche!)}` : list.name}
        subtitle={
          itemCount === 0
            ? 'keine Positionen'
            : `${checkedCount} von ${itemCount} erledigt${
                list.sources.length ? ` · aus ${list.sources.length} Rezept(en)` : ''}`
        }
        action={
          <div className="no-print flex flex-wrap gap-2">
            {isPreview ? (
              <>
                <Link
                  href={`/einkaufsliste?woche=${woche}&vorrat=${vorrat === '1' ? '0' : '1'}`}
                  className={buttonClass()}
                >
                  {vorrat === '1' ? 'Vorräte ausblenden' : 'Salz & Co. anzeigen'}
                </Link>
                <form
                  action={async () => {
                    'use server';
                    await buildShoppingListAction({
                      weekStart: woche,
                      weekEnd: addDays(woche!, 6),
                      includePantryStaples: vorrat === '1',
                      rangeStrategy: 'keepRange',
                      save: true,
                    });
                  }}
                >
                  <SubmitButton variant="primary" pendingLabel="Wird gespeichert…">
                    Liste speichern
                  </SubmitButton>
                </form>
              </>
            ) : (
              <>
                <Link
                  href={`/einkaufsliste?liste=${list.id}&erledigt=${hideChecked ? 'an' : 'aus'}`}
                  className={buttonClass()}
                >
                  {hideChecked ? 'Erledigte anzeigen' : 'Erledigte ausblenden'}
                </Link>
                <PrintButton />
              </>
            )}
          </div>
        }
      />

      {isPreview ? (
        <p className="no-print mb-4 rounded-lg border border-line px-3 py-2 text-sm text-muted">
          Das ist eine Vorschau aus dem Wochenplan. Sie wird bei jedem Aufruf neu berechnet —
          erst nach dem Speichern lassen sich Positionen abhaken.
        </p>
      ) : null}

      {itemCount === 0 ? (
        <EmptyState title="Die Liste ist leer." hint="Plane Rezepte ein, dann füllt sie sich von selbst." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 print:block print-columns">
          {list.groups.map((group) => {
            // Done items sink: in a shop you only want to see what is left.
            const items = [...group.items].sort((a, b) => Number(a.checked) - Number(b.checked));
            const visible = hideChecked ? items.filter((i) => !i.checked) : items;
            if (!visible.length) return null;

            return (
              <Card key={group.category} className="p-4 print-plain">
                <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
                  {group.label}
                </h2>
                <ul className="space-y-2 text-sm">
                  {visible.map((item, i) => (
                    <li key={item.id ?? `${group.category}-${i}`} className="flex items-baseline gap-2">
                      {item.id ? (
                        <form action={checkShoppingItemAction}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <input type="hidden" name="checked" value={item.checked ? 'false' : 'true'} />
                          <IconSubmit
                            label={item.checked ? 'Wieder aufnehmen' : 'Abhaken'}
                            className={`border ${
                              item.checked
                                ? 'border-accent bg-accent text-accent-ink'
                                : 'border-line hover:border-accent'
                            }`}
                          >
                            {item.checked ? '✓' : ''}
                          </IconSubmit>
                        </form>
                      ) : (
                        <span className="mt-0.5 size-5 shrink-0 rounded border border-line" />
                      )}

                      <span className={`flex-1 ${item.checked ? 'text-muted line-through' : ''}`}>
                        <strong className="tabular-nums">{item.display !== '—' ? item.display : ''}</strong>{' '}
                        {item.label}
                        {item.sources.length > 1 ? (
                          <span
                            className="ml-1 cursor-help text-xs text-muted"
                            title={item.sources.map((s) => `${s.recipeTitle}: ${s.originalDisplay}`).join('\n')}
                          >
                            ({item.sources.length}×)
                          </span>
                        ) : null}
                      </span>

                      {item.id ? (
                        <form action={deleteShoppingItemAction} className="no-print">
                          <input type="hidden" name="itemId" value={item.id} />
                          <IconSubmit label="Position entfernen" className="text-muted hover:bg-danger/10 hover:text-danger">
                            ×
                          </IconSubmit>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      {list.id ? (
        <>
          <Card className="no-print mt-6 p-4">
            <form action={addShoppingItemAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="listId" value={list.id} />
              <input name="label" required placeholder="Etwas hinzufügen…" aria-label="Position"
                className={`${inputClass} min-w-[12rem] flex-1`} />
              <input name="display" placeholder="Menge" aria-label="Menge" className={`${inputClass} w-28`} />
              <SubmitButton>Hinzufügen</SubmitButton>
            </form>
          </Card>

          {checkedCount > 0 ? (
            <form action={clearCheckedItemsAction} className="no-print mt-3">
              <input type="hidden" name="listId" value={list.id} />
              <ConfirmSubmit
                label={`${checkedCount} erledigte entfernen`}
                confirmLabel="Ja, entfernen"
                question="Abgehakte Positionen löschen?"
              />
            </form>
          ) : null}
        </>
      ) : null}

      {/* Saved lists were unreachable: only the newest one ever loaded. */}
      {savedLists.length > 0 ? (
        <details className="no-print mt-8" open={!list.id && !isPreview}>
          <summary className="cursor-pointer text-sm text-muted marker:content-none hover:text-accent">
            Gespeicherte Listen ({savedLists.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {savedLists.map((saved) => (
              <li key={saved.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Link
                  href={`/einkaufsliste?liste=${saved.id}`}
                  className={`flex-1 rounded-lg border px-3 py-2 transition hover:border-accent ${
                    saved.id === list.id ? 'border-accent bg-accent-soft' : 'border-line'
                  }`}
                >
                  {saved.name}
                  <span className="ml-2 text-xs text-muted tabular-nums">
                    {saved.checkedCount}/{saved.itemCount}
                  </span>
                </Link>
                <form action={deleteShoppingListAction}>
                  <input type="hidden" name="id" value={saved.id} />
                  <IconSubmit label={`Liste „${saved.name}“ löschen`} className="text-muted hover:bg-danger/10 hover:text-danger">
                    ×
                  </IconSubmit>
                </form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
