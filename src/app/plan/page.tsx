import Link from 'next/link';
import type { Metadata } from 'next';
import { addDays, getMealPlan, SLOT_LABELS, startOfWeek, toIsoDate } from '@/services/mealplan';
import { listRecipes } from '@/services/recipes';
import {
  deleteMealPlanEntryAction, moveMealPlanEntryAction, setMealPlanEntryAction,
} from '@/app/actions';
import { Disclosure, IconSubmit, SubmitButton } from '@/components/forms';
import {
  Card, PageHeader, buttonClass, formatDateLong, formatDateShort, inputClassCompact, isoWeekNumber,
} from '@/components/ui';
import { MEAL_SLOTS } from '@/db/schema';

export const metadata: Metadata = { title: 'Wochenplan' };
export const dynamic = 'force-dynamic';

const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

export default async function MealPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ woche?: string }>;
}) {
  const { woche } = await searchParams;
  const weekStart = woche ?? startOfWeek();

  const [plan, { recipes }] = await Promise.all([
    getMealPlan({ weekStart }),
    listRecipes({ limit: 200, offset: 0 }),
  ]);

  const thisWeek = startOfWeek() === weekStart;
  const today = toIsoDate(new Date());
  const plannedCount = plan.days.reduce((n, d) => n + d.entries.length, 0);

  return (
    <>
      <PageHeader
        title="Wochenplan"
        // ISO dates belong in the URL, not on screen.
        subtitle={`${formatDateLong(plan.weekStart)} bis ${formatDateLong(plan.weekEnd)} · KW ${isoWeekNumber(plan.weekStart)}`}
        action={
          <div className="no-print flex gap-2">
            <Link href={`/plan?woche=${addDays(weekStart, -7)}`} className={buttonClass()} aria-label="Vorige Woche">←</Link>
            {!thisWeek ? <Link href="/plan" className={buttonClass()}>Diese Woche</Link> : null}
            <Link href={`/plan?woche=${addDays(weekStart, 7)}`} className={buttonClass()} aria-label="Nächste Woche">→</Link>
          </div>
        }
      />

      {recipes.length === 0 ? (
        <Card className="p-6 text-sm">
          Zum Planen braucht es erst Rezepte.{' '}
          <Link href="/rezepte/neu" className="text-accent underline underline-offset-2">
            Erstes Rezept anlegen
          </Link>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {plan.days.map((day, dayIndex) => {
              const isToday = day.date === today;
              return (
                <Card
                  key={day.date}
                  className={`flex flex-col p-3 ${isToday ? 'border-accent ring-1 ring-accent' : ''}`}
                >
                  <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
                    {day.weekday}
                    <span className="font-normal text-muted">{formatDateShort(day.date)}</span>
                    {isToday ? (
                      <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[0.65rem] font-medium text-accent-ink">
                        heute
                      </span>
                    ) : null}
                  </h2>

                  <ul className="mb-3 flex-1 space-y-2 text-sm">
                    {day.entries.length === 0 ? (
                      <li className="text-muted">nichts geplant</li>
                    ) : day.entries.map((entry) => (
                      <li key={entry.id} className="rounded-lg bg-accent-soft p-2">
                        <div className="text-xs text-muted">{SLOT_LABELS[entry.slot]}</div>
                        <div className="flex items-start gap-1">
                          <span className="flex-1">
                            {entry.recipeSlug ? (
                              <Link href={`/rezepte/${entry.recipeSlug}`} className="font-medium underline-offset-2 hover:underline">
                                {entry.recipeTitle}
                              </Link>
                            ) : entry.freeText}
                            {entry.servings ? (
                              <span className="text-muted"> · {entry.servings} P.</span>
                            ) : null}
                          </span>
                          <form action={deleteMealPlanEntryAction} className="no-print">
                            <input type="hidden" name="id" value={entry.id} />
                            <IconSubmit label="Eintrag entfernen" className="text-muted hover:bg-danger/10 hover:text-danger">
                              ×
                            </IconSubmit>
                          </form>
                        </div>

                        {/* One tap per target day beats a date picker for
                            "actually, let's have that on Thursday". */}
                        <details className="no-print mt-1 text-xs">
                          <summary className="cursor-pointer text-muted marker:content-none hover:text-accent">
                            verschieben
                          </summary>
                          <form action={moveMealPlanEntryAction} className="mt-1.5 flex flex-wrap gap-1">
                            <input type="hidden" name="id" value={entry.id} />
                            {plan.days.map((target, i) => (
                              <button
                                key={target.date}
                                type="submit"
                                name="date"
                                value={target.date}
                                disabled={i === dayIndex}
                                className="size-8 cursor-pointer rounded border border-line text-[0.7rem] hover:border-accent hover:text-accent disabled:opacity-30"
                              >
                                {WEEKDAY_SHORT[i]}
                              </button>
                            ))}
                          </form>
                        </details>
                      </li>
                    ))}
                  </ul>

                  {/* Collapsed by default: seven always-open forms put 21
                      controls on screen before a single meal was planned. */}
                  <div className="no-print border-t border-line pt-2">
                    <Disclosure label="+ einplanen">
                      <form action={setMealPlanEntryAction} className="space-y-1.5">
                        <input type="hidden" name="date" value={day.date} />
                        <select name="slot" defaultValue="abend" aria-label="Mahlzeit" className={`${inputClassCompact} text-xs`}>
                          {MEAL_SLOTS.map((slot) => (
                            <option key={slot} value={slot}>{SLOT_LABELS[slot]}</option>
                          ))}
                        </select>
                        <select name="recipeId" defaultValue="" required aria-label="Rezept" className={`${inputClassCompact} text-xs`}>
                          <option value="">— Rezept wählen —</option>
                          {recipes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                        </select>
                        {/* Leer lassen = Portionszahl des Rezepts. Die Einkaufsliste
                            rechnet später genau auf diesen Wert hoch. */}
                        <input
                          name="servings"
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          placeholder="Portionen"
                          aria-label="Portionen"
                          className={`${inputClassCompact} text-xs`}
                        />
                        <SubmitButton className="w-full !min-h-9 text-xs">Einplanen</SubmitButton>
                      </form>
                    </Disclosure>

                    {/* "Reste" and "Essen gehen" are part of a real week; the
                        data model always allowed them, the UI never did. */}
                    <Disclosure label="+ freier Eintrag" className="mt-1">
                      <form action={setMealPlanEntryAction} className="space-y-1.5">
                        <input type="hidden" name="date" value={day.date} />
                        <select name="slot" defaultValue="abend" aria-label="Mahlzeit" className={`${inputClassCompact} text-xs`}>
                          {MEAL_SLOTS.map((slot) => (
                            <option key={slot} value={slot}>{SLOT_LABELS[slot]}</option>
                          ))}
                        </select>
                        <input
                          name="freeText"
                          required
                          placeholder="z. B. Reste, Essen gehen"
                          aria-label="Eintrag"
                          className={`${inputClassCompact} text-xs`}
                        />
                        <SubmitButton className="w-full !min-h-9 text-xs">Eintragen</SubmitButton>
                      </form>
                    </Disclosure>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="no-print mt-6 flex flex-wrap items-center gap-3 p-4">
            <p className="mr-auto text-sm text-muted">
              {plannedCount === 0
                ? 'Sobald etwas geplant ist, lässt sich daraus eine Einkaufsliste erzeugen.'
                : 'Aus dieser Woche eine Einkaufsliste erzeugen — gleiche Zutaten werden über alle Rezepte hinweg zusammengefasst und nach Warengruppen sortiert.'}
            </p>
            <Link
              href={`/einkaufsliste?woche=${weekStart}`}
              className={buttonClass(plannedCount ? 'primary' : 'secondary')}
            >
              Einkaufsliste erstellen
            </Link>
          </Card>
        </>
      )}
    </>
  );
}
