# DOCX persisted-target fidelity — W3 / D4

Canonical branch: concept2cure-v2. Starting published commit: 7111deff00bc17e0b3aefeccfa40a16975ccc74a.
Evidence date: 2026-10-09 UTC. This is a bounded authoring repair, not full IND or commercial release qualification.

## Result

The existing verify_docx_against_source tool can compare a tenant-workspace DOCX
against server-loaded current artifact/version text by supplying the external
artifact_id and version_number together. It never writes an artifact, version,
disposition or signature. The tool registry and UI are unchanged; only the
existing tool's optional input schema and backend implementation change.

Tenant and project come from server ToolContext. Numeric projects require owned
membership and agreement with any populated numeric projectRef. The v2 UUID
program path uses canonical program membership and readProgramAnchorRow with
requireUnique:true, followed by integer project membership. Foreign, deleted,
missing or ambiguous targets refuse. A model input project_id cannot override
that context.

The target query joins artifact/version by both internal identity and tenant,
requires the selected version to be the current head, compares exact head and
version text, and recomputes both stored hashes. It reuses artifactDataEligibleSql
for document disposition and recorded upload ancestry: remove_data/supersede
refuse, while keep_data can retain text for this comparison. An explicitly
supplied missing/malformed selector cannot fall back to caller text. Optional
expected_text must equal the saved reference exactly when selectors are used.

After extraction and comparison, the verifier repeats project/anchor ownership,
target identity, exact bytes, hashes, current-head and disposition checks. A
replacement version row with the same text/hash still refuses. Database and
extractor failures return structured unavailable results without driver details
or a usable target proof. There are no locks held across extraction. This is a
checked snapshot; an eventual consumer must validate current state again.

The result binds organization/project, artifact PK/external ID, version PK/number,
saved content SHA-256, DOCX SHA-256/byte count, extracted text SHA-256 and comparison
text SHA-256. The DOCX digest covers the same buffer supplied to extraction.
Exact text matches use an allocation-free comparison; unequal text uses the
canonical diff with at most 1,000,000 LCS matrix cells including boundaries.
Larger mismatches explicitly refuse instead of attempting a quadratic matrix.
Section-summary heuristics remain diagnostic and cannot override flat fidelity;
duplicate heading keys therefore cannot falsely fail an exact match. File reading
and extraction memory are not capped by this line-diff guard.

Every result scopes its claim: persisted_artifact_fidelity, caller_text_fidelity
or required_strings_only. sourceVerified:false, sourceQualification:unassessed
and sealEligible:false remain explicit. A required-string check cannot establish
source fidelity. The existing seal scope guard refuses a copied full result.
There is still an unauthenticated legacy ok-only seal path when callers omit
scope/qualifiers; this delivery does not close it or claim source qualification.

The existing turn recorder captures the full tool result before model budgeting
in the existing tenant-scoped immutable record/blob and chained-audit path. No
parallel receipt registry, record writer or consumer was added. Selected existing
turn-record regression tests cover that recorder; this delivery does not claim
a live model/OCR or authenticated sealing end-to-end qualification.

## Evidence and qualification

Production and test blobs are pinned in source-pins.json. No new dependency or
client file changed. Client tree remains f4a50c306387585250e354c68e08a099362e3823.

focused-red.txt/json records the natural pre-implementation failure: 66 failed,
6 passed across 72 tests. bridge-red.txt/json records 12 intended UUID bridge
failures. diff-red.txt/json contains six intended behavior failures and one
incorrect test-fixture assertion; the duplicate-heading fixture was corrected
before green qualification and that assertion is not counted as a production
defect. These are actual registered-handler tests with real tenant-workspace
DOCX ZIP bytes, PGlite SQL and the actual disposition migration. The OCR extractor
is controlled to induce drift/failures; this does not qualify the extraction
engine or scientific source review.

Final focused verification passed 184 tests across 5 files (87 new target cases).
The broader selection passed 1,171 tests across 51 files with no failures or skips;
regression-summary.json and selected-tests.json pin the command and denominator.
Build passed. Final forced lint and full pre-push results are recorded
beside this file. lint-baseline.json versus lint-results.json establishes
no warning growth; the new service and changed tests have zero warnings/errors.
Native incremental cache preparation is documented under typecheck-memory/;
the unchanged canonical pre-push compiler determines the TypeScript verdict.
The full pre-push hook passed in 70.709 seconds. Its actual tsc process exited
0 with zero errors against the zero-error baseline. qualification.json consolidates
the verdict and frozen source blobs.
The initial full hook refused the static canonical disposition SQL fragment.
SQL_PREDICATE_REVIEW.md records the independent review and one explicit SQL
ratchet baseline allowance; hook/checker implementations remain unchanged.

PRIOR_REMOTE_CI.json records the checked 7111deff remote results: browser smoke
stopped at fresh-schema provisioning with missing ana_runs/auth_users tables;
its browser checks were skipped. Semgrep reported five blocking findings outside
this patch. Local success cannot be reported as remote success. New publication
and CI observations are reported in the delivery response; no CI repair outside
this one W3 workstream is included.

## Still open

An authenticated recorded-step consumer and an actual version-bound qualified
source-review contract remain open, as does removal of the legacy unbound seal
verdict. Full IND hierarchy/content alignment, product applicability, therapeutic
and modality depth, evidence/guidance time and representative end-to-end scientific
and model qualification remain open in ANA_IND_COVERAGE_PLAN.md. NEXT_STEP.md
pins the immediate governed-verification follow-up.
