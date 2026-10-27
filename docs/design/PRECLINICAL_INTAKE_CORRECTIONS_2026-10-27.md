# Correct existing preclinical intake and calculation boundaries

Workstream W1, launch evidence row D2. Branch: concept2cure-v2.
This first implementation delivery follows the read-only preclinical-to-IND audit
of 1c846bdf6b8ee60988df41cb85adf191f4f6d385. It corrects existing backend
behavior. It does not admit the hidden Nonclinical surface, enable feature flags,
change CMC composition scope, or claim that the complete scientific journey works.

## What already exists

- server/services/preclinical/fih-dose-engine.ts owns the deterministic dose
  parser and calculator. It computes HED/MRSD/MABEL but misreads signed, grouped
  and exponential numbers and accepts invalid calculation parameters. Extend
  that owner and its existing tests; do not create another dose calculator.
- server/services/preclinical/preclinical-extractor.ts owns structured study
  extraction. It uses the basic PDF shim and silently slices text at 60,000
  characters. server/services/ocr/extractDocumentText.ts already owns common
  PDF text/OCR, page spans and extraction coverage. Reuse that service and refuse
  known incomplete or oversized input before requesting structured extraction.
- server/services/preclinical/preclinical-ingest-service.ts persists rich CTD
  study records and optionally invokes preclinical-governed-bridge.ts.
  Registration failure is currently logged but returned as success. Preserve
  retained extraction while explicitly reporting the registration outcome.
- server/routes/preclinical.ts owns the guarded upload endpoint. It has PDF
  byte/malware/size checks and a disabled-by-default flag. Preserve those controls;
  distinguish input refusal, successful extraction and failed requested registration.
- server/services/ana/module2-nonclinical-inputs.ts and
  nonclinical-safety-tool.ts explicitly refuse unrecorded project scientific
  inputs. These refusals stay: no reviewed project study-set loader exists yet.
- shared/schema/nonclinical.ts, nonclinical-service.ts, the governed bridge
  and nonclinical-summary.routes.ts own the existing registry, writes and
  summaries. The store-choice/project mapping, rich-finding transfer, source
  version admission and scientific review require a separate explicit data
  contract. This batch does not infer approved scientific facts from extraction.

Discovery included current routes/services/schema/client/AnA/test/deployment
searches under preclinical, nonclinical, SEND, dose and Module 2 names, plus
git log --all --diff-filter=D over the same names in available branch history.
The source audit and 10 direct calculator probes established the defects; the
implementation adds failing-first regression tests in the existing suites.

## Parallel ownership and interface contract

1. Calculation worker: fih-dose-engine.ts and its existing test file, plus the
   existing toxicology-knowledge.ts adapter's returned HED/MRSD numeric fields
   after its consistency tests exposed downstream re-rounding.
   Support unambiguous standalone mg/kg(/day) numeric forms; reject semantic
   prose, negative and malformed inputs. Validate finite admissible parameters
   and results, with no fabricated fallback for an invalid explicit input.
2. Ingestion worker: only preclinical-ingest-service.ts,
   server/routes/preclinical.ts, and their service/route tests. Return an
   explicit requested-registration outcome, including connection/transaction
   failures. A registry row remains unreviewed/planned, never "approved".
   Missing requested governance context must refuse before extraction.
3. Lead: extractor and extractor tests; existing route error-containment and
   upload-guard fixtures; design/evidence; shared verification,
   commit and publication. The extractor exports
   PreclinicalExtractionInputError with a stable code, safe message and
   optional coverage. Codes: PRECLINICAL_NO_TEXT,
   PRECLINICAL_INCOMPLETE_TEXT, PRECLINICAL_REPORT_TOO_LARGE.
   The route returns a safe 422 response for these typed refusals.

No workers alter shared owners, manifests, migrations, navigation or flags.
The lead alone commits and pushes the integrated tested result.

## Acceptance and evidence

- New regressions visibly fail against the previous implementation and pass
  after the correction.
- Valid existing dose cases and existing workflow tests remain green.
- A retained extraction cannot be reported as successful requested registration
  when the bridge/connect/commit path failed.
- Known partial or unreadable extraction and input above the supported text
  budget do not reach the model and do not produce a study row.
- Common OCR behavior is reused, not reimplemented. Complete extracted text
  is sent unchanged within the supported input budget.
- Build and required repository gates use Node 22. Evidence and exact limits
  are filed under docs/evidence/D2-PRECLINICAL-CORRECTIONS/2026-10-27/.
- No claim of live-provider, deployed-browser, SEND-validator, scientific
  qualification, or complete preclinical-to-IND readiness follows from these tests.
