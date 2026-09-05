-- Device-level eSTAR administrative facts live on the program.
--
-- The official FDA eSTAR's 510(k) Summary, Classification and Labeling pages
-- ask for device facts the platform had no governed home for: the common
-- name, the classification name, the regulation number, the associated
-- product codes and the citation of the Indications for Use attachment. With
-- no column to hold them, every export of the official form left those fields
-- blank unless the caller typed them into the request — user-supplied on each
-- export, never durable, never audited.
--
-- These are facts about the DEVICE, so they belong beside product_name and
-- product_code on regulatory_programs, not in a metadata blob and not on the
-- organization. The device-profile intake writes them; the eSTAR
-- administrative-data projection reads them as governed sources
-- (regulatory_programs.<column>) with per-field provenance.
--
-- regulation_number is TEXT rather than the VARCHAR(50) of product_code: the
-- form takes the 21 CFR citation as free text ("21 CFR 862.1355") and a
-- program may cite more than one. Every column is nullable — a program that
-- has not recorded a fact reports it blank; nothing is guessed.
--
-- One ALTER per column, so the model-vs-migration agreement guard
-- (scripts/ci/check-model-migration-agreement.mjs) sees each column it
-- reconciles. Additive + idempotent: safe to re-run, and safe against an
-- existing table with rows (existing programs simply have NULLs until intake
-- records them).

ALTER TABLE regulatory_programs
  ADD COLUMN IF NOT EXISTS common_name TEXT;

ALTER TABLE regulatory_programs
  ADD COLUMN IF NOT EXISTS classification_name TEXT;

ALTER TABLE regulatory_programs
  ADD COLUMN IF NOT EXISTS regulation_number TEXT;

ALTER TABLE regulatory_programs
  ADD COLUMN IF NOT EXISTS associated_product_codes TEXT;

ALTER TABLE regulatory_programs
  ADD COLUMN IF NOT EXISTS indications_for_use_citation TEXT;
