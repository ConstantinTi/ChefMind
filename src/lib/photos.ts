import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, normalize, resolve, sep } from 'node:path';
import { ulid } from 'ulid';
import sharp from 'sharp';
import { formatBytes, MAX_PHOTO_BYTES } from './upload-limits';

// turbopackIgnore keeps Next from statically tracing the whole project into the
// standalone bundle: this path is resolved at runtime from the environment, so
// there is nothing useful for the bundler to follow.
export const UPLOAD_DIR = resolve(/* turbopackIgnore: true */ process.env.CHEFMIND_UPLOAD_DIR ?? './data/uploads');

/** Photos live on the data volume, never in public/ — which is rebuilt into the
 *  Docker image and would wipe every photo on each deploy. */
export interface StoredPhoto {
  storageKey: string;
  thumbKey: string;
  width: number;
  height: number;
}

export async function storePhoto(bytes: Buffer): Promise<StoredPhoto> {
  if (bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new Error(`Bild ist zu groß (max. ${formatBytes(MAX_PHOTO_BYTES)}).`);
  }

  const id = ulid();
  const folder = id.slice(0, 4);
  await mkdir(join(UPLOAD_DIR, folder), { recursive: true });

  const storageKey = join(folder, `${id}.webp`);
  const thumbKey = join(folder, `${id}_thumb.webp`);

  // Exactly two sizes are generated here, which is why Next's image optimizer is
  // switched off: it would add ~40 MB to the runtime for no benefit.
  const image = sharp(bytes, { failOn: 'none' }).rotate();
  const meta = await image.metadata();

  await writeFile(
    join(UPLOAD_DIR, storageKey),
    await image.clone().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 }).toBuffer(),
  );
  await writeFile(
    join(UPLOAD_DIR, thumbKey),
    await image.clone().resize(480, 480, { fit: 'cover' }).webp({ quality: 75 }).toBuffer(),
  );

  return {
    storageKey,
    thumbKey,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
}

/** Reads a stored photo, refusing any key that tries to escape the upload dir. */
export async function readPhoto(key: string): Promise<Buffer> {
  const safe = normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
  const full = resolve(/* turbopackIgnore: true */ UPLOAD_DIR, safe);
  if (!full.startsWith(UPLOAD_DIR + sep)) {
    throw new Error('Ungültiger Bildpfad.');
  }
  return readFile(full);
}

export function detectMediaType(bytes: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (bytes.subarray(0, 3).toString('ascii') === 'GIF') return 'image/gif';
  return 'image/jpeg';
}

/** Removes both rendered sizes. A missing file is not an error — the DB row is
 *  the record of truth, and a half-deleted photo should not block the delete. */
export async function deletePhotoFiles(keys: ReadonlyArray<string | null>): Promise<void> {
  await Promise.all(keys.map(async (key) => {
    if (!key) return;
    const safe = normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
    const full = resolve(/* turbopackIgnore: true */ UPLOAD_DIR, safe);
    if (!full.startsWith(UPLOAD_DIR + sep)) return;
    await rm(full, { force: true });
  }));
}

/**
 * Shrinks an image to something a vision model will actually accept.
 *
 * Two hard reasons, one soft one:
 *
 *  - The API rejects any single image whose base64 payload exceeds 10 MiB. An
 *    11 MB screenshot straight off a phone fails with a raw 400, which is what
 *    the import screen used to show the cook.
 *  - Claude downsamples anything longer than 1568px on its long edge before it
 *    looks at it, so sending more pixels buys literally nothing.
 *  - Fewer pixels means fewer image tokens, so it is also cheaper and faster.
 *
 * `.rotate()` applies the EXIF orientation first. Without it a photo taken in
 * portrait arrives sideways and the model reads a rotated cookbook page.
 *
 * This is separate from the resizing in `storePhoto`: that one keeps a good
 * copy for the recipe page, this one produces a payload for the model.
 */
const VISION_MAX_EDGE = 1568;
/** Well under the API's 10 MiB, so eight of them still fit in one request. */
const VISION_MAX_BASE64 = 3 * 1024 * 1024;

export interface VisionImage {
  base64: string;
  mediaType: 'image/jpeg';
}

export async function prepareForVision(bytes: Buffer): Promise<VisionImage> {
  let edge = VISION_MAX_EDGE;
  let quality = 82;

  // Normally the first pass is already far below the cap. The loop is for the
  // pathological case: a huge, noisy photo that JPEG cannot compress.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const out = await sharp(bytes, { failOn: 'none' })
      .rotate()
      .resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    const base64 = out.toString('base64');
    if (base64.length <= VISION_MAX_BASE64) return { base64, mediaType: 'image/jpeg' };

    quality = Math.max(40, quality - 15);
    edge = Math.round(edge * 0.75);
  }

  throw new Error('Bild lässt sich nicht klein genug rechnen — bitte einen Ausschnitt fotografieren.');
}
