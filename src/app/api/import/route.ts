import { importFromPhotos, importFromText, importFromUrl } from '@/services/import';
import { createRecipe } from '@/services/recipes';
import { detectMediaType } from '@/lib/photos';
import { AiNotConfiguredError } from '@/lib/ai/provider';
import { formatBytes, MAX_PHOTO_BYTES, MAX_UPLOAD_BYTES } from '@/lib/upload-limits';

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
    // Checked before parsing, because past the buffer limit Next hands over a
    // TRUNCATED body rather than failing — and formData() then reports only
    // "Failed to parse body as FormData", which tells the cook nothing.
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_UPLOAD_BYTES) {
      return bad(
        `Der Upload ist zu groß (${formatBytes(declared)}, erlaubt sind `
        + `${formatBytes(MAX_UPLOAD_BYTES)}). Bitte weniger Bilder auf einmal auswählen.`,
        413,
      );
    }

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

      // Same per-picture limit the form checks before uploading. Repeated here
      // because MCP and curl callers never see the form.
      const tooBig = files.find((f) => f.size > MAX_PHOTO_BYTES);
      if (tooBig) {
        return bad(
          `„${tooBig.name}" ist zu groß (${formatBytes(tooBig.size)}, erlaubt sind `
          + `${formatBytes(MAX_PHOTO_BYTES)}). Bitte einen Ausschnitt fotografieren.`,
          413,
        );
      }

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
    console.error('[chefmind:import]', error);
    return Response.json({ error: readableError(error) }, { status: 500 });
  }
}

/**
 * Turns the failures that actually happen into a sentence.
 *
 * A raw provider payload in a red box on a phone is not an error message; it is
 * a stack trace with extra steps.
 */
function readableError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  if (raw.includes('Failed to parse body as FormData')) {
    return 'Der Upload kam unvollständig an. Das passiert bei sehr großen Bildern — '
      + 'bitte weniger Bilder auf einmal auswählen.';
  }
  if (raw.includes('image exceeds') || raw.includes('image.source.base64')) {
    return 'Ein Bild war für den KI-Anbieter zu groß. Bitte erneut versuchen; '
      + 'sollte es wieder auftreten, das Bild vorher zuschneiden.';
  }
  if (raw.includes('unsupported image format') || raw.includes('Input buffer')) {
    return 'Diese Datei konnte nicht als Bild gelesen werden. '
      + 'Unterstützt werden JPEG, PNG, WebP, GIF und HEIC.';
  }
  if (raw.includes('rate_limit') || raw.includes('429')) {
    return 'Der KI-Anbieter drosselt gerade. In ein bis zwei Minuten noch einmal versuchen.';
  }
  if (raw.includes('authentication_error') || raw.includes('401')) {
    return 'Der API-Key wurde abgelehnt. Bitte CHEFMIND_AI_PROVIDER und den Key in .env prüfen.';
  }
  return raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
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

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
