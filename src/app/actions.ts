'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { CreateRecipeInput, DeleteRecipeInput, UpdateRecipeInput } from '@/contracts/recipes';
import {
  AddShoppingItemInput, BuildShoppingListInput, CheckShoppingItemInput, ClearCheckedItemsInput,
  DeleteMealPlanEntryInput, DeleteShoppingItemInput, DeleteShoppingListInput,
  MoveMealPlanEntryInput, SetMealPlanEntryInput,
} from '@/contracts/planning';
import * as recipeService from '@/services/recipes';
import * as planService from '@/services/mealplan';
import * as shoppingService from '@/services/shopping';
import * as importService from '@/services/import';
import * as photoService from '@/services/photos';
import { fromForm, fromFormWithBooleans } from '@/lib/forms';
import { formatBytes, MAX_PHOTO_BYTES, MAX_UPLOAD_BYTES } from '@/lib/upload-limits';

/**
 * Server actions are thin adapters: validate, call the service, invalidate the
 * cache. All business logic lives in `@/services/*`, which never imports
 * `next/*` — that is what keeps the same code usable from the MCP tools.
 *
 * Anything reached from an unbound `<form action={...}>` receives FormData, not
 * an object, so it goes through `fromForm` first.
 */

export async function createRecipeAction(raw: unknown) {
  const recipe = await recipeService.createRecipe(CreateRecipeInput.parse(raw));
  revalidatePath('/');
  redirect(`/rezepte/${recipe.slug}`);
}

export async function updateRecipeAction(raw: unknown) {
  const recipe = await recipeService.updateRecipe(UpdateRecipeInput.parse(raw));
  revalidatePath('/');
  revalidatePath(`/rezepte/${recipe.slug}`);
  redirect(`/rezepte/${recipe.slug}`);
}

export async function deleteRecipeAction(raw: unknown) {
  await recipeService.deleteRecipe(DeleteRecipeInput.parse(raw).id);
  revalidatePath('/');
  revalidatePath('/plan');
  redirect('/');
}

export async function toggleFavoriteAction(id: string, isFavorite: boolean) {
  await recipeService.updateRecipe({ id, patch: { isFavorite } });
  revalidatePath('/');
}

export async function markImportReviewedAction(id: string, slug: string) {
  await importService.markImportReviewed(id);
  revalidatePath(`/rezepte/${slug}`);
}

// ── Wochenplan ───────────────────────────────────────────────────────────────

export async function setMealPlanEntryAction(raw: unknown) {
  await planService.setMealPlanEntry(SetMealPlanEntryInput.parse(fromForm(raw)));
  revalidatePath('/plan');
  revalidatePath('/einkaufsliste');
}

export async function moveMealPlanEntryAction(raw: unknown) {
  await planService.moveMealPlanEntry(MoveMealPlanEntryInput.parse(fromForm(raw)));
  revalidatePath('/plan');
  revalidatePath('/einkaufsliste');
}

export async function deleteMealPlanEntryAction(raw: unknown) {
  await planService.deleteMealPlanEntry(DeleteMealPlanEntryInput.parse(fromForm(raw)));
  revalidatePath('/plan');
  revalidatePath('/einkaufsliste');
}

// ── Einkaufsliste ────────────────────────────────────────────────────────────

export async function buildShoppingListAction(raw: unknown) {
  const list = await shoppingService.buildShoppingList(BuildShoppingListInput.parse(raw));
  revalidatePath('/einkaufsliste');
  if (list.id) redirect(`/einkaufsliste?liste=${list.id}`);
  return list;
}

export async function addShoppingItemAction(raw: unknown) {
  await shoppingService.addShoppingItem(AddShoppingItemInput.parse(fromForm(raw)));
  revalidatePath('/einkaufsliste');
}

export async function checkShoppingItemAction(raw: unknown) {
  // A checkbox cannot send "false" by being unticked — it sends nothing at all
  // — so the form posts the target state as a string and it is coerced here.
  await shoppingService.checkShoppingItem(
    CheckShoppingItemInput.parse(fromFormWithBooleans(raw, ['checked'])),
  );
  revalidatePath('/einkaufsliste');
}

export async function deleteShoppingItemAction(raw: unknown) {
  await shoppingService.deleteShoppingItem(DeleteShoppingItemInput.parse(fromForm(raw)));
  revalidatePath('/einkaufsliste');
}

export async function clearCheckedItemsAction(raw: unknown) {
  await shoppingService.clearCheckedItems(
    ClearCheckedItemsInput.parse(fromFormWithBooleans(raw, ['restore'])),
  );
  revalidatePath('/einkaufsliste');
}

export async function deleteShoppingListAction(raw: unknown) {
  await shoppingService.deleteShoppingList(DeleteShoppingListInput.parse(fromForm(raw)));
  revalidatePath('/einkaufsliste');
  redirect('/einkaufsliste');
}

// ── Fotos ────────────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export async function uploadRecipePhotosAction(recipeId: string, slug: string, formData: FormData) {
  const files = formData.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return;

  // Der Request ist schon durch Next' bodySizeLimit gekommen, wenn wir hier
  // sind — diese Prüfung sagt nur, was das Formular auch sagt, für alles, was
  // nicht durch das Formular kommt.
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Zusammen ${formatBytes(total)} — pro Upload sind ${formatBytes(MAX_UPLOAD_BYTES)} möglich.`,
    );
  }

  const buffers: Buffer[] = [];
  for (const file of files) {
    // An empty type shows up for HEIC on some Android browsers; sharp sniffs
    // the real format anyway, so only reject types we know we cannot read.
    if (file.type && !ALLOWED_IMAGE_TYPES.includes(file.type)) {
      throw new Error(`Nicht unterstütztes Bildformat: ${file.type}`);
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw new Error(`„${file.name}“ ist zu groß (max. ${formatBytes(MAX_PHOTO_BYTES)}).`);
    }
    buffers.push(Buffer.from(await file.arrayBuffer()));
  }

  await photoService.addRecipePhotos(recipeId, buffers);
  revalidatePath(`/rezepte/${slug}`);
  revalidatePath('/');
}

export async function setHeroPhotoAction(recipeId: string, photoId: string, slug: string) {
  await photoService.setHeroPhoto(recipeId, photoId);
  revalidatePath(`/rezepte/${slug}`);
  revalidatePath('/');
}

export async function deleteRecipePhotoAction(photoId: string, slug: string) {
  await photoService.deleteRecipePhoto(photoId);
  revalidatePath(`/rezepte/${slug}`);
  revalidatePath('/');
}
