# Authenticated recorded verification — next W3 / D4 step

The existing DOCX verifier now binds a server-loaded current target and records
its explicit fidelity-only result. Its source qualification remains unassessed.
Neither intact hashing nor a clean comparison can be upgraded to source review.

Continue using ana_turn_records / ana_record_blobs and turn-record-verify.ts.
A future consumer must identify one precise tool result using the tenant-owned
turn record, tool-use ID (or the explicit step index for legacy nonstream records)
and full result digest, then validate the record and its matching audit receipt.
Tool-trace summaries and caller-copied JSON are not the proof surface. Keep record
loading bounded; existing loadTurnRecord loads all referenced blobs and does not
by itself impose an aggregate byte cap or verify every audit-chain link.

Refuse omitted, malformed, forged, wrong-tenant/step/target, negative and stale
references. Revalidate the owned program/project anchor, exact artifact/version
identity/content/hash, current head and disposition eligibility at use time.
The result's read/recheck is a historical snapshot, not authorization for later
state. A historical valid record must not admit a withdrawn source or changed
version. Legacy unscoped caller verification.ok remains an open defect; positive
caller flags cannot authenticate a reviewed source.

Before any recorded fidelity result can authorize source-qualified sealing,
define and exercise an actual version-bound source-review contract in the
existing governed review path. Reuse the canonical draft source references and
authoring lineage rather than inventing another registry. Current-at-save,
citation hashes, authoring provenance qualification:unassessed and verifier
artifactVerified:true prove distinct facts and supply no scientific approval.

Keep full IND hierarchy, applicability, therapeutic/modality coverage, regulatory
currency, model PQ and scientific qualification open until their own evidence
passes. This delivery changes no UI or seal route and adds no authenticated
consumer, source-review record or regulator-readiness claim.
