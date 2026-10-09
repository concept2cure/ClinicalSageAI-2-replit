# Authenticated recorded DOCX fidelity — W3 / D4

Canonical branch: concept2cure-v2. Starting published commit:
7fa964baf87fea7856e5c6307d7705c9d1e68ded. Evidence date: 2026-10-09 UTC.
This is a bounded verification repair, not full IND or commercial-release
qualification. No UI, dependency, model, tool-registry or record-writer change.

## Result

The existing seal route preserves an optional raw verification.receipt reference:
tenant-owned immutable turn-record ID, exact step index, full result digest, and
optional tool-use ID. Malformed or unresolved supplied receipts never disappear
into legacy sealing. Parsing occurs before a database connection is acquired.

The canonical turn-record reader accepts optional complete read limits. This
consumer uses 1 MiB record text, 64 KiB audit details, 1 MiB per text blob, 4 MiB
aggregate unique blob text and 1024 reference entries. UTF-8 byte limits mask
oversized fields in SQL before transport; aggregate blob accounting and selection
share one statement snapshot. Reference shape and character lengths are checked.
The limits do not cap incoming or canonical current-artifact full-text memory.
Default record reads/exports without limits retain their existing behavior.

The existing verifier recomputes record, referenced-text and matching audit-payload
integrity. The consumer requires one successful, unheld platform execution of
verify_docx_against_source and its full result, never a sentToModel summary. It
supports only the persisted_artifact_fidelity schema with false sourceVerified,
unassessed sourceQualification and false sealEligible; invented positive flags
refuse. It does not verify every tenant audit-chain link or HMAC.

Submitted artifact/version selectors and content must agree with the historical
target. The existing DOCX target loader rechecks current tenant/project membership,
unique UUID program anchor, exact artifact/version/head content and hashes, and
canonical disposition eligibility. A changed, withdrawn, removed or foreign
target cannot reuse a historical fidelity result.

Even a valid, intact, current receipt ends in SOURCE_QUALIFICATION_UNASSESSED
before BEGIN or any artifact, signature, provenance, lineage or regulated-audit
write. This delivery authenticates historical copying fidelity, not scientific
source approval. The absent-receipt legacy caller ok-only path is unchanged and
remains an explicit open defect. There is no source-qualified seal path here.

## Qualification

CONTRACT.md fixes the contract; REVIEW.md records the independent scoped review.
Natural-red evidence records 32 failed / 29 passed across 61 selected tests before
production changes, including ignored receipts reaching a minimal legacy-write
fixture and malformed HTTP forwarding. Focused green passed 192 tests across five
files. Tests use the actual recorder/writer, real PGlite SQL and disposition
migration, plus an explicitly captured verifier report fixture. No live model,
OCR engine or scientific-review evaluation is implied.

The final broader test selection, build, forced lint and unchanged canonical
pre-push gate are recorded in their adjacent summaries. source-pins.json binds
the qualified production/test files; qualification.json consolidates the verdict.
Four existing lint warnings remain identical to the starting commit; changed
canonical reader, new consumer and changed tests have zero warnings/errors.
Native compiler cache preparation under typecheck-memory is not itself a verdict;
the canonical gate's actual TypeScript process determines the compiler result.
Client tree remains f4a50c306387585250e354c68e08a099362e3823.

Final source rerun passed 1,250 tests across 59 selected files, with no failures
or skips; build passed. Before publication the canonical branch fast-forwarded
to the non-overlapping repo-health bot refresh
21d5ff347359313e573823263417693df6f283e3. Its two report changes are preserved;
production source and the qualified client tree were unchanged by that refresh.

The complete unchanged pre-push hook passed in 67.158 seconds. Its actual tsc
process exited 0 with zero errors against the zero-error baseline. The final
evidence-only commit does not change any frozen production or test blob.

PRIOR_REMOTE_CI.json records the starting commit's completed remote failures:
main CI, fresh-schema/browser provisioning and Semgrep are not green. No gate,
scanner or baseline implementation/allowance was changed in this delivery. Local
selected-test success is not full-suite, remote-release or IND qualification.
Publication and new remote-CI observations are reported in the delivery response.

## Open

NEXT_STEP.md and ANA_IND_COVERAGE_PLAN.md identify version-bound scientific review
and removal of legacy ok-only seal admission as the immediate follow-up. Full
audit-chain/HMAC, bounded current-target transport, IND hierarchy/applicability,
therapeutic/modality depth, regulatory currency, model PQ and end-to-end scientific
qualification remain open.
