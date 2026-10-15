# CMC document-evidence disposition contract

Date: 2026-10-07. Approved bounded W3/D4 increment in the existing CMC/Module 3
pipeline. The control tower approved this contract before production edits.

## Admission and existing retained-data use

New CMC evidence links represent verification against an original Vault
document. `listLinkableDocuments` and transactional `linkSourceEvidence` must
use canonical `vaultBinaryAvailableSql`; every recorded disposition removes
that original from new admission. A visible disposed document returns safe
409 `DOCUMENT_WITHDRAWN` before moving any older link, creating a link or
writing a link/unlink audit. Other tenancy, version, reason and duplicate
checks remain in force.

Inside the existing refusable transaction, take
`lockDocumentDispositionProgram` first, then reserve
`public.cmc_source_evidence, vault.documents` in ROW EXCLUSIVE mode before
source reads, Vault row locks, link moves, writes or audits. Reuse the canonical
lock and disposition projections; unavailable verification or locking must
refuse and roll back. No parallel transaction, checker or disposition store.

Existing evidence reads distinguish retained data from the original:

- Project canonical `vaultDataEligibleSql`, `vaultBinaryAvailableSql` and
  `vaultDispositionChoiceSql` in `readLinks`. Add `originalFileAvailable` and
  shared `DocumentDispositionChoice | null` metadata to `EvidenceLink`.
- `remove_data`/`supersede` makes an existing live link's state `withdrawn` and
  contributes a withdrawal reason to `findEvidenceDrift` for sections reading
  its CMC record. This uses data eligibility, not original availability.
- `keep_data` preserves the existing current/superseded state and retained-data
  grounding/approval semantics while reporting the original unavailable.
  Original withdrawal alone must not create a data-drift hold.

Keep IDs, hashes, raw and extracted data, historical links, lineage, unlink
reasons and human approvals. No deletion, automatic unlink, scientific
qualification, promotion of historical versions, new UI/model/tool/store,
migration, dependency, suppression or baseline change.

## Decisive proof before implementation

Use one focused actual-PGlite test and the existing disposition harness.
Apply the real canonical preview/apply flow with no preexisting CMC link,
then run the real CMC list/admission SQL. Capture RED before production edits.
Cover every disposition choice, eligible and scope controls, zero refused
link/move/audit consequences, transaction rollback on unavailable policy or
lock, and ordered advisory/table reservation before source/row reads/writes.

Normal apply blocks withdrawal when an active CMC link exists. Existing
late/legacy-link read/drift defense scenarios are therefore explicitly labelled
TEST-ONLY seeds after apply, not claims of a supported withdrawal bypass.
These prove terminal refusal/drift, `keep_data` retention, immutable old links
and governed unlink without erasing history. Retain canonical migration guards
in the test fixture. PGlite and ordered traces prove SQL/transaction behavior,
not independent-connection concurrency or full runtime-role RLS.

Worker scope: `server/services/cmc/source-evidence.ts`, one new focused test,
this plan and `CMC-DISPOSITION-RESULTS.md`. Record focused and canonical
disposition regression results, lint/static checks and limits. No worker
commit/push. Root owns integrated gates, publication and exact-source GitHub
checks. Per control-tower sequencing, pause after RED before production edits
until the separate TypeScript-fixture correction is published.
