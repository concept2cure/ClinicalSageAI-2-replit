# Module 4 Preclinical — Ingestion + Adversarial Review

This document is the implementation contract for the Module 4 (Nonclinical) workstream. The goal of the workstream is to close two gaps that AnA has carried since launch: nonclinical study reports were ingested generically (no NOAEL/LOAEL/GLP structure), and the reviewer simulator had no preclinical lens. Both are addressed here without forking the existing pipeline.

## Surfaces

| Surface | File |
|---|---|
| Schema provenance columns on `ctd_nonclinical_studies` | `shared/schema/csr-knowledge-db.ts` |
| Migration | `migrations/20260508_preclinical_provenance.sql` |
| Feature flags | `server/services/preclinical/feature-flags.ts` |
| Zod extraction schema | `server/services/preclinical/preclinical-extraction-schema.ts` |
| PDF → structured-data extractor | `server/services/preclinical/preclinical-extractor.ts` |
| Ingest service (extractor → DB row) | `server/services/preclinical/preclinical-ingest-service.ts` |
| Intel loader (DB → reviewer facts) | `server/services/preclinical/preclinical-intel-loader.ts` |
| HTTP route | `server/routes/preclinical.ts` |
| Route mount | `server/bootstrap/register-regulatory-routes.ts` |
| Reviewer personas | `server/services/intelligence-engine/reviewer-personas.ts` |
| Simulator wiring | `server/services/intelligence-engine/reviewer-simulator.service.ts` |
| RTF seed patterns | `server/services/regulatory-precedent-intelligence/seeds/nonclinical-rtf-patterns.ts` |
| RTF seed loader | `server/services/regulatory-precedent-intelligence/seeds/seed-nonclinical-rtf.ts` |

## Feature flags

Both flags fail closed. Anything other than the literal string `'true'` is treated as off.

| Flag | What it gates |
|---|---|
| `PRECLINICAL_INGEST_ENABLED` | The `POST /api/preclinical/ingest` route and the `ingestStudy` service. |
| `PRECLINICAL_REVIEWER_ENABLED` | The `loadPreclinicalIntel` DB read used by the reviewer simulator. The persona itself is always registered; when the flag is off it emits an info-level "data not loaded" stub instead of silently skipping. |

## HTTP contract

`POST /api/preclinical/ingest`

Multipart body:

| Field | Type | Required | Notes |
|---|---|---|---|
| `programId` | integer | yes | `ctd_programs.id` |
| `file` | file (PDF) | yes | Single nonclinical study report. 50 MB max, `application/pdf` only. |
| `sourcePdfId` | string | no | Caller-provided handle for provenance. Auto-assigned `pdf-<uuid>` when absent. 64-char max. |

Responses:

| Status | When |
|---|---|
| 200 | `{ success: true, data: { studyId, sourcePdfId, extractionConfidence, model } }` |
| 400 | Missing/invalid `programId` or no file. |
| 422 | LLM output failed Zod validation. |
| 500 | Other server error. |
| 503 | `PRECLINICAL_INGEST_ENABLED` is unset. |

## Schema delta — `ctd_nonclinical_studies`

Four nullable columns added to record where a row came from. Existing manual rows remain valid.

| Column | Type |
|---|---|
| `source_pdf_id` | `varchar(64)` |
| `extraction_model` | `varchar(64)` |
| `extraction_confidence` | `real` (0–1) |
| `extracted_at` | `timestamp` |

Index: `ctd_nonclin_source_pdf_idx` on `source_pdf_id`.

## Adversarial review

Two personas land on the existing reviewer-simulator pipeline:

### `preclinical_toxicologist` — ICH M3(R2) / S2(R1) / S1B

