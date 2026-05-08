/**
 * Schema sanity checks for the Module 4 preclinical ingestion provenance
 * columns added to `ctd_nonclinical_studies`. Confirms the Drizzle column
 * builders are present and nullable so legacy rows remain valid.
 */

import { describe, it, expect } from 'vitest';
import { ctdNonclinicalStudies } from '../../shared/schema/csr-knowledge-db';

describe('ctdNonclinicalStudies provenance columns', () => {
  it('exposes the four ingestion provenance columns', () => {
    expect(ctdNonclinicalStudies.sourcePdfId).toBeDefined();
    expect(ctdNonclinicalStudies.extractionModel).toBeDefined();
    expect(ctdNonclinicalStudies.extractionConfidence).toBeDefined();
    expect(ctdNonclinicalStudies.extractedAt).toBeDefined();
  });

  it('keeps the provenance columns nullable', () => {
    // Drizzle marks columns notNull via builder; absence here means nullable.
    expect(ctdNonclinicalStudies.sourcePdfId.notNull).toBe(false);
    expect(ctdNonclinicalStudies.extractionModel.notNull).toBe(false);
    expect(ctdNonclinicalStudies.extractionConfidence.notNull).toBe(false);
    expect(ctdNonclinicalStudies.extractedAt.notNull).toBe(false);
  });

  it('maps to the expected snake_case column names', () => {
    expect(ctdNonclinicalStudies.sourcePdfId.name).toBe('source_pdf_id');
    expect(ctdNonclinicalStudies.extractionModel.name).toBe('extraction_model');
    expect(ctdNonclinicalStudies.extractionConfidence.name).toBe('extraction_confidence');
    expect(ctdNonclinicalStudies.extractedAt.name).toBe('extracted_at');
  });
});
