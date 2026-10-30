# Cortex CSR aggregates and retained-evidence authoring

Baseline: `d7f378a4c7f398c7e5bef8460781bce82fe1db61` on
`concept2cure/ClinicalSageAI-2-replit`, branch `concept2cure-v2`.

## Delivered call paths

1. `POST /api/ana-cortex/csr/index` -> `atomizeOrgCsrReports` ->
   `runCsrIndexBatch` -> existing tenant-owned `csr_reports`/`csr_details` ->
   `projectCsrContentEvidenceWithCoverage` -> existing `persistCsrDerivedAtoms`.
   No new database, ingestion service, migration or vector store.
2. `POST /api/ana-cortex/csr/evidence-context` -> request-bound SQL client ->
   `loadCsrAuthoringEvidence` -> existing `readSavedClinicalTables` ->
   section-specific aggregate context and optional exact-cell reconciliation.
3. Existing `POST /api/ana-cortex/chat`, when supplied `context.csrEvidence`,
   follows the same authorized source read before the model call, routes as
   `document_drafting`, and returns source/digest/review-state metadata.
   There is no fallback to an unsourced answer when the selected source fails.

## Ingestion improvements

The previous content projection dropped every object and array, including
recorded aggregate efficacy. The revised projector admits bounded, allowlisted
aggregate records and preserves endpoint, arm/comparator, population, method,
unit, timepoint, effect, interval level, p-value inequality and missingness where
explicitly supplied. It supports camelCase and snake_case source keys, direct
`csr_details.results`/`endpoints` arrays, and adds clinical-pharmacology,
immunogenicity, biomarker and patient-reported-outcome categories.

This is not universal nested-JSON extraction or an SDTM/ADaM parser. Unknown,
patient-level, invalid and oversized candidates are excluded with counted
reasons. Null is not converted to zero, intervals are not assumed to be 95%,
and a p-value is not recomputed or interpreted as proof of significance.
Aggregate identity plus a result/method is required; unknown extensions are
not copied into searchable text. Original source documents are not modified.

Limits: 12,000 characters per value, 200 array records per source field,
500 content atoms and 200,000 source-value characters per projection.
The coverage receipt measures extraction candidates, not ICH E3 completeness.
Unscored extraction uses the required numeric confidence column as 0 with
`confidenceBasis=unscored`, not a fabricated clinical-confidence percentage.
All new content remains unverified and `trainingApproved=false`.

Identifier key/text screening includes nested private markers and the earlier
listing-pattern escaping defect. It is explicitly a **marker screen**, not a
claim of comprehensive de-identification or permission to train a model.

## Resumable indexing

Request:

```json
{"limit":100,"afterId":0}
```

The route derives organization from the authenticated context. The adapter
queries `organization_id`, `deleted_at IS NULL`, `id > afterId`, ordered by ID,
with one-row lookahead. Follow `nextAfterId` while `hasMore` is true. Each report
returns indexed/partial/empty/failed, atom/embedding counts, and coverage.
`indexed` includes reports with some persisted atoms; inspect `partial` and the
per-report status before claiming completeness. Unembedded or excluded data
cannot produce `complete=true`. Failed report IDs remain available for retry;
a cursor is traversal progress, not proof every preceding report succeeded.
An empty corpus has no successful indexing claim (`complete=false`).

## Current-study drafting versus external experience

Current-study facts are **not** taken from organization-wide CSR RAG atoms.
The authoring reader reuses `readSavedClinicalTables`, which authorizes the
current actor's program access, verifies the retained input seal, applies source
disposition rules and reconstructs aggregate tables. It never returns the private
participant input snapshot. Historical evidence is explicitly labeled historical;
source integrity and platform approval do not establish clinical verification.

Example (the UUIDs below are illustrative, not real customer identifiers):

```json
{
  "message":"Draft the efficacy evaluation from the selected retained evidence. Flag missing statistical context.",
  "context": {
    "csrEvidence": {
      "programId":"22222222-2222-4222-8222-222222222222",
      "runId":"11111111-1111-4111-8111-111111111111",
      "studyId":"S-1",
      "sectionNumber":"11.4"
    }
  }
}
```

