'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buttonClass, inputClass, Card } from './ui';
import { downscaleAll } from '@/lib/downscale';
import { Spinner } from './forms';

type Mode = 'url' | 'recipe' | 'dish' | 'text';

interface ImportResponse {
  recipe?: { id: string; slug: string; title: string } | null;
  method?: string;
  confidence?: number;
  warnings?: string[];
  error?: string;
}

const TABS: Array<{ id: Mode; label: string; hint: string }> = [
  { id: 'url', label: 'Aus URL', hint: 'Liest die strukturierten Daten der Seite — exakt, kostenlos, ohne KI.' },
  { id: 'recipe', label: 'Rezeptfoto', hint: 'Kochbuchseite, Rezeptkarte oder Handschrift abfotografieren.' },
  { id: 'dish', label: 'Foto vom Gericht', hint: 'Die KI erkennt das Gericht und schreibt ein plausibles Rezept dazu.' },
  { id: 'text', label: 'Text einfügen', hint: 'Kopierter Rezepttext aus einer Nachricht oder einem PDF.' },
];

export function ImportForm({ aiConfigured }: { aiConfigured: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('url');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);

  const activeTab = TABS.find((t) => t.id === mode)!;
  const needsAi = mode !== 'url';

  // Object URLs are a real allocation; let them go when they stop being shown.
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  function onFilesChosen(files: FileList | null) {
    setPreviews((old) => {
      old.forEach((url) => URL.revokeObjectURL(url));
      return files ? Array.from(files).map((f) => URL.createObjectURL(f)) : [];
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setResult(null);

    const form = new FormData(event.currentTarget);

    // Replace the raw files with shrunken ones before anything is sent.
    const originals = form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
    if (originals.length) {
      const shrunk = await downscaleAll(originals);
      form.delete('images');
      for (const file of shrunk) form.append('images', file);
    }

    form.set('mode', mode);
    // Always save straight away: the recipe then opens on its own page, which is
    // where the import's warnings now live. A draft that exists only in memory
    // is one refresh from gone.
    form.set('save', '1');

    try {
      const response = await fetch('/api/import', { method: 'POST', body: form });
      const data: ImportResponse = await response.json();
      setResult(data);
      if (data.recipe?.slug) {
        // The warnings are stored on the recipe, so navigating away no longer
        // throws them away — they are waiting on the recipe page.
        router.push(`/rezepte/${data.recipe.slug}`);
        router.refresh();
        return;
      }
    } catch {
      setResult({ error: 'Der Import ist fehlgeschlagen. Läuft der Server noch?' });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Importart" className="flex flex-wrap gap-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={mode === tab.id}
            onClick={() => { setMode(tab.id); setResult(null); onFilesChosen(null); }}
            className={`min-h-11 cursor-pointer rounded-full px-3.5 text-sm transition ${
              mode === tab.id
                ? 'bg-accent text-accent-ink'
                : 'border border-line hover:bg-accent-soft'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted">{activeTab.hint}</p>

      {needsAi && !aiConfigured ? (
        <Card className="border-warn-line bg-warn-bg p-4 text-sm">
          Für diesen Import wird ein KI-Anbieter benötigt. Setze <code>CHEFMIND_AI_PROVIDER</code> und
          den passenden API-Key in <code>.env</code>. Der Import aus einer URL funktioniert auch ohne.
        </Card>
      ) : null}

      <Card className="p-4">
        <form onSubmit={onSubmit} className="space-y-3">
          {mode === 'url' ? (
            <input
              name="url"
              type="url"
              required
              placeholder="https://…"
              aria-label="Adresse der Rezeptseite"
              className={inputClass}
              autoComplete="off"
            />
          ) : null}

          {mode === 'recipe' || mode === 'dish' ? (
            <>
              <input
                name="images"
                type="file"
                accept="image/*"
                /* No `capture` attribute: it forces the camera and hides the
                   gallery, so a photo you had already taken was unreachable. */
                multiple={mode === 'recipe'}
                required
                aria-label="Bilder auswählen"
                onChange={(e) => onFilesChosen(e.target.files)}
                className="block w-full text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border file:border-line file:bg-card file:px-3 file:text-sm"
              />

              {previews.length ? (
                <ul className="flex flex-wrap gap-2">
                  {previews.map((url) => (
                    <li key={url}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="size-20 rounded-lg border border-line object-cover" />
                    </li>
                  ))}
                </ul>
              ) : null}

              {mode === 'recipe' ? (
                <p className="text-xs text-muted">
                  Mehrere Bilder eines Rezepts (z. B. Doppelseite) werden zusammengesetzt.
                </p>
              ) : null}
              <input
                name="hint"
                placeholder="Hinweis, optional — z. B. „Omas Handschrift, Zutaten links“"
                aria-label="Hinweis"
                className={inputClass}
              />
            </>
          ) : null}

          {mode === 'text' ? (
            <>
              <input name="title" placeholder="Titel, optional" aria-label="Titel" className={inputClass} />
              <textarea
                name="text"
                required
                rows={12}
                placeholder="Rezepttext hier einfügen…"
                aria-label="Rezepttext"
                className={`${inputClass} font-mono text-xs`}
              />
            </>
          ) : null}

          <button
            type="submit"
            disabled={busy || (needsAi && !aiConfigured)}
            className={`${buttonClass('primary')} w-full py-3`}
          >
            {busy ? <><Spinner /> Wird ausgewertet…</> : 'Importieren'}
          </button>
        </form>
      </Card>

      {busy && needsAi ? (
        <p className="text-sm text-muted" aria-live="polite">
          Das Bild wird gelesen — bei einer vollen Kochbuchseite dauert das bis zu einer Minute.
        </p>
      ) : null}

      {result?.error ? (
        <Card className="border-danger/50 bg-danger/5 p-4 text-sm" role="alert">
          <strong>Import fehlgeschlagen.</strong>
          <p className="mt-1">{result.error}</p>
        </Card>
      ) : null}
    </div>
  );
}
