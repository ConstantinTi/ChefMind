import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { photos, recipes } from '@/db/schema';
import { deletePhotoFiles, storePhoto } from '@/lib/photos';

/**
 * Recipe photos.
 *
 * Photos arrived only through the import pipeline before this, which meant a
 * recipe typed in by hand could never have a picture — and a badly framed
 * import photo could never be replaced.
 */

const MAX_PHOTOS = 12;

export async function addRecipePhotos(recipeId: string, images: readonly Buffer[]) {
  if (!images.length) return { added: 0 };

  const [recipe] = await db.select({ id: recipes.id, heroPhotoId: recipes.heroPhotoId })
    .from(recipes).where(eq(recipes.id, recipeId)).limit(1);
  if (!recipe) throw new Error(`Rezept nicht gefunden: ${recipeId}`);

  const existing = await db.select({ id: photos.id, sortOrder: photos.sortOrder })
    .from(photos).where(eq(photos.recipeId, recipeId));
  if (existing.length + images.length > MAX_PHOTOS) {
    throw new Error(`Höchstens ${MAX_PHOTOS} Bilder pro Rezept.`);
  }

  const nextOrder = existing.reduce((max, p) => Math.max(max, p.sortOrder + 1), 0);
  const stored = [];
  for (const bytes of images) stored.push(await storePhoto(bytes));

  const inserted = await db.insert(photos).values(
    stored.map((p, i) => ({
      recipeId,
      storageKey: p.storageKey,
      thumbKey: p.thumbKey,
      width: p.width,
      height: p.height,
      sortOrder: nextOrder + i,
    })),
  ).returning({ id: photos.id });

  // The first photo a recipe gets becomes its face, without asking.
  if (!recipe.heroPhotoId && inserted[0]) {
    await db.update(recipes).set({ heroPhotoId: inserted[0].id }).where(eq(recipes.id, recipeId));
  }

  return { added: inserted.length };
}

export async function setHeroPhoto(recipeId: string, photoId: string) {
  const [photo] = await db.select().from(photos).where(eq(photos.id, photoId)).limit(1);
  if (!photo || photo.recipeId !== recipeId) throw new Error('Bild gehört nicht zu diesem Rezept.');
  await db.update(recipes).set({ heroPhotoId: photoId }).where(eq(recipes.id, recipeId));
  return { heroPhotoId: photoId };
}

export async function deleteRecipePhoto(photoId: string) {
  const [photo] = await db.select().from(photos).where(eq(photos.id, photoId)).limit(1);
  if (!photo) return { deleted: false };

  await db.delete(photos).where(eq(photos.id, photoId));

  // Promote the next photo rather than leaving the recipe suddenly faceless.
  const [recipe] = await db.select({ heroPhotoId: recipes.heroPhotoId })
    .from(recipes).where(eq(recipes.id, photo.recipeId)).limit(1);
  if (recipe?.heroPhotoId === photoId) {
    const [next] = await db.select({ id: photos.id }).from(photos)
      .where(eq(photos.recipeId, photo.recipeId)).orderBy(asc(photos.sortOrder)).limit(1);
    await db.update(recipes).set({ heroPhotoId: next?.id ?? null })
      .where(eq(recipes.id, photo.recipeId));
  }

  await deletePhotoFiles([photo.storageKey, photo.thumbKey]);
  return { deleted: true };
}