Only these four selection fields are accepted. Client-supplied tables or tenant
IDs cannot become authoritative evidence. The selected study must resolve
uniquely within the authorized run. Efficacy, population, disposition and safety
sections receive their mapped tables. Unsupported sections (for example 12.5
vital signs, for which this retained-table reader has no table) do not borrow
unrelated safety tables. Context is bounded at 40,000 table characters; oversized
tables are omitted whole with a reason, never cut midway through a result.

Evidence is delivered as quoted data at user-message priority, not elevated to
system instructions. Fixed rules require faithful numeric reporting, source
references, missing-data disclosure and human review. The gateway is bound to
the authenticated organization/user and uses the governed drafting task type.
Scope errors, withdrawn sources, unavailable data and blank model responses
fail closed rather than returning a successful generic answer.

The separate evidence-context route accepts `{ "selection": { ... }, "claims":
[...] }`. Each optional claim is `{ "table":"primaryEfficacy", "row":0,
"column":1, "value":"..." }`, with zero-based row/column indices. Reconciliation
reports exact retained-cell matches, mismatches or unsupported locations. Empty
claims are `not_assessed`. This verifies **transcription consistency only**, not
method appropriateness, estimands, multiplicity, or scientific correctness.

## Validation actually executed

Runtime: Node 22.16.0; TypeScript transpiler 5.8.3.

```sh
node --test tests/cortex/*.test.mjs
```

95 tests passed; 0 failed; 0 skipped:

- 67 pure projection, coverage, source-selection, table-context, reconciliation,
  pagination and error-behavior tests.
- 10 actual CSR adapter integration tests with SQL transport, CRE identity and
  persistence doubles, including tenant/cursor parameters and provenance.
- 18 actual Cortex handler tests with Express registration, source-reader and
  model gateway doubles, including scope rejection, unavailable sources,
  no-model-on-denial, blank output and retained evidence reaching the gateway.

The tests transpile and execute the repository source files. They do not replace
the projection, batch orchestration, evidence reader, context builder, adapter or
route handlers with copies. Boundary doubles are declared in the test headers.

An additional isolated strict TypeScript check passed for the four new/reworked
core modules against the inspected external AtomDraft, SQL-client and retained
reader type contracts. That is not a full-repository `tsc` result. Local runtime
could not clone/install the full repository; full build, Vitest, Playwright,
PostgreSQL/RLS, provider/model and deployed qualification were not executed.

`.github/workflows/cortex-csr-evidence.yml` runs the same behavioral suites on
relevant pushes/PRs and by manual dispatch, using Node 22 and `npm ci` from the
repository lockfile. No dependency or lockfile changes were introduced.

## Remaining limits / release decision

This is a tested integration increment, **not production qualification**.

- Existing editor UI does not yet automatically select a retained run or bind
  `context.csrEvidence`; callers must supply the explicit selection. No new UI,
  editor apply route, automatic save, promotion or approval was introduced.
- The canonical CSR builder's metadata-only `acceptModelDraft` safeguards are
  untouched. This change does not make every full-report build data-complete.
- Exact-cell reconciliation is not automatic semantic verification of every
  generated sentence. A qualified reviewer must still check all conclusions.
- Existing biostatistical model engines are not recomputed by this change;
  retained tabulator output is not relabeled statistically validated.
- Raw PDF/OCR, arbitrary nested objects, SDTM/ADaM/XPT ingestion, all TLFs,
  patient narratives, tables 14-16 and reviewer-feedback learning remain outside
  this increment. No commercial training rights or model fine-tuning is asserted.
- Existing CRE atom delete/insert concurrency, stale atom retirement on removed
  source fields, corpus-wide source withdrawals and full project-level ACL
  enforcement on legacy corpus routes still require separate qualification.
  Current-study authoring deliberately re-reads canonical source receipts rather
  than trusting potentially stale RAG atoms.

Rollback: revert this atomic commit. No schema migration or data conversion is
required. Do not delete retained source documents or historical review records.
