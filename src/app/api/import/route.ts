import { importFromPhotos, importFromText, importFromUrl } from '@/services/import';
import { createRecipe } from '@/services/recipes';
import { detectMediaType } from '@/lib/photos';
import { AiNotConfiguredError } from '@/lib/ai/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vision calls on a multi-page cookbook scan genuinely take a while.
export const maxDuration = 300;

/**
 * One endpoint for all three import paths. Every one of them returns a DRAFT by
 * default — nothing reaches the database until the cook has seen it in the
 * review form and pressed save.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const mode = String(form.get('mode') ?? '');
    const save = form.get('save') === '1';

    if (mode === 'url') {
      const url = String(form.get('url') ?? '').trim();
      if (!url) return bad('Bitte eine Adresse angeben.');
      return Response.json(await importFromUrl({ url, save }));
    }

    if (mode === 'text') {
      const text = String(form.get('text') ?? '').trim();
      if (text.length < 10) return bad('Bitte mehr Text einfügen.');
      return Response.json(await importFromText({
        text,
        title: String(form.get('title') ?? '') || undefined,
        save,
      }));
    }

    if (mode === 'recipe' || mode === 'dish') {
      const files = form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
      if (!files.length) return bad('Bitte mindestens ein Bild auswählen.');
      if (files.length > 8) return bad('Höchstens 8 Bilder auf einmal.');

      const images = await Promise.all(files.map(async (file) => {
        const bytes = Buffer.from(await file.arrayBuffer());
        return { bytes, mediaType: detectMediaType(bytes) };
      }));

      return Response.json(await importFromPhotos({
        images,
        mode,
        hint: String(form.get('hint') ?? '') || undefined,
        save,
      }));
    }

    return bad(`Unbekannter Importmodus: ${mode}`);
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return Response.json({ error: error.message, needsConfig: true }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler beim Import.';
    console.error('[chefmind:import]', error);
    return Response.json({ error: message }, { status: 500 });
  }
}

/** Saves a draft the user has reviewed (and possibly corrected) in the form. */
export async function PUT(request: Request) {
  try {
    const recipe = await createRecipe(await request.json());
    return Response.json({ recipe: { id: recipe.id, slug: recipe.slug, title: recipe.title } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Rezept konnte nicht gespeichert werden.';
    return Response.json({ error: message }, { status: 400 });
  }
}

function bad(message: string) {
  return Response.json({ error: message }, { status: 400 });
}
