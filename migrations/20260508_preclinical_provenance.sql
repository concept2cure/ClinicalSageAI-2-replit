-- Preclinical Ingestion Provenance
-- Migration: 20260508_preclinical_provenance.sql
--
-- Adds ingestion provenance columns to ctd_nonclinical_studies so rows
-- produced by the preclinical extractor record their source PDF, the
-- model used, and a confidence score. Nullable so existing rows remain
-- valid.

ALTER TABLE ctd_nonclinical_studies
  ADD COLUMN IF NOT EXISTS source_pdf_id          varchar(64),
  ADD COLUMN IF NOT EXISTS extraction_model       varchar(64),
  ADD COLUMN IF NOT EXISTS extraction_confidence  real,
  ADD COLUMN IF NOT EXISTS extracted_at           timestamp;

CREATE INDEX IF NOT EXISTS ctd_nonclin_source_pdf_idx
  ON ctd_nonclinical_studies (source_pdf_id);
