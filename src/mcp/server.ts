import { McpServer } from '@modelcontextprotocol/server';
import {
  CreateRecipeInput, DeleteRecipeInput, GetRecipeInput, ImportFromTextInput, ImportFromUrlInput,
  ListRecipesInput, ScaleRecipeInput, SuggestRecipesInput, UpdateRecipeInput,
} from '@/contracts/recipes';
import {
  AddShoppingItemInput, BuildShoppingListInput, CheckShoppingItemInput,
  DeleteMealPlanEntryInput, GetMealPlanInput, GetShoppingListInput, SetMealPlanEntryInput,
} from '@/contracts/planning';
import * as recipeService from '@/services/recipes';
import * as planService from '@/services/mealplan';
import * as shoppingService from '@/services/shopping';
import * as importService from '@/services/import';
import { ImportFromPhotoToolInput } from '@/services/import';
import { detectMediaType } from '@/lib/photos';
import { renderMealPlan, renderRecipeList, renderRecipeMarkdown, renderShoppingList } from './render';

const VERSION = '0.1.0';

const text = (body: string) => ({ content: [{ type: 'text' as const, text: body }] });
const json = (value: unknown) => text(JSON.stringify(value, null, 2));

export interface McpServerOptions {
  /** Registers only the read-only tools. Driven by CHEFMIND_MCP_READONLY. */
  readOnly?: boolean;
}

/**
 * Builds the ChefMind MCP server.
 *
 * Every tool is a thin wrapper over `@/services/*` — the same functions the web
 * UI calls. This module deliberately imports nothing from `next/*`, so it can be
 * mounted in a route handler today and moved into a standalone process later
 * without touching any logic.
 */
