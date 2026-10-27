# W1 / D2 — existing preclinical intake and calculation corrections

Status: implemented; 373 integrated tests and application build passed.
Required publication gates and remote state are recorded after they complete.
Base: 1c846bdf6b8ee60988df41cb85adf191f4f6d385.

## What already exists

- server/services/preclinical/fih-dose-engine.ts: existing calculator and
  parser; invalid numeric/text boundaries reproduced by the audit.
- server/services/preclinical/preclinical-extractor.ts: typed PDF extraction
  with an undisclosed 60,000-character cutoff and no common OCR recovery.
- server/services/ocr/extractDocumentText.ts: common extraction, OCR, page
  spans and coverage to reuse.
- server/services/preclinical/preclinical-ingest-service.ts and
  server/routes/preclinical.ts: guarded extraction/persistence and optional
  governed registration; requested bridge failure was returned as success.
- server/services/ana/module2-nonclinical-inputs.ts and
  nonclinical-safety-tool.ts: existing project-source refusals, preserved.
- server/services/toxicology/toxicology-knowledge.ts: existing adapter into the
  canonical dose engine; its returned HED/MRSD values were rounded a second time.

Full discovery, ownership, contracts and acceptance criteria:
docs/design/PRECLINICAL_INTAKE_CORRECTIONS_2026-10-27.md.
The current tree and available deleted-file history were searched before design.

## Corrected behavior

### Dose inputs and calculation

The existing parser accepts one explicit mg/kg or mg/kg/day quantity, optionally
labelled NOAEL = or NOAEL:, including properly grouped decimal and scientific
notation. It refuses negative/malformed values, prose, ranges, inequalities,
unsupported units and unrepresentable numbers. The calculator validates finite
admissible inputs, refuses invalid explicit selections/overrides instead of
silently replacing them, and checks overflow/underflow. Defaults apply only to
omitted optional inputs.

HED/MRSD/MABEL and limiting species/approach selection now retain the unrounded
numeric derivation; this introduces no clinical rounding policy. The toxicology
adapter's returned HED/MRSD use those same values. Existing display formatting
remains separate. Scientific method constants/defaults were not expanded.

### Readable report admission

The existing specialized extractor now uses the common PDF/OCR service and its
automatic OCR budget. No readable text, known partial/unestablished OCR coverage,
or text beyond the supported 60,000-character input budget refuses before any
structured provider call or study insert. It never silently slices a report.
This is a refusal for oversized reports, not completion of long-report
chunking, all-page scientific verification or field-level source anchoring.

### Explicit registration outcomes

The existing ingestion result distinguishes not_requested, registered
(reviewRequired: true), and failed. Extraction remains retained when a requested
registration cannot be confirmed, including pool connection, transaction start,
bridge, audit or commit failure. Only a PostgreSQL COMMIT receipt confirms
registration; a ROLLBACK/missing receipt does not.

The route returns a fixed safe HTTP 500 plus the retained extraction ID when
requested registration is unconfirmed. An uncertain commit does not claim that
nothing was written. Failed rollback discards the connection; release failure
does not erase a confirmed transaction outcome.

Malformed/duplicate governance flags, malformed positive identifiers and missing
trusted tenant/user context refuse before extraction. Expected input failures
have safe 422 responses and coverage metadata where available. Validation-shaped
provider/driver text is not disclosed.

## Verification

Runtime: Node 22.23.4; locked dependencies installed with npm ci; Vitest 4.1.7;
TypeScript 5.6.3. No package/lockfile changes.

| Check | Observed result | Receipt |
| --- | --- | --- |
| Dose regression probes before correction | 20 failed / 20 | dose-red.txt |
| Same probes after correction | 20 passed / 20 | dose-green.txt |
| Extractor regression suite before correction | 16 failed, 6 passed | extraction-red.txt |
| Registration service/route before correction | 62 failed, 12 passed | registration-red.txt |
| Malformed flags and commit-receipt cases before correction | 7 failed, 75 skipped | registration-additional-red.txt |
| Integrated final regression suite | 373 passed, 19 files passed | integrated-tests.txt |
| Targeted changed-file ESLint | Exit 0, no errors or warnings in corrected engine/extractor/ingestion/routes/tests | Recorded command below |
| Whitespace/error check | git diff --check, exit 0 | Lead verification |
| Application build | Exit 0: Vite, server and audit-chain verifier built | build.txt |
| Required pre-push gates | Pending | Post-push verification will record actual outcome |

The integrated suite covers all existing preclinical tests, canonical
toxicology consistency, common intake/OCR budget, route/service failure cases,
existing upload/error containment and the AnA refusal of conversational figures.
Its PGlite loader tests exercise a local WASM database; service/route tests use
database/provider doubles. The earlier sandbox-limited route attempt (listen
EPERM) is excluded from failing-first evidence.

Targeted ESLint ran with --max-warnings=0 on the corrected engine, extractor,
ingestion service, route and their changed test files. The two-line toxicology
adapter edit retains its existing warning set; the canonical pushed-file warning
ratchet is still required before publication.

Full project checks on this 8 GiB host use the repository's existing
memory-bounded full-program TypeScript mode, TYPECHECK_FILES_PER_PROCESS=1000
and TYPECHECK_HEAP_MB=6144, without narrowing roots or changing the zero-error
baseline. No typecheck pass is claimed until every worker and final snapshot
verification complete.

## Scope still open

No UI, launch catalog, feature flag, CMC composition boundary or migration was
changed. The authoritative project study-set decision, rich-field governed
mapping, retained report/version anchors, scientific review/admission, SEND
validator receipts and full preclinical-to-IND journey remain open. AnA's current
project-scientific refusals remain in place. These tests do not establish live
provider performance, deployed browser behavior, scientific qualification,
agency acceptance or release clearance.
