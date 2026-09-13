'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Recipe } from '@/domain/recipe/types';
import type { Quantity } from '@/domain/units/types';
import { scaleRecipe } from '@/domain/recipe/derive';
import { Badge, buttonClass, TEMPERATURE_MODE_LABELS } from './ui';

/**
 * The portion stepper.
 *
 * Scaling runs entirely in the browser via the pure domain functions — no server
 * round-trip, so the numbers move the instant you tap. Every recalculation
 * starts from the stored base amounts, never from the currently displayed ones,
 * so sliding 4 → 6 → 3 → 4 lands exactly back on the original recipe.
 *
 * The cooking-mode link lives here rather than in the page header because it
 * has to carry the portion count you actually chose. When it sat in the header
 * it always started cooking mode at the recipe's base servings, quietly undoing
 * the scaling you had just done.
 */
export function ServingsScaler({ recipe }: { recipe: Recipe }) {
  const [servings, setServings] = useState(recipe.baseServings);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const scaled = useMemo(() => scaleRecipe(recipe, servings), [recipe, servings]);
  const changed = Math.abs(servings - recipe.baseServings) > 1e-9;

  // Group headings are computed up front rather than by mutating a variable
  // inside the map: render has to be pure, or React may re-run part of the list
  // and put the headings in the wrong places.
  const rows = useMemo(
    () => scaled.ingredients.map((ing, i) => ({
      ing,
      header: ing.source.groupLabel !== (scaled.ingredients[i - 1]?.source.groupLabel ?? null)
        ? ing.source.groupLabel
        : null,
    })),
    [scaled],
  );

  const anyRounded = changed && rows.some(({ ing }) => ing.didRound && ing.exact);
  const anyFixed = changed && rows.some(({ ing }) => ing.didNotScale && ing.scaled.kind !== 'toTaste');

  // Always a whole portion on the buttons; halves stay reachable by typing.
  const adjust = (delta: number) =>
    setServings((s) => Math.max(0.5, Math.round((s + delta) * 100) / 100));

  const setFactor = (factor: number) =>
    setServings(Math.max(0.5, Math.round(recipe.baseServings * factor * 100) / 100));

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <section>
      <div className="mb-5 rounded-xl border border-line bg-card p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => adjust(-1)}
              aria-label="Eine Portion weniger"
              className="size-11 cursor-pointer rounded-lg border border-line text-lg leading-none hover:bg-accent-soft"
            >
              −
            </button>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={servings}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v > 0) setServings(v);
              }}
              aria-label="Portionen"
              className="h-11 w-16 rounded-lg border border-line bg-transparent px-2 text-center text-lg font-semibold tabular-nums focus:border-accent"
            />
            <button
              type="button"
              onClick={() => adjust(1)}
              aria-label="Eine Portion mehr"
              className="size-11 cursor-pointer rounded-lg border border-line text-lg leading-none hover:bg-accent-soft"
            >
              +
            </button>
          </div>

          <div className="text-sm">
            <span className="font-medium">
              {recipe.servingUnit === 'stueck' ? 'Stück' : 'Portionen'}
            </span>
            {/* The original is always visible, so you never lose track of what
                the recipe actually said. */}
            {changed ? (
              <button
                type="button"
                onClick={() => setServings(recipe.baseServings)}
                className="ml-2 cursor-pointer text-muted underline-offset-2 hover:text-ink hover:underline"
              >
                Original: {recipe.baseServings} — zurücksetzen
              </button>
            ) : null}
          </div>

          <Link
            href={`/rezepte/${recipe.slug}/kochen?portionen=${servings}`}
            className={`${buttonClass('primary')} no-print ml-auto`}
          >
            Kochmodus
          </Link>
        </div>

        {/* Doubling a recipe is the common case and deserves one tap. */}
        <div className="no-print mt-2 flex flex-wrap gap-1.5 text-xs">
          {([['½', 0.5], ['¾', 0.75], ['2×', 2], ['3×', 3]] as const).map(([label, factor]) => (
            <button
              key={label}
              type="button"
              onClick={() => setFactor(factor)}
              className="cursor-pointer rounded-full border border-line px-2.5 py-1 text-muted transition hover:border-accent hover:text-accent"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-[minmax(0,20rem)_1fr]">
        <div>
          <h2 className="mb-3 text-lg font-semibold">Zutaten</h2>
          <ul className="space-y-1.5 text-sm">
            {rows.map(({ ing, header }) => {
              const id = ing.source.id;
              const rounded = changed && ing.didRound && ing.exact;
              const fixed = changed && ing.didNotScale && ing.scaled.kind !== 'toTaste';
              const open = expanded.has(id);

              return (
                <li key={id}>
                  {header ? (
                    <h3 className="mt-4 mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                      {header}
                    </h3>
                  ) : null}
                  <div className="flex gap-2">
                    <span className="min-w-[5.5rem] shrink-0 text-right font-medium tabular-nums">
                      {ing.display}
                    </span>
                    <span className="flex-1">
                      {ing.source.name}
                      {ing.source.preparation ? (
                        <span className="text-muted">, {ing.source.preparation}</span>
                      ) : null}
                      {ing.source.note ? (
                        <span className="text-muted"> ({ing.source.note})</span>
                      ) : null}
                      {ing.source.optional ? (
                        <span className="ml-1 text-xs text-muted">optional</span>
                      ) : null}

                      {/* Rounding is reported, never hidden: silently turning
                          4,5 Eier into 5 changes a cake, and the cook should
                          know. A tooltip cannot be hovered on a phone, so this
                          is a real button. */}
                      {rounded || fixed ? (
                        <button
                          type="button"
                          onClick={() => toggle(id)}
                          aria-expanded={open}
                          aria-label={rounded ? 'Gerundet — Details' : 'Skaliert nicht mit — Details'}
                          className="ml-1 cursor-pointer rounded px-1 text-xs text-muted hover:bg-accent-soft hover:text-accent"
                        >
                          {rounded ? '≈' : '⊘'}
                        </button>
                      ) : null}

                      {open ? (
                        <span className="mt-0.5 block text-xs text-muted">
                          {rounded && ing.exact
                            ? `Gerundet. Rechnerisch ${formatExact(ing.exact)}.`
                            : 'Diese Menge skaliert bewusst nicht mit.'}
                        </span>
                      ) : null}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {anyRounded || anyFixed ? (
            <p className="mt-3 text-xs text-muted">
              {anyRounded ? '≈ gerundet. ' : ''}
              {anyFixed ? '⊘ skaliert bewusst nicht mit. ' : ''}
              Antippen zeigt den genauen Wert.
            </p>
          ) : null}

          {scaled.nutritionPerServing ? (
            <div className="mt-6">
              <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
                Nährwerte je Portion
                {scaled.nutritionPerServing.source === 'ai' ? (
                  <Badge tone="warn" title="Von einem Sprachmodell geschätzt, nicht gemessen.">
                    geschätzt
                  </Badge>
                ) : null}
              </h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted">
                {([
                  ['Energie', scaled.nutritionPerServing.kcal, 'kcal'],
                  ['Eiweiß', scaled.nutritionPerServing.protein, 'g'],
                  ['Kohlenhydrate', scaled.nutritionPerServing.carbs, 'g'],
                  ['Fett', scaled.nutritionPerServing.fat, 'g'],
                  ['Ballaststoffe', scaled.nutritionPerServing.fiber, 'g'],
                ] as const).map(([label, value, unit]) =>
                  value == null ? null : (
                    <div key={label} className="flex justify-between gap-2">
                      <dt>{label}</dt>
                      <dd className="tabular-nums">{Math.round(value)} {unit}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          ) : null}
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold">Zubereitung</h2>
          {scaled.steps.length === 0 ? (
            <p className="text-sm text-muted">Für dieses Rezept sind keine Arbeitsschritte hinterlegt.</p>
          ) : (
            <ol className="space-y-4">
              {scaled.steps.map((step, i) => {
                const used = scaled.stepIngredients[step.id] ?? [];
                return (
                  <li key={step.id} className="flex gap-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <p className="leading-relaxed">{step.text}</p>
                      {used.length ? (
                        <p className="mt-1 text-xs text-muted">
                          {used.map((u) => `${u.display} ${u.source.name}`.trim()).join(' · ')}
                        </p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {step.durationMinutes ? <Badge>{step.durationMinutes} Min.</Badge> : null}
                        {step.temperatureC ? (
                          <Badge>
                            {step.temperatureC} °C
                            {step.temperatureMode
                              ? ` ${TEMPERATURE_MODE_LABELS[step.temperatureMode]}`
                              : ''}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {changed ? (
            <p className="mt-6 text-xs text-muted">
              Zeiten und Temperaturen werden bewusst nicht mitskaliert — ein doppelter Braten
              braucht zwar länger, aber nicht um einen berechenbaren Faktor. Bitte selbst prüfen.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function formatExact(q: Quantity): string {
  const n = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  if ('amount' in q) return n(q.amount);
  if ('min' in q && 'max' in q) return `${n(q.min)}–${n(q.max)}`;
  return '';
}
