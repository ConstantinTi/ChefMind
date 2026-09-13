import { ButtonLink, EmptyState, PageHeader } from '@/components/ui';

export const metadata = { title: 'Nicht gefunden' };

export default function NotFound() {
  return (
    <>
      <PageHeader title="Nicht gefunden" />
      <EmptyState
        title="Diese Seite gibt es nicht."
        hint="Vielleicht wurde das Rezept gelöscht oder umbenannt — beim Umbenennen ändert sich die Adresse mit."
        action={<ButtonLink href="/" variant="primary">Zu den Rezepten</ButtonLink>}
      />
    </>
  );
}
