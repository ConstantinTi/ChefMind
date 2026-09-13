'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { buttonClass, Card, PageHeader } from '@/components/ui';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <>
      <PageHeader title="Da ist etwas schiefgelaufen." />
      <Card className="p-6">
        <p className="text-sm">
          Die Seite konnte nicht geladen werden. Meist hilft ein erneuter Versuch.
        </p>
        {/* The message is shown because this runs on a private LAN with one
            user, who is also the person who would otherwise have to go
            spelunking in the server log. */}
        <p className="mt-3 rounded-lg border border-line bg-paper px-3 py-2 font-mono text-xs break-words text-muted">
          {error.message || 'Unbekannter Fehler'}
          {error.digest ? ` (${error.digest})` : ''}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className={buttonClass('primary')}>
            Erneut versuchen
          </button>
          <Link href="/" className={buttonClass()}>Zu den Rezepten</Link>
        </div>
      </Card>
    </>
  );
}
