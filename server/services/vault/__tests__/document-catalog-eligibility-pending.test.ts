/**
 * A version whose text is still being read cannot be cataloged yet (MR-08
 * Stage 3): there is no recorded text for a description to be checked against.
 */
import { describe, expect, it } from 'vitest';
import { catalogableDocument } from '../document-catalog-eligibility';
import type { CatalogDocumentRow } from '../document-catalog-document';

const doc = (status: string) => ({
  id: 'd1', contentHash: 'a'.repeat(64), originalFileAvailable: true,
  catalog: { status, contentHash: 'a'.repeat(64), extractionError: null },
}) as unknown as CatalogDocumentRow;

describe('catalog eligibility', () => {
  it('refuses a version still being read, and says why', () => {
    const out = catalogableDocument(doc('extraction_pending'));
    expect(out).toEqual({ ok: false, refusal: 'The text of this version is still being read, so there is nothing to catalog yet. Ask again once it has been read.' });
  });

  it('still admits a version that was read', () => {
    expect(catalogableDocument(doc('extracted')).ok).toBe(true);
  });
});
