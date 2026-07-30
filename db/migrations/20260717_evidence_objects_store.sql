-- DEPRECATED (2026-08): superseded by the REAL, canonical `evidence_objects`
-- graph table (shared/schema/programs.ts — uuid PK, org-scoped, read by 10+ live
-- services and the pdev evidence attach path). GET /api/evidence-objects
-- (server/routes/evidence-objects.routes.ts) now reads that real store directly,
-- and scripts/seed/ga-demo.d/90-evidence-objects.mjs seeds the demo evidence into
-- it as primary — see docs/architecture/C2C_BLOB_SURFACE_INTEGRATION_AUDIT.md.
-- This blob is retained (non-destructive) but is no longer written by the demo
-- seed nor read by any route. A later migration may DROP it once no environment
-- references it.
--
-- PDEV evidence-object library — the searchable pool the Evidence Picker's
-- `GET /api/evidence-objects` reads to populate its result list. Org-scoped,
-- FK-free, non-destructive. Schema only — demo rows are seeded by
-- scripts/seed/ga-demo.d/90-evidence-objects.mjs against the resolved demo org
-- (a migration must not write tenant rows).
--
-- `id` is UUID-shaped on purpose: the picker feeds the selected row's id into
-- the already-real attach POST (server/services/pdev/pdev-evidence-attach.ts),
-- which resolves it against the canonical `evidence_objects` graph (uuid PK).
-- Keeping this store's id a uuid lets the seed share ids across both tables so
-- search → select → attach resolves end-to-end.
--
-- Follows the FK-free c2c_* convention of db/migrations/20260716_biopharma_specialty.sql.

CREATE TABLE IF NOT EXISTS c2c_evidence_objects (
  id                 UUID    NOT NULL DEFAULT gen_random_uuid(),
  organization_id    INTEGER NOT NULL,
  title              TEXT    NOT NULL,
  evidence_type      TEXT,           -- display "type": study_report | dataset | literature | protocol | ...
  evidence_category  TEXT,           -- display "category": clinical | nonclinical | quality | safety | regulatory
  source             TEXT,           -- display "source": provenance label (lab, registry, journal, repository)
  program_code       TEXT,           -- program context (BX-204 / BX-099 / …) — searchable, not a display key
  code               TEXT,           -- short human ref, e.g. LIT-001 / TR-204-118
  description        TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS c2c_evidence_objects_org_type_idx
  ON c2c_evidence_objects (organization_id, evidence_type);
