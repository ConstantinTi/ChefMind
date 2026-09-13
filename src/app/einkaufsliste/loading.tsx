import { Card } from '@/components/ui';

/**
 * Scoped to this route on purpose.
 *
 * A `loading.tsx` at the app root wraps every page in a Suspense boundary,
 * which makes Next stream the response — and a streamed response has already
 * sent its 200 by the time `notFound()` runs, so every missing recipe answered
 * 200 instead of 404. This route never calls `notFound()`.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Wird geladen">
      <div className="mb-6 h-8 w-48 animate-pulse rounded-lg bg-line" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Card key={i} className="p-3">
            <div className="h-4 w-24 animate-pulse rounded bg-line" />
            <div className="mt-3 h-3 w-full animate-pulse rounded bg-line" />
            <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-line" />
          </Card>
        ))}
      </div>
    </div>
  );
}
