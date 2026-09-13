'use client';

import { useState } from 'react';
import type { Photo } from '@/domain/recipe/types';
import {
  deleteRecipePhotoAction, setHeroPhotoAction, uploadRecipePhotosAction,
} from '@/app/actions';
import { ConfirmSubmit, SubmitButton } from './forms';
import { buttonClass, Card } from './ui';

/*
 * eslint-disable @next/next/no-img-element --
 * Photos are served from the data volume through /media. We generate exactly
 * two sizes at upload time, so next/image would add sharp to the runtime for no
 * benefit; images.unoptimized is set for the same reason.
 */

export function PhotoGallery({ recipeId, slug, photos, heroPhotoId, title }: {
  recipeId: string;
  slug: string;
  photos: Photo[];
  heroPhotoId: string | null;
  title: string;
}) {
  const hero = photos.find((p) => p.id === heroPhotoId) ?? photos[0];
  const [activeId, setActiveId] = useState<string | null>(hero?.id ?? null);
  const [managing, setManaging] = useState(false);

  const active = photos.find((p) => p.id === activeId) ?? hero;

  return (
    <section className="mb-6">
      {active ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={`/media/${active.storageKey}`}
          alt={active.caption ?? title}
          className="max-h-80 w-full rounded-xl object-cover"
        />
      ) : null}

      {photos.length > 1 ? (
        <ul className="no-print mt-2 flex gap-2 overflow-x-auto pb-1">
          {photos.map((photo) => (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => setActiveId(photo.id)}
                aria-label="Bild anzeigen"
                aria-pressed={photo.id === active?.id}
                className={`block cursor-pointer overflow-hidden rounded-lg border-2 transition ${
                  photo.id === active?.id ? 'border-accent' : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/media/${photo.thumbKey ?? photo.storageKey}`}
                  alt=""
                  className="size-16 object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="no-print mt-2">
        {!managing ? (
          <button
            type="button"
            onClick={() => setManaging(true)}
            className="cursor-pointer text-xs text-muted underline-offset-2 hover:text-accent hover:underline"
          >
            {photos.length ? 'Fotos verwalten' : '+ Foto hinzufügen'}
          </button>
        ) : (
          <Card className="space-y-3 p-3">
            <form action={uploadRecipePhotosAction.bind(null, recipeId, slug)} className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="recipe-photos">
                Fotos hinzufügen
              </label>
              <input
                id="recipe-photos"
                name="photos"
                type="file"
                accept="image/*"
                multiple
                required
                className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-line file:bg-card file:px-3 file:py-2 file:text-sm"
              />
              <SubmitButton pendingLabel="Wird hochgeladen…">Hochladen</SubmitButton>
            </form>

            {active ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <span className="mr-auto text-sm text-muted">Ausgewähltes Bild</span>
                {active.id !== heroPhotoId ? (
                  <form action={setHeroPhotoAction.bind(null, recipeId, active.id, slug)}>
                    <SubmitButton>Als Titelbild</SubmitButton>
                  </form>
                ) : (
                  <span className="text-sm text-muted">ist das Titelbild</span>
                )}
                <form action={deleteRecipePhotoAction.bind(null, active.id, slug)}>
                  <ConfirmSubmit
                    label="Bild löschen"
                    confirmLabel="Ja, löschen"
                    question="Bild löschen?"
                  />
                </form>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setManaging(false)}
              className={`${buttonClass('ghost')} w-full`}
            >
              Fertig
            </button>
          </Card>
        )}
      </div>
    </section>
  );
}
