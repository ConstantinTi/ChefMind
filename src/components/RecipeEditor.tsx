'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import type { Recipe } from '@/domain/recipe/types';
import type { Quantity, RoundingRule, ScalingPolicy, Unit } from '@/domain/units/types';
import { PICKER_UNITS, UNITS } from '@/domain/units/units';
import { parseIngredientList } from '@/domain/units/parse';
import { formatQuantity } from '@/domain/units/format';
import { suggestScalingPolicy } from '@/domain/scaling/policy';
import { DEFAULT_HOUSEHOLD_SERVINGS } from '@/domain/recipe/derive';
import {
  categorizeIngredient, CATEGORY_LABELS, GROCERY_CATEGORIES, type GroceryCategory,
} from '@/domain/shopping/categories';
import { createRecipeAction, updateRecipeAction } from '@/app/actions';
import { buttonClass, inputClass, inputClassCompact, Card } from './ui';

type ScalingMode = ScalingPolicy['mode'];

interface IngredientRow {
  key: string;
  groupLabel: string;
  amount: string;
  amountMax: string;
  unit: Unit | '';
  name: string;
  preparation: string;
  note: string;
  toTaste: boolean;
  optional: boolean;
  excludeFromShoppingList: boolean;
  /** 'auto' hands the decision back to the heuristic at save time. */
  scalingMode: ScalingMode | 'auto';
  category: GroceryCategory | 'auto';
  /** Carried through untouched; there is no sensible UI for it yet, and
   *  dropping it on every save would quietly re-round existing recipes. */
  rounding?: RoundingRule;
  /** Set for rows that came from the database, so the policy details of a
   *  stored ingredient survive a round trip through the form. */
  storedScaling?: ScalingPolicy;
}

interface StepRow {
  key: string;
  text: string;
  durationMinutes: string;
  temperatureC: string;
  temperatureMode: string;
  /** Ingredient row keys, not indices — rows move around while editing. */
  ingredientKeys: string[];
}

const SCALING_LABELS: Record<ScalingMode, string> = {
  linear: 'proportional',
  sublinear: 'unterproportional (Gewürze, Hefe)',
  fixed: 'skaliert nicht mit',
  stepped: 'in ganzen Einheiten',
};

const TEMPERATURE_MODES = [
  ['', '—'],
  ['ober_unterhitze', 'Ober-/Unterhitze'],
  ['umluft', 'Umluft'],
  ['grill', 'Grill'],
  ['herd', 'Herd'],
] as const;

let counter = 0;
const nextKey = () => `row-${counter++}`;

function emptyIngredient(): IngredientRow {
  return {
    key: nextKey(), groupLabel: '', amount: '', amountMax: '', unit: '',
    name: '', preparation: '', note: '', toTaste: false, optional: false,
    excludeFromShoppingList: false, scalingMode: 'auto', category: 'auto',
  };
}

function emptyStep(): StepRow {
  return { key: nextKey(), text: '', durationMinutes: '', temperatureC: '', temperatureMode: '', ingredientKeys: [] };
}

function toQuantity(row: IngredientRow): Quantity {
  if (row.toTaste) return { kind: 'toTaste' };
  const unit = row.unit === '' ? null : row.unit;
  const min = parseGermanNumber(row.amount);
  const max = parseGermanNumber(row.amountMax);
  if (min === null) return { kind: 'unquantified' };
  if (max !== null && max !== min) return { kind: 'range', min, max, unit };
  return { kind: 'exact', amount: min, unit };
}