export function createChefMindMcpServer(opts: McpServerOptions = {}): McpServer {
  const server = new McpServer({ name: 'chefmind', version: VERSION });

  // ── Lesen ──────────────────────────────────────────────────────────────────

  server.registerTool('list_recipes', {
    title: 'Rezepte auflisten',
    description: 'Listet und durchsucht die Rezeptsammlung. Die Freitextsuche greift auch auf Zutatennamen zu.',
    inputSchema: ListRecipesInput,
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, async (args) => {
    const result = await recipeService.listRecipes(args);
    return text(renderRecipeList(result.recipes, result.total));
  });

  server.registerTool('get_recipe', {
    title: 'Rezept abrufen',
    description:
      'Ruft ein Rezept ab. Mit "servings" werden alle Mengen direkt auf diese Portionszahl '
      + 'umgerechnet und fertig formatiert zurückgegeben — rechne Mengen niemals selbst um.',
    inputSchema: GetRecipeInput,
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, async (args) => {
    const recipe = await recipeService.getScaledRecipe(args);
    if (!recipe) return text(`Kein Rezept gefunden für "${args.idOrSlug}".`);
    return text(renderRecipeMarkdown(recipe));
  });

  server.registerTool('scale_recipe', {
    title: 'Rezept umrechnen',
    description: 'Rechnet ein Rezept auf eine andere Portionszahl um. Gewürze und Triebmittel '
      + 'skalieren dabei bewusst unterproportional, "Öl zum Braten" gar nicht.',
    inputSchema: ScaleRecipeInput,
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, async (args) => {
    const recipe = await recipeService.getScaledRecipe(args);
    if (!recipe) return text(`Kein Rezept gefunden für "${args.idOrSlug}".`);
    return text(renderRecipeMarkdown(recipe));
  });

  server.registerTool('suggest_recipes', {
    title: 'Rezepte vorschlagen',
    description: 'Schlägt Rezepte vor, die zu den vorhandenen Zutaten, Tags und der verfügbaren Zeit passen.',
    inputSchema: SuggestRecipesInput,
    annotations: { readOnlyHint: true },
  }, async (args) => {
    const { suggestions } = await recipeService.suggestRecipes(args);
    if (!suggestions.length) return text('Keine passenden Rezepte gefunden.');
    const lines = suggestions.map((s) =>
      `- **${s.recipe.title}** (${s.recipe.slug}) — ${Math.round(s.score * 100)} % der Zutaten vorhanden`
      + (s.missing.length ? `, fehlt: ${s.missing.join(', ')}` : ''));
    return text(lines.join('\n'));
  });

  server.registerTool('get_meal_plan', {
    title: 'Wochenplan abrufen',
    description: 'Zeigt den Essensplan einer Woche. Ohne Datum die aktuelle Woche.',
    inputSchema: GetMealPlanInput,
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, async (args) => text(renderMealPlan(await planService.getMealPlan(args))));

  server.registerTool('build_shopping_list', {
    title: 'Einkaufsliste erstellen',
    description:
      'Fasst die Zutaten mehrerer Rezepte oder einer Planwoche zu einer Einkaufsliste zusammen. '
      + 'Gleiche Zutaten werden über Einheiten hinweg addiert (200 g + 0,5 kg = 700 g) und nach '
      + 'Warengruppen sortiert. Mit save=true wird die Liste gespeichert.',
    inputSchema: BuildShoppingListInput,
    annotations: { readOnlyHint: false, idempotentHint: false },
  }, async (args) => {
    if (opts.readOnly && args.save) {
      return text('Der MCP-Server läuft im Nur-Lesen-Modus; die Liste wurde berechnet, aber nicht gespeichert.');
    }
    return text(renderShoppingList(await shoppingService.buildShoppingList(args)));
  });

  server.registerTool('get_shopping_list', {
    title: 'Einkaufsliste abrufen',
    description: 'Zeigt eine gespeicherte Einkaufsliste. Ohne ID die zuletzt erstellte.',
    inputSchema: GetShoppingListInput,
    annotations: { readOnlyHint: true },
  }, async (args) => {
    const list = await shoppingService.getShoppingList(args);
    return text(list ? renderShoppingList(list) : 'Es gibt noch keine gespeicherte Einkaufsliste.');
  });

  if (opts.readOnly) return server;

  // ── Schreiben ──────────────────────────────────────────────────────────────

  server.registerTool('create_recipe', {
    title: 'Rezept anlegen',
    description:
      'Legt ein neues Rezept an. Mengen bitte metrisch und strukturiert angeben: '
      + '{kind:"exact",amount:200,unit:"g"}, {kind:"range",min:2,max:3,unit:"zehe"} oder '
      + '{kind:"toTaste"} für "nach Geschmack".',
    inputSchema: CreateRecipeInput,
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async (args) => {
    const recipe = await recipeService.createRecipe(args);
    return text(`Rezept angelegt: **${recipe.title}** (ID ${recipe.id}, Slug ${recipe.slug}).`);
  });

  server.registerTool('update_recipe', {
    title: 'Rezept ändern',
    description:
      'Ändert ein Rezept. Nur die übergebenen Felder werden angefasst — aber Zutaten, Schritte '
      + 'und Tags werden jeweils komplett ersetzt, nicht ergänzt.',
    inputSchema: UpdateRecipeInput,
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, async (args) => {
    const recipe = await recipeService.updateRecipe(args);
    return text(`Rezept aktualisiert: **${recipe.title}** (${recipe.slug}).`);
  });

  server.registerTool('delete_recipe', {
    title: 'Rezept löschen',
    description: 'Löscht ein Rezept endgültig, samt Zutaten, Schritten und Fotos.',
    inputSchema: DeleteRecipeInput,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  }, async (args) => {
    const { deleted } = await recipeService.deleteRecipe(args.id);
    return text(deleted ? `Rezept ${args.id} gelöscht.` : `Rezept ${args.id} war nicht vorhanden.`);
  });

  server.registerTool('import_recipe_from_url', {
    title: 'Rezept aus URL importieren',
    description:
      'Importiert ein Rezept von einer Webseite. Nutzt zuerst die eingebetteten schema.org-Daten '
      + '(exakt und kostenlos) und fällt nur andernfalls auf die KI zurück. '
      + 'Standardmäßig wird nur ein Entwurf geliefert; save=true speichert direkt.',
    inputSchema: ImportFromUrlInput,
    annotations: { readOnlyHint: false, openWorldHint: true },
  }, async (args) => {
    const result = await importService.importFromUrl(args);
    return text(describeImport(result));
  });

  server.registerTool('import_recipe_text', {
    title: 'Rezept aus Text importieren',
    description: 'Wandelt einen kopierten Rezepttext in ein strukturiertes Rezept um.',
    inputSchema: ImportFromTextInput,
    annotations: { readOnlyHint: false },
  }, async (args) => {
    const result = await importService.importFromText(args);
    return text(describeImport(result));
  });

  server.registerTool('import_recipe_from_photo', {
    title: 'Rezept aus Foto importieren',
    description:
      'Liest ein abfotografiertes Rezept (mode="recipe") oder rekonstruiert ein Rezept aus dem '
      + 'Foto eines fertigen Gerichts (mode="dish"). Rekonstruierte Rezepte werden als KI-erzeugt '
      + 'gekennzeichnet.',
    inputSchema: ImportFromPhotoToolInput,
    annotations: { readOnlyHint: false },
  }, async (args) => {
    const images = args.imagesBase64.map((b64) => {
      const bytes = Buffer.from(b64, 'base64');
      return { bytes, mediaType: detectMediaType(bytes) };
    });
    const result = await importService.importFromPhotos({ ...args, images });
    return text(describeImport(result));
  });

  server.registerTool('set_meal_plan_entry', {
    title: 'Wochenplan-Eintrag setzen',
    description: 'Plant ein Rezept (oder einen freien Text wie "Reste") für einen Tag und eine Mahlzeit ein.',
    inputSchema: SetMealPlanEntryInput,
    annotations: { readOnlyHint: false },
  }, async (args) => {
    const entry = await planService.setMealPlanEntry(args);
    return text(`Eingeplant: ${entry.recipeTitle ?? entry.freeText} am ${entry.date} (${entry.slot}).`);
  });

  server.registerTool('delete_meal_plan_entry', {
    title: 'Wochenplan-Eintrag löschen',
    inputSchema: DeleteMealPlanEntryInput,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  }, async (args) => {
    await planService.deleteMealPlanEntry(args);
    return text(`Eintrag ${args.id} gelöscht.`);
  });

  server.registerTool('add_shopping_item', {
    title: 'Artikel zur Einkaufsliste hinzufügen',
    description: 'Fügt einen Artikel von Hand hinzu, der aus keinem Rezept stammt.',
    inputSchema: AddShoppingItemInput,
    annotations: { readOnlyHint: false },
  }, async (args) => json(await shoppingService.addShoppingItem(args)));

  server.registerTool('check_shopping_item', {
    title: 'Artikel abhaken',
    inputSchema: CheckShoppingItemInput,
    annotations: { readOnlyHint: false, idempotentHint: true },
  }, async (args) => json(await shoppingService.checkShoppingItem(args)));

  return server;
}

function describeImport(result: importService.ImportResult): string {
  const out: string[] = [];

  if (result.recipe) {
    out.push(`Rezept gespeichert: **${result.recipe.title}** (ID ${result.recipe.id}, Slug ${result.recipe.slug}).`);
  } else {
    out.push(`Entwurf erstellt: **${result.draft.title}**. Noch nicht gespeichert — mit save=true speichern.`);
  }

  const method = {
    jsonld: 'strukturierte Daten der Webseite (exakt)',
    'ai-text': 'KI-Auswertung des Textes',
    'ai-photo': 'KI-Auswertung des Fotos',
    parser: 'lokaler Zutatenparser (ohne KI)',
  }[result.method];
  out.push(`_Quelle der Auswertung: ${method}, Konfidenz ${Math.round(result.confidence * 100)} %._`);

  out.push(`\n${result.draft.ingredients.length} Zutaten, ${result.draft.steps.length} Arbeitsschritte, ${result.draft.baseServings} Portionen.`);

  if (result.warnings.length) {
    out.push(`\n**Hinweise:**\n${result.warnings.map((w) => `- ${w}`).join('\n')}`);
  }
  return out.join('\n');
}
