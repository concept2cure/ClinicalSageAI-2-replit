import type { CatalogDocumentRow } from './document-catalog.service.js';

type CatalogableDocument = CatalogDocumentRow & { catalog: NonNullable<CatalogDocumentRow['catalog']> };

/** Catalog writes require the original file and a successful recorded extraction. */
export function catalogableDocument(doc: CatalogDocumentRow | null):
  { ok: true; document: CatalogableDocument } | { ok: false; refusal: string } {
  if (!doc) return { ok: false, refusal: "Document not found in your organization's programs." };
  if (doc.originalFileAvailable === false) return {
    ok: false,
    refusal: 'The original file was withdrawn. Its existing extracted data remains available under its recorded disposition; catalog changes require governed review.',
  };
  if (!doc.catalog) return {
    ok: false,
    refusal: 'This document has no catalog record (it predates the catalog, or cataloging was off at ' +
      'ingest), so there is no recorded extraction to verify a read against. Re-ingest it, or ' +
      'read it via the vault surface first.',
  };
  if (doc.catalog.status === 'extraction_failed') return {
    ok: false,
    refusal: `Extraction failed for this document (${doc.catalog.extractionError ?? 'no reason recorded'}), ` +
      'so there is no text to have read. Fix extraction (e.g. re-ingest, or OCR the source) before cataloging.',
  };
  return { ok: true, document: { ...doc, catalog: doc.catalog } };
}

function sourceAvailabilityMessage(originalFileAvailable: boolean | undefined): string {
  return originalFileAvailable === false
    ? 'Original file unavailable; the extracted text is retained under its recorded source identity and SHA-256.'
    : 'Original file available.';
}

export function sourceAvailabilityPresentation(doc: Pick<CatalogDocumentRow, 'originalFileAvailable' | 'disposition'>) {
  return {
    originalFileAvailable: doc.originalFileAvailable !== false,
    disposition: doc.disposition ?? null,
    sourceAvailability: sourceAvailabilityMessage(doc.originalFileAvailable),
  };
}