function parseGermanNumber(value: string): number | null {
  const t = value.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function recipeToRows(recipe: Recipe): { ingredients: IngredientRow[]; steps: StepRow[] } {
  const ingredients = recipe.ingredients.map((ing): IngredientRow => {
    const q = ing.quantity;
    return {
      key: nextKey(),
      groupLabel: ing.groupLabel ?? '',
      amount: q.kind === 'range' ? String(q.min) : 'amount' in q ? String(q.amount) : '',
      amountMax: q.kind === 'range' ? String(q.max) : '',
      unit: ('unit' in q ? q.unit : null) ?? '',
      name: ing.name,
      preparation: ing.preparation ?? '',
      note: ing.note ?? '',
      toTaste: q.kind === 'toTaste',
      optional: ing.optional,
      excludeFromShoppingList: ing.excludeFromShoppingList,
      scalingMode: ing.scaling.mode,
      category: ing.category,
      rounding: ing.rounding,
      storedScaling: ing.scaling,
    };
  });

  // Ingredient ids map onto the freshly minted row keys by position.
  const keyByIngredientId = new Map(
    recipe.ingredients.map((ing, i) => [ing.id, ingredients[i]!.key]),
  );

  const steps = recipe.steps.map((s): StepRow => ({
    key: nextKey(),
    text: s.text,
    durationMinutes: s.durationMinutes ? String(s.durationMinutes) : '',
    temperatureC: s.temperatureC ? String(s.temperatureC) : '',
    temperatureMode: s.temperatureMode ?? '',
    ingredientKeys: s.ingredientRefs
      .map((ref) => keyByIngredientId.get(ref.recipeIngredientId))
      .filter((k): k is string => Boolean(k)),
  }));

  return { ingredients, steps };
}

function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item!);
  return next;
}

