import { readPhoto } from '@/lib/photos';

export const runtime = 'nodejs';

/**
 * Serves uploaded photos off the data volume. They deliberately do not live in
 * public/, which is baked into the Docker image and would be wiped on deploy.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  try {
    const bytes = await readPhoto(path.join('/'));
    return new Response(new Uint8Array(bytes), {
      headers: {
        'content-type': 'image/webp',
        // Storage keys are ULID-based and never reused, so these are immutable.
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('Bild nicht gefunden', { status: 404 });
  }
}
