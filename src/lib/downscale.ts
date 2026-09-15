/**
 * Shrinks a picture in the browser before it is uploaded.
 *
 * A phone photo is 2–12 MB. Both destinations shrink it again server-side
 * anyway — `storePhoto` renders a 1600px webp for the recipe page, and
 * `prepareForVision` renders a 1568px JPEG for the model — so sending the
 * original over the kitchen WLAN buys nothing and costs the upload.
 *
 * Deliberately importless: this runs in Client Components, so it must not drag
 * `sharp` or anything from `node:` into the browser bundle.
 *
 * Every failure path returns the original file. A slow upload beats a broken
 * one, and the server-side limits still apply either way.
 */

/** Claude downsamples past this on the long edge, and 1600px is what we store. */
const MAX_EDGE = 1600;
/** Below this, a re-encode would cost quality for no meaningful saving. */
const KEEP_AS_IS_BYTES = 1_500_000;

export async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  try {
    // `from-image` applies the EXIF rotation, so a portrait photo does not end
    // up sideways — in the gallery or in front of the model.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_EDGE / longest);

    if (scale === 1 && file.size <= KEEP_AS_IS_BYTES) {
      bitmap.close();
      return file;
    }

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
    });
    // A re-encode that got bigger is not a win.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
  } catch {
    // Safari on an exotic format, a canvas that refuses, a HEIC the browser
    // cannot decode — send the original and let the server decide.
    return file;
  }
}

/** Shrinks a whole selection, keeping order. */
export function downscaleAll(files: readonly File[]): Promise<File[]> {
  return Promise.all(files.map(downscaleImage));
}
