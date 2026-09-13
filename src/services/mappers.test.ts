import { describe, expect, it } from 'vitest';
import type { InferSelectModel } from 'drizzle-orm';
import type { recipes } from '@/db/schema';
import { rowToImportReview } from './mappers';

type RecipeRow = InferSelectModel<typeof recipes>;

function row(patch: Partial<RecipeRow>): RecipeRow {
  return {
    importMethod: null,
    importConfidence: null,
    importWarnings: null,
    importReviewedAt: null,
    ...patch,
  } as RecipeRow;
}

/**
 * The import banner has one job: appear exactly while something still needs a
 * human, and never again afterwards.
 */
describe('rowToImportReview', () => {
  it('reports warnings from an unreviewed import', () => {
    const review = rowToImportReview(row({
      importMethod: 'ai-photo',
      importConfidence: 0.72,
      importWarnings: ['Menge für Basilikum geraten'],
    }));
    expect(review).toEqual({
      method: 'ai-photo',
      confidence: 0.72,
      warnings: ['Menge für Basilikum geraten'],
    });
  });

  it('goes quiet once the cook has marked it reviewed', () => {
    expect(rowToImportReview(row({
      importMethod: 'ai-photo',
      importWarnings: ['Menge für Basilikum geraten'],
      importReviewedAt: new Date(),
    }))).toBeNull();
  });

  it('says nothing for a clean import', () => {
    expect(rowToImportReview(row({ importMethod: 'jsonld', importWarnings: [] }))).toBeNull();
  });

  it('says nothing for a hand-written recipe', () => {
    expect(rowToImportReview(row({}))).toBeNull();
  });
});
