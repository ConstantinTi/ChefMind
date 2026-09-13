import type { Metadata } from 'next';
import { ImportForm } from '@/components/ImportForm';
import { PageHeader } from '@/components/ui';
import { isAiConfigured } from '@/lib/ai/provider';

export const metadata: Metadata = { title: 'Import' };
export const dynamic = 'force-dynamic';

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Rezept importieren"
        subtitle="Aus einer Webseite, von einem Foto oder aus kopiertem Text. Nichts wird überschrieben — jeder Import legt ein neues Rezept an, das du danach bearbeiten kannst."
      />
      <div className="max-w-2xl">
        <ImportForm aiConfigured={isAiConfigured()} />
      </div>
    </>
  );
}
