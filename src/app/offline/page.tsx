import { EmptyState } from '@/components/ui';

export const metadata = { title: 'Offline' };

/**
 * Precached by the service worker, so it must stay static — no DB, no headers,
 * nothing that needs a server to render.
 */
export default function OfflinePage() {
  return (
    <EmptyState
      title="Gerade offline."
      hint="Rezepte, die du schon geöffnet hast, funktionieren weiter. Sobald die Verbindung zurück ist, lädt die Seite normal."
    />
  );
}
