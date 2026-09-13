import type { ScaledRecipe } from '@/domain/recipe/types';
import type { ShoppingListView } from '@/services/shopping';
import type { MealPlanWeek } from '@/services/mealplan';
import { SLOT_LABELS } from '@/services/mealplan';
import type { RecipeSummary } from '@/services/recipes';

/**
 * Renders for a language model to read.
 *
 * Amounts are already scaled and already formatted here. Models are poor at unit
 * arithmetic and worse at rendering "1.3333 Tassen" — handing them "1 1/3 EL"
 * removes that entire class of error from every conversation.
 */
export function renderRecipeMarkdown(recipe: ScaledRecipe): string {
  const out: string[] = [`# ${recipe.title}`];
  if (recipe.subtitle) out.push(`*${recipe.subtitle}*`);
  if (recipe.description) out.push(recipe.description);

  const facts: string[] = [`**Portionen:** ${formatNumber(recipe.targetServings)}`];
  if (recipe.factor !== 1) {
    facts.push(`(Originalrezept: ${formatNumber(recipe.baseServings)}, Faktor ${formatNumber(recipe.factor)})`);
  }
  if (recipe.totalMinutes) facts.push(`**Zeit:** ${recipe.totalMinutes} Min.`);
  if (recipe.difficulty) facts.push(`**Schwierigkeit:** ${recipe.difficulty}`);
  if (recipe.yieldNote) facts.push(`**Ergibt:** ${recipe.yieldNote}`);
  out.push(facts.join(' · '));

  if (recipe.sourceType === 'ai') {
    out.push('> ⚠️ Dieses Rezept wurde von einer KI aus einem Foto des fertigen Gerichts rekonstruiert und stammt aus keiner Quelle.');
  }

  out.push('## Zutaten');
  let currentGroup: string | null = null;
  for (const ing of recipe.ingredients) {
    if (ing.source.groupLabel !== currentGroup) {
      currentGroup = ing.source.groupLabel;
      if (currentGroup) out.push(`\n**${currentGroup}**`);
    }
    const parts = [ing.display, ing.source.name].filter(Boolean);
    const suffix: string[] = [];
    if (ing.source.preparation) suffix.push(ing.source.preparation);
    if (ing.source.optional) suffix.push('optional');
    if (ing.didNotScale && recipe.factor !== 1) suffix.push('nicht skaliert');
    if (ing.didRound) suffix.push('gerundet');
    out.push(`- ${parts.join(' ')}${suffix.length ? ` _(${suffix.join(', ')})_` : ''}`);
  }

  if (recipe.steps.length) {
    out.push('\n## Zubereitung');
    recipe.steps.forEach((step, i) => {
      const extras: string[] = [];
      if (step.durationMinutes) extras.push(`${step.durationMinutes} Min.`);
      if (step.temperatureC) extras.push(`${step.temperatureC} °C`);
      out.push(`${i + 1}. ${step.text}${extras.length ? ` _(${extras.join(', ')})_` : ''}`);
    });
  }

  if (recipe.nutritionPerServing) {
    const n = recipe.nutritionPerServing;
    const bits = [
      n.kcal != null ? `${Math.round(n.kcal)} kcal` : null,
      n.protein != null ? `${Math.round(n.protein)} g Eiweiß` : null,
      n.carbs != null ? `${Math.round(n.carbs)} g Kohlenhydrate` : null,
      n.fat != null ? `${Math.round(n.fat)} g Fett` : null,
    ].filter(Boolean);
    if (bits.length) {
      out.push(`\n## Nährwerte je Portion\n${bits.join(' · ')}${n.source === 'ai' ? ' _(geschätzt)_' : ''}`);
    }
  }

  if (recipe.notes) out.push(`\n## Notizen\n${recipe.notes}`);
  if (recipe.tags.length) out.push(`\n**Tags:** ${recipe.tags.map((t) => t.name).join(', ')}`);

  const source = [recipe.sourceTitle, recipe.sourceAuthor, recipe.sourceUrl].filter(Boolean);
  if (source.length) out.push(`\n**Quelle:** ${source.join(' — ')}`);

  out.push(`\n_ID: ${recipe.id} · Slug: ${recipe.slug}_`);
  return out.join('\n');
}

export function renderRecipeList(recipes: readonly RecipeSummary[], total: number): string {
  if (!recipes.length) return 'Keine Rezepte gefunden.';
  const lines = recipes.map((r) => {
    const bits = [
      r.totalMinutes ? `${r.totalMinutes} Min.` : null,
      `${formatNumber(r.baseServings)} Portionen`,
      r.tags.length ? r.tags.join(', ') : null,
      r.isFavorite ? '★' : null,
    ].filter(Boolean);
    return `- **${r.title}** (${r.slug}) — ${bits.join(' · ')}`;
  });
  return `${recipes.length} von ${total} Rezepten:\n${lines.join('\n')}`;
}

export function renderShoppingList(list: ShoppingListView): string {
  const out = [`# ${list.name}`];
  if (list.sources.length) {
    out.push(`_Aus ${list.sources.length} Rezept(en)._`);
  }
  if (!list.groups.length) return `${out.join('\n')}\n\nDie Liste ist leer.`;

  for (const group of list.groups) {
    out.push(`\n## ${group.label}`);
    for (const item of group.items) {
      const check = item.checked ? '[x]' : '[ ]';
      const amount = item.display && item.display !== '—' ? ` — ${item.display}` : '';
      out.push(`- ${check} ${item.label}${amount}`);
    }
  }
  if (list.id) out.push(`\n_Listen-ID: ${list.id}_`);
  return out.join('\n');
}

export function renderMealPlan(plan: MealPlanWeek): string {
  const out = [`# Wochenplan ${plan.weekStart} bis ${plan.weekEnd}`];
  for (const day of plan.days) {
    out.push(`\n## ${day.weekday}, ${day.date}`);
    if (!day.entries.length) {
      out.push('_nichts geplant_');
      continue;
    }
    for (const entry of day.entries) {
      const what = entry.recipeTitle ?? entry.freeText ?? '—';
      const servings = entry.servings ? ` (${formatNumber(entry.servings)} Portionen)` : '';
      out.push(`- **${SLOT_LABELS[entry.slot]}:** ${what}${servings}${entry.note ? ` — ${entry.note}` : ''}`);
    }
  }
  return out.join('\n');
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}
