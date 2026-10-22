# Recorded DOCX fidelity consumer — W3 / D4

Starting published commit: 7fa964baf87fea7856e5c6307d7705c9d1e68ded.
Canonical branch: concept2cure-v2. No UI, tool-registry, model or dependency change.

The existing seal input gains an optional raw verification.receipt object:
turnRecordId (UUID), stepIndex (zero-based integer, 0–10000), resultSha256
(lowercase SHA-256), and optional toolUseId (nonblank string, at most 256 chars).
A supplied malformed or unresolved reference must not disappear into the legacy
unscoped caller-text seal path. A missing receipt retains the existing legacy
behavior; that unauthenticated path remains an explicit open defect.

The canonical turn-record loader gains optional read limits. The consumer uses
at most 1 MiB record text, 64 KiB audit details, 1 MiB per text blob, 4 MiB aggregate
blob text and 1024 text references. Limits are measured in UTF-8 bytes before
transporting large fields. Record/blob rows remain tenant scoped. There is one
canonical loader, not another receipt registry or record writer. Default historical
read/export behavior is unchanged when limits are not requested.

The reference-count budget counts all reference entries, not just unique hashes;
the aggregate byte budget counts each content-addressed blob once. The single
SQL snapshot guarantee applies to blob-budget evaluation, not the complete
multi-statement record/audit/current-target read. These are historical-record
transport budgets; the canonical current-artifact reader and incoming content
retain their existing full-text memory behavior.

The consumer recomputes the existing record, full referenced-text and matching
audit-payload integrity verdict. It also checks text-reference shape and recorded
character lengths. It requires a successful, unheld platform execution of the
existing verify_docx_against_source tool at the precise index; an optional tool-use
ID must uniquely agree. The digest must name the full result, not a budgeted
sentToModel summary. Full tenant audit-chain links/HMAC are not verified by this
record verifier and must not be described as verified.

The report must be a passing persisted_artifact_fidelity result, with exact
target identity and content/text/file digests and zero recorded divergence.
The supplied seal selectors must identify that artifact/version, and supplied
content must hash to the authenticated saved comparison. The existing DOCX
target reader then rechecks current ownership, unique UUID program anchor,
artifact/version identity, head/version content/hashes and canonical disposition
eligibility. Historical validity does not imply current target validity.

This consumer does not introduce a source-qualified seal path. It accepts only
the existing fidelity report schema whose sourceVerified is false,
sourceQualification is unassessed and sealEligible is false. Invented positive
qualification flags refuse rather than qualify. Even an intact, current, correctly
referenced report ends in SOURCE_QUALIFICATION_UNASSESSED before any artifact,
signature, provenance, lineage or regulated-audit write.

An actual version-bound scientific source-review contract and removal of the
legacy unscoped ok-only verdict remain later work. Hashes, current-at-save and
copying fidelity are not substitutes for that review. Full IND hierarchy,
applicability, therapeutic/modality depth, currency and end-to-end qualification
remain open. Natural-red tests precede production changes; final local gates and
remote release status will be recorded separately.