| Trigger | Severity | Citation |
|---|---|---|
| `NC_GLP_PIVOTAL_MISSING` | critical | 21 CFR Part 58 |
| `NC_SPECIES_COVERAGE` | critical | ICH M3(R2) §5 |
| `NC_NOAEL_MARGIN_INSUFFICIENT` (<2×) | critical | FDA 2005 Estimating Safe Starting Dose |
| `NC_NOAEL_MARGIN_INSUFFICIENT` (<10×) | warning | FDA 2005 Estimating Safe Starting Dose |
| `NC_GENOTOX_BATTERY_INCOMPLETE` | critical | ICH S2(R1) |
| `NC_REPRO_TOX_STAGE_MISMATCH` | warning | ICH M3(R2) §11 |
| `NC_CARC_REQUIRED_MISSING` | warning | ICH S1B |

`appliesTo`: any `programType` ∈ `{IND, NDA, BLA}`, or any `productType` ∈ `{drug, biologic, combination}`, or any `developmentStage` ∈ `{preclinical, ind_enabling, phase_1..3}`.

### `glp_auditor` — 21 CFR 58

| Trigger | Severity | Citation |
|---|---|---|
| `NC_TK_DATA_MISSING` | critical | ICH S3A; 21 CFR Part 58 |
| `pivotal_glp_attestation_missing` | warning | 21 CFR 58.185 |

## RTF seed patterns (one-time load per organisation)

Run `seedNonclinicalRtf(organizationId)` once per tenant to populate `regulatory_intel.rtf_trigger_patterns` with the seven nonclinical patterns. The loader is idempotent on `pattern_code`.

```
NC_GLP_PIVOTAL_MISSING
NC_SPECIES_COVERAGE
NC_GENOTOX_BATTERY_INCOMPLETE
NC_NOAEL_MARGIN_INSUFFICIENT
NC_REPRO_TOX_STAGE_MISMATCH
NC_CARC_REQUIRED_MISSING
NC_TK_DATA_MISSING
```

## Determinism

`runReviewerSimulation`'s `inputsHash` is computed over the *resolved* intel — including any nonclinical block loaded via `ctdProgramId`. Two runs with the same DB state and same request produce the same hash; changing any field in the nonclinical fixture changes the hash.

## Known limitations

- **Genotoxicity battery derivation** is a keyword heuristic over `study_title` / `genotoxicity_results` / `key_findings`. Studies that don't mention "Ames", "in vitro", or "in vivo" by name will look incomplete to the persona. Refine when the schema gains an explicit component column.
- **Safety margin** prefers the `safety_margins` JSON column. When that's empty, falls back to `noael / mrhdMgPerKgPerDay` with both expressed as mg/kg/day. Other dosing bases need to be supplied via the simulator request.
- **Pivotal classification** is a `studyType` heuristic. Studies marked exploratory in source data will still be treated as pivotal until a column captures that signal.
- **MRHD source**: must be passed in via `program.mrhdMgPerKgPerDay`. Not pulled from project-charter automatically yet.
- **Background processing**: ingestion is synchronous in the request. Large PDFs may exceed default 2-minute proxy timeouts.
- **Multi-tenant RTF backfill**: seeds are organisation-scoped and need to be loaded once per tenant.

## Verification

```bash
# Run the migration
psql "$DATABASE_URL" -f migrations/20260508_preclinical_provenance.sql

# All test files for this workstream
NODE_OPTIONS="--max-old-space-size=4096" npx vitest run \
  tests/schema/preclinical-schema.test.ts \
  server/services/regulatory-precedent-intelligence/__tests__/nonclinical-seed.test.ts \
  server/services/preclinical/__tests__/preclinical-extractor.test.ts \
  tests/integration/preclinical-ingest.test.ts \
  server/services/intelligence-engine/__tests__/reviewer-personas-preclinical.test.ts \
  server/services/intelligence-engine/__tests__/reviewer-simulator-preclinical.test.ts \
  --config vitest.config.ts

# End-to-end smoke
PRECLINICAL_INGEST_ENABLED=true \
PRECLINICAL_REVIEWER_ENABLED=true \
  npx tsx server/index.ts
curl -F programId=42 -F file=@fixture.pdf http://localhost:5000/api/preclinical/ingest
```
