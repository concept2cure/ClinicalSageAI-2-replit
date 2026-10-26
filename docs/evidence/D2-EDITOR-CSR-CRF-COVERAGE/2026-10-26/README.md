# CSR/CRF coverage completion — local automated evidence

W1 / D2. Design: `docs/design/EDITOR_CSR_CRF_COVERAGE_2026-10-26.md`. Local/Codespaces only; normal direct canonical publication, no deployment/provider/agency calls.

## What already exists

- `server/services/csr/csr-job-runner.ts`: asynchronous CSR persistence/resume and placeholder gate; missing requested output currently passes final completion. Complete that gate against its canonical target list and preserve saved partial output.
- `server/services/csr-builder.ts`: existing operational structure, flattening, section drafting and placeholder detector; not a claim of119-heading editor coverage. `server/routes/csr-builder-routes.ts` validates external selections. No parallel completion owner.
- Its shared §5 template fallback asserts IRB approval, consent and GCP from metadata alone. Existing route/source-origin fixtures and actual draft services will demonstrate that failure before replacing it with explicit missing-source placeholders; no new approval verifier.
- `server/services/authoring/workflow-source-import.ts`: exact retained CSR intake already refuses missing selected output and retains gaps/provenance. Preserve its checks.
- `server/services/study-design/crf-shell.ts`: sole blank CRF projector, currently omitting all safety activities. Complete its existing assessment loop, keeping endpoint/visit identities, explicit unknown-field placeholders and the separate AE scaffold.
- `server/services/authoring/study-design-crf-source.ts`, `ProtocolDevProjections.tsx`, SourceImportDialog and DocumentWorkbench: current saved-study source admission, fingerprint, preview, copy and sole-editor handoff. Reuse unchanged.
- Existing worker, CRF projection and PGlite source-import fixtures will qualify the correction; production changes wait for actual prepatch failures.

Discovery searched CSR/E3/jobs/completeness/output and CRF/case-report/CDASH/safety/projection/import across routes/services/AnA/client/schema/migrations plus matching deleted-name Git history. Historical retired CSR/editor paths are not restored. Full paths/limits and contract are in the design above. Canonical start after normal fast-forward: `a54e56337`. No new screen, API, schema, dependency, tool or model.

## Qualification status

Automated qualification is complete. Original failures and fixture boundaries are retained. Human acceptance is pending; automated checks do not establish clinical/statistical/regulatory validation, filing readiness or full human-operation parity.

## Implemented result

The existing CSR worker checks every requested canonical target for saved nonblank content before completion, preserves valid saved rows on explicit resume, resets stale progress and refuses missing/unsupported work before dependent continuation. Blank rows are retried only by the normal explicit resume. Existing target placeholder refusals and successful continuation remain.

The sole CRF projector retains each recorded safety assessment with actual activity/endpoint/visit identity, including unknown-field placeholders and gaps. The separate generic AE form is not guessed equivalent. Actual HTTP/PGlite preview, create, reopen and changed-source refusal exercise the existing editor intake. The root normalized a trailing blank line in the test file after worker qualification; final combined qualification pins that final test source.

The shared CSR section5 fallback requests ethics-source records rather than inventing approval, consent or compliance. Actual template origin and existing needs-data status are preserved. This fixes deterministic fallback prose; it does not validate live model assertions.

## Verification record

- `regression.json`:283/283 across25 existing/extended suites, no source drift. Worker supplement counts overlap this run and are not additive.
- `lint.json`/`lint-details.json`:8 changed TS files,0errors,8 existing warnings versus8 baseline; no per-rule warning growth. `evidence-lint.json`:new evidence helper has0warnings/errors. Type and lint baselines unchanged.
- `gates.json`:all seven existing editor/UI/size gates pass. `build.json` records the actual build outcome. Normal pre-push owns the final TypeScript check.
- `csr/README.md`, `crf/README.md`, `ethics/README.md` disclose original prepatch failures, retained failed attempts, fixture calibration corrections and final focused receipts. No failures are overwritten or hidden.
- `independent-review.json`:read-only review found stale progress, reproduced/corrected before final qualification; no remaining substantive blocker. This is assistant review, not human acceptance.
- `source-freeze.json`:selected suites, implementation, resolvable static local imports/direct SQL and named build inputs. It is not a full dynamic-import or all-product dependency claim.
- Human checklist now has146 cases, all Not run; four new coverage cases143–146. Existing142 cases remain unchanged. No UI, route, schema, dependency, model or agency action added.

## Practical limits

The worker unit fixture scripts Drizzle persistence; the private-project PGlite test separately proves actual durable SQL state, preserved whole rows and missing-section-only resume. Drafter and dependent continuation are scripted. The CRF route fixture uses real HTTP/JWT/current-access/import and canonical authoring writes over isolated PGlite. No browser, provider, deployment, external study records or agency endpoint was exercised. Safety field specifications, schedule-rule rendering, codelists, standards validation, clinical completeness and human acceptance need their own evidence; none follows from retaining an activity.

## Canonical integration and final qualification

The first source-push attempt ran normal hooks/TypeScript0 after a fetch had exposed a newer canonical tip, then correctly failed non-fast-forward. That needless attempt is retained in `source-push.json`; the publication sequence was corrected with a normal merge and explicit ancestry checks. `canonical-merge.json` records the incoming Account actor-ownership work and identical own8source/test hashes. `merged-regression.json` passes328/28, with matching build/gates.

`source-push-merged.json` again passes every normal hook and TypeScript0 but encounters another canonical update during the push's atomic ref update. `creator-merge.json` records normal integration of duplicate project-creator retirement and a narrowed SQL allowance; no own8source/test bytes changed. A preparation assertion initially encountered two intentionally retired tests. `creator-selection-correction.json` identifies that setup issue, the current replacement tests and the refusal to restore duplicate creators. No suite ran under that failed selection.

Final `creator-regression.json`:492/492 across40 suites, no drift. `creator-gates.json`:all seven editor/UI/size gates pass. `creator-build.json`:build passes, no drift. These counts include the earlier283/25 and328/28 runs and focused worker supplements; do not sum overlapping counts. `creator-qualified-inputs.json` retains the final2885 static local inputs. Type and warning baselines were not increased; incoming canonical SQL allowance was narrowed.

Final normal source publication is recorded separately in `source-publication.json`. The publication helper itself checks fetched canonical ancestry before calling ordinary git push; normal hooks and atomic remote-ref protection remain. The final artifact manifest and read-only verifier prove actual canonical Git blob hashes and complete tracked evidence.

The resume proof invokes the existing worker entry point under an operator fixture. This increment does not add a client retry control. Human cases143–146 explicitly require the operator's isolated fixture; all146 cases remain Not run.

Accepted source publication: `b8469209948e569efbeb841bb8a6d6a6d5d0090c`, original correction `b92136fddaba8e29b9915a1e5d9cb4e233728fd6`. `source-push-final.json` records successful normal canonical push, all hooks and full-program incremental TypeScript0, no source drift. Final evidence publication follows; read-only verification checks actual Git blobs and tracked artifacts, not only local hashes.