export function RecipeEditor({ recipe }: { recipe?: Recipe }) {
  const initial = useMemo(
    () => (recipe ? recipeToRows(recipe) : { ingredients: [emptyIngredient()], steps: [emptyStep()] }),
    [recipe],
  );
  const [ingredients, setIngredients] = useState<IngredientRow[]>(initial.ingredients);
  const [steps, setSteps] = useState<StepRow[]>(initial.steps);
  const [rating, setRating] = useState<number | null>(recipe?.rating ?? null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();

  const hasContent = ingredients.some((r) => r.name.trim());

  // Losing twenty minutes of typing to a stray back-swipe is the kind of thing
  // that stops people trusting an app with anything longer than a shopping list.
  useEffect(() => {
    if (!dirty || pending) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);

  function patchIngredient(index: number, patch: Partial<IngredientRow>) {
    setDirty(true);
    setIngredients((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function patchStep(index: number, patch: Partial<StepRow>) {
    setDirty(true);
    setSteps((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  /**
   * Paste-a-list is the single highest-value affordance in a recipe editor:
   * every recipe you already have is a block of text somewhere.
   */
  function importPastedList(block: string) {
    const parsed = parseIngredientList(block);
    if (!parsed.length) return;
    setDirty(true);
    setIngredients((prev) => {
      const kept = prev.filter((r) => r.name.trim());
      return [...kept, ...parsed.map((p): IngredientRow => {
        const q = p.quantity;
        return {
          ...emptyIngredient(),
          amount: q.kind === 'range' ? String(q.min) : 'amount' in q ? String(q.amount) : '',
          amountMax: q.kind === 'range' ? String(q.max) : '',
          unit: ('unit' in q ? q.unit : null) ?? '',
          name: p.name,
          preparation: p.preparation ?? '',
          note: p.note ?? '',
          toTaste: q.kind === 'toTaste',
        };
      })];
    });
  }

  function onSubmit(formData: FormData) {
    setError(null);

    const keptIngredients = ingredients.filter((row) => row.name.trim());
    const indexByKey = new Map(keptIngredients.map((row, i) => [row.key, i]));

    const nutrition = {
      kcal: parseGermanNumber(String(formData.get('kcal') ?? '')),
      protein: parseGermanNumber(String(formData.get('protein') ?? '')),
      carbs: parseGermanNumber(String(formData.get('carbs') ?? '')),
      fat: parseGermanNumber(String(formData.get('fat') ?? '')),
      fiber: parseGermanNumber(String(formData.get('fiber') ?? '')),
    };
    const hasNutrition = Object.values(nutrition).some((v) => v !== null);

    const payload = {
      title: String(formData.get('title') ?? '').trim(),
      subtitle: String(formData.get('subtitle') ?? '') || null,
      description: String(formData.get('description') ?? '') || null,
      baseServings: parseGermanNumber(String(formData.get('baseServings') ?? '')) ?? DEFAULT_HOUSEHOLD_SERVINGS,
      servingUnit: (String(formData.get('servingUnit') ?? 'portion') || 'portion') as
        'portion' | 'stueck' | 'scheibe' | 'glas' | 'liter',
      yieldNote: String(formData.get('yieldNote') ?? '') || null,
      prepMinutes: parseGermanNumber(String(formData.get('prepMinutes') ?? '')),
      cookMinutes: parseGermanNumber(String(formData.get('cookMinutes') ?? '')),
      restMinutes: parseGermanNumber(String(formData.get('restMinutes') ?? '')),
      difficulty: (String(formData.get('difficulty') ?? '') || null) as 'easy' | 'medium' | 'hard' | null,
      precisionMode: formData.get('precisionMode') === 'on' ? 'exact' as const : 'kitchen' as const,
      sourceType: recipe?.sourceType ?? ('own' as const),
      sourceTitle: String(formData.get('sourceTitle') ?? '') || null,
      sourceAuthor: String(formData.get('sourceAuthor') ?? '') || null,
      sourceUrl: String(formData.get('sourceUrl') ?? '') || null,
      sourcePage: String(formData.get('sourcePage') ?? '') || null,
      notes: String(formData.get('notes') ?? '') || null,
      tags: String(formData.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean),
      nutrition: hasNutrition ? nutrition : null,
      rating,

      // Everything below is sent explicitly, including values the form does not
      // show. Omitting them made the service re-derive the scaling policy and
      // grocery category on every save, silently discarding any override — so
      // fixing a typo could change how the recipe scaled.
      ingredients: keptIngredients.map((row) => ({
        groupLabel: row.groupLabel.trim() || null,
        name: row.name.trim(),
        preparation: row.preparation.trim() || null,
        note: row.note.trim() || null,
        quantity: toQuantity(row),
        optional: row.optional,
        excludeFromShoppingList: row.excludeFromShoppingList,
        ...(row.scalingMode === 'auto'
          ? {}
          : { scaling: scalingFor(row) }),
        ...(row.category === 'auto' ? {} : { category: row.category }),
        ...(row.rounding ? { rounding: row.rounding } : {}),
      })),

      steps: steps
        .filter((row) => row.text.trim())
        .map((row) => ({
          text: row.text.trim(),
          durationMinutes: parseGermanNumber(row.durationMinutes),
          temperatureC: parseGermanNumber(row.temperatureC),
          temperatureMode: (row.temperatureMode || null) as
            'ober_unterhitze' | 'umluft' | 'grill' | 'herd' | null,
          ingredientIndices: row.ingredientKeys
            .map((k) => indexByKey.get(k))
            .filter((i): i is number => i !== undefined),
        })),
    };

    if (!payload.title) { setError('Bitte einen Titel angeben.'); return; }
    if (!payload.ingredients.length) { setError('Bitte mindestens eine Zutat angeben.'); return; }

    setDirty(false);
    startTransition(async () => {
      try {
        if (recipe) await updateRecipeAction({ id: recipe.id, patch: payload });
        else await createRecipeAction(payload);
      } catch (err) {
        // redirect() throws by design; only surface anything else.
        if (err && typeof err === 'object' && 'digest' in err
          && String((err as { digest?: string }).digest).startsWith('NEXT_REDIRECT')) throw err;
        setDirty(true);
        setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
      }
    });
  }

  return (
    <form action={onSubmit} onInput={() => setDirty(true)} className="space-y-6 pb-4">
      <Card className="space-y-3 p-4">
        <Field label="Titel" required>
          <input name="title" defaultValue={recipe?.title} required autoComplete="off" className={inputClass} />
        </Field>
        <Field label="Untertitel">
          <input name="subtitle" defaultValue={recipe?.subtitle ?? ''} className={inputClass} />
        </Field>
        <Field label="Beschreibung">
          <textarea name="description" defaultValue={recipe?.description ?? ''} rows={2} className={inputClass} />
        </Field>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Menge" required>
            <input name="baseServings" type="number" min="0.5" step="0.5" inputMode="decimal"
              defaultValue={recipe?.baseServings ?? DEFAULT_HOUSEHOLD_SERVINGS} required className={inputClass} />
          </Field>
          <Field label="Einheit">
            <select name="servingUnit" defaultValue={recipe?.servingUnit ?? 'portion'} className={inputClass}>
              <option value="portion">Portionen</option>
              <option value="stueck">Stück</option>
              <option value="scheibe">Scheiben</option>
              <option value="glas">Gläser</option>
              <option value="liter">Liter</option>
            </select>
          </Field>
          <Field label="Schwierigkeit">
            <select name="difficulty" defaultValue={recipe?.difficulty ?? ''} className={inputClass}>
              <option value="">—</option>
              <option value="easy">einfach</option>
              <option value="medium">mittel</option>
              <option value="hard">anspruchsvoll</option>
            </select>
          </Field>
          <Field label="Ergibt (frei)" hint="z. B. „1 Springform 26 cm“">
            <input name="yieldNote" defaultValue={recipe?.yieldNote ?? ''} className={inputClass} />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Vorbereitung (Min.)">
            <input name="prepMinutes" type="number" min="0" inputMode="numeric"
              defaultValue={recipe?.prepMinutes ?? ''} className={inputClass} />
          </Field>
          <Field label="Kochzeit (Min.)">
            <input name="cookMinutes" type="number" min="0" inputMode="numeric"
              defaultValue={recipe?.cookMinutes ?? ''} className={inputClass} />
          </Field>
          <Field label="Ruhezeit (Min.)">
            <input name="restMinutes" type="number" min="0" inputMode="numeric"
              defaultValue={recipe?.restMinutes ?? ''} className={inputClass} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Tags (kommagetrennt)">
            <input name="tags" defaultValue={recipe?.tags.map((t) => t.name).join(', ')}
              placeholder="Suppe, Herbst, vegetarisch" className={inputClass} />
          </Field>
          <div>
            <span className="mb-1 block text-sm font-medium">Bewertung</span>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  aria-label={`${star} von 5 Sternen`}
                  aria-pressed={rating !== null && star <= rating}
                  onClick={() => { setDirty(true); setRating(star); }}
                  className={`size-10 cursor-pointer rounded text-xl leading-none transition hover:bg-accent-soft ${
                    rating !== null && star <= rating ? 'text-accent' : 'text-muted opacity-40'
                  }`}
                >
                  ★
                </button>
              ))}
              {rating !== null ? (
                <button
                  type="button"
                  onClick={() => { setDirty(true); setRating(null); }}
                  className="ml-1 cursor-pointer text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
                >
                  löschen
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="precisionMode" defaultChecked={recipe?.precisionMode === 'exact'} className="mt-0.5" />
          <span>
            <strong>Exakte Mengen (Backen)</strong>
            <span className="block text-muted">
              Schaltet das Runden auf „glatte“ Zahlen ab. Beim Umrechnen bleibt dann 106,7 g stehen
              statt 105 g — bei Teigen zählt die Hydration.
            </span>
          </span>
        </label>
      </Card>

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold">Zutaten</h2>
          <PasteButton onParsed={importPastedList} prominent={!hasContent} />
        </div>

        <Card className="divide-y divide-line">
          {ingredients.map((row, index) => (
            <IngredientFields
              key={row.key}
              row={row}
              index={index}
              count={ingredients.length}
              onChange={(patch) => patchIngredient(index, patch)}
              onMove={(delta) => { setDirty(true); setIngredients((prev) => move(prev, index, delta)); }}
              onRemove={() => {
                setDirty(true);
                setIngredients((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
                setSteps((prev) => prev.map((s) => ({
                  ...s, ingredientKeys: s.ingredientKeys.filter((k) => k !== row.key),
                })));
              }}
            />
          ))}
        </Card>

        <button type="button" onClick={() => { setDirty(true); setIngredients((p) => [...p, emptyIngredient()]); }}
          className={`${buttonClass()} mt-2`}>
          + Zutat
        </button>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Zubereitung</h2>
        <Card className="divide-y divide-line">
          {steps.map((row, index) => (
            <StepFields
              key={row.key}
              row={row}
              index={index}
              count={steps.length}
              ingredients={ingredients}
              onChange={(patch) => patchStep(index, patch)}
              onMove={(delta) => { setDirty(true); setSteps((prev) => move(prev, index, delta)); }}
              onRemove={() => {
                setDirty(true);
                setSteps((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
              }}
            />
          ))}
        </Card>
        <button type="button" onClick={() => { setDirty(true); setSteps((p) => [...p, emptyStep()]); }}
          className={`${buttonClass()} mt-2`}>
          + Schritt
        </button>
      </section>

      <Collapsible
        title="Nährwerte je Portion"
        subtitle={recipe?.nutrition?.source === 'ai'
          ? 'Von einer KI geschätzt — hier korrigierbar.'
          : 'Optional. Leere Felder heißt: keine Angabe.'}
        defaultOpen={Boolean(recipe?.nutrition)}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {([
            ['kcal', 'Energie (kcal)', recipe?.nutrition?.kcal],
            ['protein', 'Eiweiß (g)', recipe?.nutrition?.protein],
            ['carbs', 'Kohlenhydrate (g)', recipe?.nutrition?.carbs],
            ['fat', 'Fett (g)', recipe?.nutrition?.fat],
            ['fiber', 'Ballaststoffe (g)', recipe?.nutrition?.fiber],
          ] as const).map(([name, label, value]) => (
            <Field key={name} label={label}>
              <input
                name={name}
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                defaultValue={value ?? ''}
                className={inputClass}
              />
            </Field>
          ))}
        </div>
      </Collapsible>

      <Collapsible title="Notizen und Quelle" defaultOpen={Boolean(recipe?.notes || recipe?.sourceTitle)}>
        <Field label="Notizen">
          <textarea name="notes" defaultValue={recipe?.notes ?? ''} rows={3}
            placeholder="Was beim letzten Mal gut lief, Abwandlungen, wem es geschmeckt hat…"
            className={inputClass} />
        </Field>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Quelle">
            <input name="sourceTitle" defaultValue={recipe?.sourceTitle ?? ''}
              placeholder="Kochbuch, Person, Webseite…" className={inputClass} />
          </Field>
          <Field label="Autor / Autorin">
            <input name="sourceAuthor" defaultValue={recipe?.sourceAuthor ?? ''} className={inputClass} />
          </Field>
          <Field label="Quell-URL">
            <input name="sourceUrl" type="url" defaultValue={recipe?.sourceUrl ?? ''} className={inputClass} />
          </Field>
          <Field label="Seite">
            <input name="sourcePage" defaultValue={recipe?.sourcePage ?? ''} placeholder="z. B. 142" className={inputClass} />
          </Field>
        </div>
      </Collapsible>

      {error ? (
        <p role="alert" className="rounded-lg border border-danger/50 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="sticky bottom-16 flex gap-2 border-t border-line bg-paper py-3 md:bottom-0">
        <button type="submit" disabled={pending} className={`${buttonClass('primary')} flex-1 py-3`}>
          {pending ? 'Wird gespeichert…' : recipe ? 'Änderungen speichern' : 'Rezept anlegen'}
        </button>
        <Link href={recipe ? `/rezepte/${recipe.slug}` : '/'} className={buttonClass()}>
          Abbrechen
        </Link>
      </div>
    </form>
  );
}

/** Rebuilds a full policy from the picked mode, keeping any stored detail. */
function scalingFor(row: IngredientRow): ScalingPolicy {
  const mode = row.scalingMode as ScalingMode;
  const stored = row.storedScaling;
  if (stored && stored.mode === mode) return stored;
  const suggestion = suggestScalingPolicy(row.name, row.unit === '' ? null : row.unit).policy;
  return suggestion.mode === mode ? suggestion : { mode };
}

function IngredientFields({ row, index, count, onChange, onMove, onRemove }: {
  row: IngredientRow;
  index: number;
  count: number;
  onChange: (patch: Partial<IngredientRow>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const [showMore, setShowMore] = useState(
    Boolean(row.groupLabel || row.note || row.excludeFromShoppingList),
  );
  const preview = row.name.trim() ? formatQuantity(toQuantity(row)) : '';
  const unit = row.unit === '' ? null : row.unit;
  const autoScaling = suggestScalingPolicy(row.name || 'x', unit).policy.mode;
  const autoCategory = categorizeIngredient(row.name || 'x');

  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={row.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          disabled={row.toTaste}
          placeholder="Menge"
          inputMode="decimal"
          aria-label="Menge"
          className={`${inputClassCompact} w-20`}
        />
        <input
          value={row.amountMax}
          onChange={(e) => onChange({ amountMax: e.target.value })}
          disabled={row.toTaste}
          placeholder="bis"
          inputMode="decimal"
          aria-label="Höchstmenge"
          title="Nur bei Mengenbereichen wie „2–3 Zehen“"
          className={`${inputClassCompact} w-16`}
        />
        <select
          value={row.unit}
          onChange={(e) => onChange({ unit: e.target.value as Unit | '' })}
          disabled={row.toTaste}
          aria-label="Einheit"
          className={`${inputClassCompact} w-28`}
        >
          {/* An empty unit means "3 Eier", not "3 Stück" — the old label said
              "Stück" here and again for the stk unit below it. */}
          <option value="">ohne Einheit</option>
          {PICKER_UNITS.map((u) => (
            <option key={u} value={u}>{UNITS[u].label.abbrev}</option>
          ))}
        </select>
        <input
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Zutat"
          aria-label="Zutat"
          className={`${inputClassCompact} min-w-[10rem] flex-1`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <input
          value={row.preparation}
          onChange={(e) => onChange({ preparation: e.target.value })}
          placeholder="Zubereitung, z. B. fein gewürfelt"
          aria-label="Zubereitung"
          className={`${inputClassCompact} min-w-[11rem] flex-1`}
        />
        <label className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <input type="checkbox" checked={row.toTaste} onChange={(e) => onChange({ toTaste: e.target.checked })} />
          nach Geschmack
        </label>
        <label className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <input type="checkbox" checked={row.optional} onChange={(e) => onChange({ optional: e.target.checked })} />
          optional
        </label>
        {preview ? <span className="text-muted tabular-nums">→ {preview}</span> : null}

        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0}
            aria-label="Nach oben" title="Nach oben"
            className="size-8 cursor-pointer rounded text-muted hover:bg-accent-soft disabled:opacity-30">↑</button>
          <button type="button" onClick={() => onMove(1)} disabled={index === count - 1}
            aria-label="Nach unten" title="Nach unten"
            className="size-8 cursor-pointer rounded text-muted hover:bg-accent-soft disabled:opacity-30">↓</button>
          <button type="button" onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore} aria-label="Weitere Einstellungen"
            className="size-8 cursor-pointer rounded text-muted hover:bg-accent-soft">⋯</button>
          <button type="button" onClick={onRemove}
            aria-label="Zutat entfernen" title="Zutat entfernen"
            className="size-8 cursor-pointer rounded text-muted hover:bg-danger/10 hover:text-danger">×</button>
        </div>
      </div>

      {showMore ? (
        <div className="grid gap-2 rounded-lg bg-accent-soft/40 p-2 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="mb-1 block text-muted">Gruppe</span>
            <input
              value={row.groupLabel}
              onChange={(e) => onChange({ groupLabel: e.target.value })}
              placeholder="z. B. Für den Teig"
              className={inputClassCompact}
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-muted">Hinweis</span>
            <input
              value={row.note}
              onChange={(e) => onChange({ note: e.target.value })}
              placeholder="z. B. zimmerwarm"
              className={inputClassCompact}
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-muted">Beim Umrechnen</span>
            <select
              value={row.scalingMode}
              onChange={(e) => onChange({ scalingMode: e.target.value as ScalingMode | 'auto' })}
              className={inputClassCompact}
            >
              <option value="auto">automatisch ({SCALING_LABELS[autoScaling]})</option>
              {(Object.keys(SCALING_LABELS) as ScalingMode[]).map((mode) => (
                <option key={mode} value={mode}>{SCALING_LABELS[mode]}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-muted">Warengruppe</span>
            <select
              value={row.category}
              onChange={(e) => onChange({ category: e.target.value as GroceryCategory | 'auto' })}
              className={inputClassCompact}
            >
              <option value="auto">automatisch ({CATEGORY_LABELS[autoCategory]})</option>
              {GROCERY_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs sm:col-span-2">
            <input
              type="checkbox"
              checked={row.excludeFromShoppingList}
              onChange={(e) => onChange({ excludeFromShoppingList: e.target.checked })}
            />
            nicht auf die Einkaufsliste (Vorrat)
          </label>
        </div>
      ) : null}
    </div>
  );
}

function StepFields({ row, index, count, ingredients, onChange, onMove, onRemove }: {
  row: StepRow;
  index: number;
  count: number;
  ingredients: IngredientRow[];
  onChange: (patch: Partial<StepRow>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const [showLinks, setShowLinks] = useState(row.ingredientKeys.length > 0);
  const named = ingredients.filter((i) => i.name.trim());

  function toggleIngredient(key: string) {
    onChange({
      ingredientKeys: row.ingredientKeys.includes(key)
        ? row.ingredientKeys.filter((k) => k !== key)
        : [...row.ingredientKeys, key],
    });
  }

  return (
    <div className="flex gap-2 p-3">
      <span className="mt-2 w-6 shrink-0 text-sm text-muted tabular-nums">{index + 1}.</span>
      <div className="flex-1 space-y-2">
        <textarea
          value={row.text}
          onChange={(e) => onChange({ text: e.target.value })}
          rows={2}
          placeholder="Was ist zu tun?"
          aria-label={`Schritt ${index + 1}`}
          className={inputClassCompact}
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={row.durationMinutes}
            onChange={(e) => onChange({ durationMinutes: e.target.value })}
            type="number" min="0" inputMode="numeric" placeholder="Minuten"
            aria-label="Dauer in Minuten"
            className={`${inputClassCompact} w-24`}
          />
          <input
            value={row.temperatureC}
            onChange={(e) => onChange({ temperatureC: e.target.value })}
            type="number" min="0" inputMode="numeric" placeholder="°C"
            aria-label="Temperatur"
            className={`${inputClassCompact} w-20`}
          />
          <select
            value={row.temperatureMode}
            onChange={(e) => onChange({ temperatureMode: e.target.value })}
            aria-label="Hitzeart"
            className={`${inputClassCompact} w-40`}
          >
            {TEMPERATURE_MODES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-0.5">
            <button type="button" onClick={() => onMove(-1)} disabled={index === 0}
              aria-label="Nach oben" className="size-8 cursor-pointer rounded text-muted hover:bg-accent-soft disabled:opacity-30">↑</button>
            <button type="button" onClick={() => onMove(1)} disabled={index === count - 1}
              aria-label="Nach unten" className="size-8 cursor-pointer rounded text-muted hover:bg-accent-soft disabled:opacity-30">↓</button>
            <button type="button" onClick={onRemove}
              aria-label="Schritt entfernen" className="size-8 cursor-pointer rounded text-muted hover:bg-danger/10 hover:text-danger">×</button>
          </div>
        </div>

        {/* Which ingredients a step uses. Cooking mode pins exactly these next
            to the step; without them that panel was empty for every recipe. */}
        {named.length ? (
          <div className="text-xs">
            <button
              type="button"
              onClick={() => setShowLinks((v) => !v)}
              aria-expanded={showLinks}
              className="cursor-pointer text-muted underline-offset-2 hover:text-accent hover:underline"
            >
              Zutaten für diesen Schritt
              {row.ingredientKeys.length ? ` (${row.ingredientKeys.length})` : ''}
            </button>
            {showLinks ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {named.map((ing) => {
                  const on = row.ingredientKeys.includes(ing.key);
                  return (
                    <button
                      key={ing.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleIngredient(ing.key)}
                      className={`cursor-pointer rounded-full border px-2.5 py-1 transition ${
                        on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:border-accent'
                      }`}
                    >
                      {on ? '✓ ' : ''}{ing.name.trim()}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PasteButton({ onParsed, prominent }: { onParsed: (block: string) => void; prominent?: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass(prominent ? 'primary' : 'secondary')}>
        Zutatenliste einfügen
      </button>
    );
  }

  return (
    <div className="w-full">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        autoFocus
        aria-label="Zutatenliste"
        placeholder={'Eine Zutat pro Zeile, z. B.\n200 g Mehl\n2-3 EL Olivenöl, kaltgepresst\nSalz nach Geschmack'}
        className={`${inputClass} font-mono text-xs`}
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className={buttonClass('primary')}
          onClick={() => { onParsed(value); setValue(''); setOpen(false); }}
        >
          Übernehmen
        </button>
        <button type="button" className={buttonClass()} onClick={() => { setOpen(false); setValue(''); }}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

function Collapsible({ title, subtitle, children, defaultOpen }: {
  title: string; subtitle?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <details open={defaultOpen}>
        <summary className="cursor-pointer list-none p-4 text-lg font-semibold marker:content-none">
          {title}
          {subtitle ? <span className="block text-sm font-normal text-muted">{subtitle}</span> : null}
        </summary>
        <div className="border-t border-line p-4">{children}</div>
      </details>
    </Card>
  );
}

function Field({ label, children, required, hint }: {
  label: string; children: React.ReactNode; required?: boolean; hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">
        {label}{required ? <span className="text-accent"> *</span> : null}
      </span>
      {hint ? <span className="mb-1 block text-xs text-muted">{hint}</span> : null}
      {children}
    </label>
  );
}
