# Durable MDX section evidence: backend discovery

Read-only discovery on 2026-11-14, during root's compiler/build/publication freeze. No product edits, Git commands, compiler, build or tests were run for this discovery. This is a proposed bounded contract for root review, not implemented or qualified behavior.

## Additional retention boundary: persistent association alone is insufficient

Further read-only discovery confirms that an attachment-only dependency is invisible to the existing source-disposition and Vault where-used readers. This is a blocker to claiming end-to-end source preservation, even after the MDX association survives reload. It is an availability gap, not evidence that current ordinary actions physically erase stored Vault bytes.

### What currently permits or refuses removal

- `server/services/document-data-disposition/impact.ts:82–136` counts CMC/governed references, scientific spans, saved Authoring source/import receipts, derived captures and recognized approvals. Its c2cApprovals query reaches a governed filing only through `document_span_lineage` with source cre_evidence_source. It never reads c2c_document_section_evidence. A Vault version linked only through a vault_doc attachment can therefore have zero recognized downstream/approval impact even if its actual c2c filing is locked/submitted or its bound Authoring copy is FROZEN/APPROVED.
- `impact.ts:169–205` blocks every disposition choice when recognized active review/approval/submitted dependencies or legal holds exist. It also blocks any live CMC/governed dependency pending review, independently of approval. No analogous attachment dependency exists. Otherwise a project lead/manager can confirm keep_data/remove_data/supersede using the current impact preview. Missing extraction is not necessarily a blocker to original-file withdrawal.
- `eligibility.ts:18–25` makes **all three choices** remove original-file availability. keep_data preserves eligible extracted data but does not keep the original downloadable. `service.ts:43–50` records the disposition and snapshot; it does not erase bytes or delete the Vault row. `retention.retentionUntil` is displayed, and physicalErasure:false is explicit; the retention date is not itself one of dispositionBlockers' tests. Do not tell a user “keep data keeps this attachment's original available”.
- `service.ts:17–22,111–119` reserves its enumerated impact tables, recomputes/fingerprints the preview under READ COMMITTED and rejects stale/blocked confirmation. The evidence-edge table is not in that reservation list or preview fingerprint. A new attachment currently cannot invalidate a previously reviewed preview on its own.
- `server/jobs/retentionCron.ts:167–224,286–337` checks active legal holds, organization, retention date/policy and audit. A policy requesting hard destruction is refused. For an ordinary expired version it can archive the full record and set deleted_at in one transaction; it does not inspect c2c section attachment uses, filing seals or source-disposition impact. Download queries exclude deleted_at rows, so a tombstoned attached source becomes unavailable even while its bytes remain stored. Record archival alone does not make the existing original-download API retrieve it.
- `server/services/authoring/authoring-file-to-vault.ts:226–269` is the other named tombstone writer: compensation soft-deletes an operation-created admitted version when its Authoring handoff fails. Its own comment explicitly excludes qualification of every third-party-use race. A newly committed section attachment is one such use. The current compensation UPDATE does not inspect it. Failure to reverse already becomes OUTCOME_UNKNOWN, so refusing destructive compensation can fit the existing honest failure path.
- `migrations/20260926_vault_documents_record_immutability.sql:125–199` is the actual database identity/record guard. It freezes source identity/hash/version/uploader, refuses TRUNCATE and runtime hard DELETE, but explicitly allows deleted_at NULL→timestamp. **Correction:** the earlier shallow source search missed this migration; the database does enforce immutable source-version identity. It does not currently enforce attachment-aware tombstone retention.
- Ordinary project-Vault has no general document DELETE route in the inspected current source. Physical byte erasure is reserved to the existing tenant-offboarding ceremony, after committed tenant purge, with active-legal-hold checks, custody/export rules and regulated-content retention refusals (`tenant-offboarding.ts:483,525`; held-record doors). This discovery does not change that ceremony or promise data remains retrievable after an authorized offboarding erasure.

Thus, absent another recognized hold or dependency, **yes: current source disposition can remove original-file availability for a version attached to a sealed filing without showing the attachment impact. The retention sweep can independently tombstone it once expired.** Current identity/hash protection and stored bytes are stronger than original-file availability. Neither the UI nor this completion may promise universal perpetual retrievability from the present behavior.

### Smallest existing owners that need a retention-aware contract

1. **`server/services/vault/vault-where-used.ts`**: extend this existing owner with a distinct section-attachment dependency projection. Keep current actor/project scope rechecks for human reads. Add an internal exact organization/program/source-id projection that existing admitted disposition/retention callers can reuse in their own context; do not fabricate a human/system actor or weaken currentUsesScope. A job's verified organization scope and a human's current admission remain different callers of the same bounded dependency query.
2. **`server/routes/c2c/project-vault.ts` existing versions GET and `client/src/concept2cure/v2/surfaces/VaultVersions.tsx`**: present those associations in the current version usage rows. Say “attached to [filing/section]”. Do not put governed section ids into the authoring_sections citation type, invent spans=0, count attachments as citations, or feed them into sectionsCitingEarlier's scientific-source remediation. These ids and meanings differ. An attachment use can show source version/hash authority and current filing status without claiming any cited statement or scientific conclusion.
3. **`server/services/document-data-disposition/impact.ts` and `service.ts`**: observe exact vault_doc edge rows joined through same-org/program c2c section/document and the admitted source UUID. Include complete rows and protected filing/bound-authoring states in impact fingerprints. Reserve c2c_document_section_evidence in confirmation's IMPACT_TABLES; if receipt payloads are read into that snapshot, reserve the corresponding action store too. Include attachment uses under an honestly named association/downstream dependency count; do not increase scientific citation/span counts. Existing impact_snapshot/action JSON can retain these rows and their UUID/version/hash receipts without a new storage table.
4. **The existing tombstone boundary**: retentionCron.ts and file-to-vault compensation must not silently remove an attached admitted source. Either make both compose the same guarded projection inside their tombstone transaction, or add the dependency check to the existing record-immutability migration's deleted_at guard and make these writers report the resulting retention refusal. The latter covers both named tombstone writers at their common record boundary; it is an amendment of an existing guard, not a new table/service. Root must select/design/qualify this exact option before edits; no migration change is proposed as already approved.

The association query must bind evidence_kind=vault_doc and evidence_ref as **text** to the exact Vault version UUID, then section→c2c document organization/program and verified source owner. A foreign/malformed edge must not expose or protect another tenant's source as if it belonged here. UUID-equivalent case normalization may compare existing valid strings, but never cast arbitrary historical JSON/text to UUID. Do not substitute a newer family version or match only a title/filename/hash.

### Retention rule options and the smallest safe scope

At minimum a sealed/reviewed/locked/submitted filing attachment must block original-file withdrawal/tombstone under the existing active-dependency rule; include locked_at/submitted_at and all bound editing-copy seal states, not just a narrow string comparison. But **sealed-only checks do not solve the complete lifecycle**: the current signer does not hash/snapshot/check this separate attachment edge. A draft dependency could be withdrawn first, then the document sealed later without an attachment-availability gate. A concurrent seal can also race a guard that only reads its earlier draft status.

The bounded conservative rule is the precedent already used for live CMC/governed links: **any live governed section attachment requires explicit unlink/review before original-file withdrawal or tombstone**. A draft can be deliberately unlinked through the now-governed unlink path; a sealed filing refuses unlink. This makes the active edge itself the retention dependency, avoids silently allowing original loss under later sealing, and does not claim the attachment scientifically supports any prose. It narrows removal for an explicit governed association; root must record this choice in the pre-edit contract. Do not silently invent this policy while implementing a display-only fix.

If root instead selects sealed-only protection, the scope must also include current signing/freeze and retention reservations plus a current availability/source snapshot check; it cannot be qualified by the present two-route wiring alone. A UI association that is not in the signed snapshot must not be described as covered by that signature. Explicit link/unlink audit is still necessary.

### Receipts, races and unavailable historical sources

- New link receipts should retain exact edge id, filing/document/section, source UUID, source version and normalized immutable SHA-256, plus actor/time. Keep evidence_ref as the existing UUID ABI; the pinned snapshot lives in the existing chained action payload. To label a receipt verified, compare its payload identity/hash to its chained audit receipt and exact source; a plain mutable/current projection is not a historical receipt.
- A matching legacy edge without a source snapshot is an **unverified attachment association**, not an absent dependency. Keep it visible, count it conservatively for retention and require human review to remove it. Do not backfill a historical snapshot from today's metadata or manufacture scientific lineage. A mismatched source receipt should refuse/remain unverified, not disappear from impact.
- Link/unlink and disposition must serialize on the existing canonical program reservation; confirmation also reserves/fingerprints the edge table. A preview before link/unlink must become STALE_PREVIEW, and confirmation must re-read after waiting. The source version row reservation prevents a link from naming a row already tombstoned by another transaction.
- A tombstone guard must evaluate live associations on its actual transaction after source reservation, and fail closed when the association/receipt/filing state cannot be read. Native overlapping link↔tombstone and link↔disposition tests are needed; a mocked sequence alone does not prove this. Under the conservative any-live-edge rule, no authoring-sign state guess is needed to recognize the retention dependency.
- When retention is refused for an attachment, report a held-by-governed-use result in the existing summary/current row; do not count it as a legal hold or a successful deletion. A query failure leaves the source in place and counts an error. Compensation that cannot safely tombstone a now-used version keeps the existing unconfirmed outcome rather than claiming the original filing was completely reversed.
- No automatic unlink, no automatic attachment migration to a successor, no clearing the source's disposition, no converting attachment edges into spans, and no deletion of historical audit are part of this completion. Exact original download remains the current hash-verified endpoint and refuses unavailable files honestly.

### Existing qualification and coordination owners

Reuse/extend the actual disposition fixture/cohorts (`service.pglite.integration`, `saved-draft-impact.pglite.integration`, `confirmation-freshness.pglite.integration`, `eligibility.pglite.integration`) with attachment-only cases. Add native source-record-guard/retention coverage beside `tests/db/vault-record-immutability.dbtest.ts`, `tests/db/vault-where-used.dbtest.ts` and the existing `server/jobs/__tests__/retentionCron.*` files; do not claim those current tests already cover attachment edges. Current file-to-vault snapshot/compensation cases cover its existing outcome behavior and should gain the newly-used-version refusal if that owner changes.

Required meaningful cases include: exact attachment-only sealed filing blocks all three disposition choices; keep_data never silently keeps original availability; same live unsealed edge follows the recorded retention rule; stale pre-link preview cannot confirm; safe unlink changes fingerprint; pending signer/retention contention preserves source; malformed/foreign/null-tenant source does not leak another source; legacy missing receipt is visible/unverified and protected; expiration does not tombstone a protected source; file-to-vault compensation does not tombstone a newly used source; current source UUID/version/hash guard remains intact; physical offboarding remains its separate existing ceremony. No such test was run in this read-only task.

Current COORD search found no explicit active hold on vault-where-used.ts, disposition impact/service, retentionCron.ts or file-to-vault compensation. VaultVersions/project-vault's rendered-from turn is explicitly done/released around lines 623–624. The broad Vault lane still holds its named eTMF scope; do not treat its absence from these exact files as permission to skip coordination. Acquire narrow holds for the selected owners before implementation. W7 PathwayPanes and D8 CSS remain excluded.

## What already exists

| Existing owner | Current behavior and remaining limit |
| --- | --- |
| `server/routes/c2c/documents.ts:386` | Authorized single-section GET returns stored section fields/content, with no evidence projection. Missing section 404, authorization/read failure remains an error. |
| `documents.ts:676` | Existing POST accepts artifact/vault_doc/rim_precedent/guidance. Current document/program read scope is checked; current project edit rights are checked inside the write transaction. INSERT and governed-action audit commit together. It does not validate a Vault reference, check seals, reserve the section, detect duplicates or distinguish an ambiguous commit. |
| `documents.ts:753` | Existing DELETE checks link→section→document→org/readable programs before starting a transaction, then rechecks project edit rights, records an action, deletes by link id and commits. It does not re-read/lock the exact link and section in that transaction, check seals or inspect DELETE RETURNING/count. |
| `migrations/20260528_phase9_document_schema.sql:188` | `c2c_document_section_evidence`: id, section FK, evidence_kind, evidence_ref text, paragraph_id, confidence, linked_by, linked_at. No source FK, unique edge constraint, stored source hash/version or evidence-history table. Source UUID must continue to occupy evidence_ref; no new URI encoding is needed. |
| `server/services/c2c/document-outline.ts:53,83` | Existing outline performs one live-section query and merges rows with the bound rule-pack keys. It projects has_content; missing materialized rows get false. It can cheaply add indexed EXISTS(has evidence), including unavailable legacy associations. |
| `client/src/concept2cure/mdx/hooks/useDossier.ts:139,153` | Fetches section GET only for has_content, then sets attachments empty. Evidence-only sections are therefore lost unless the fetch predicate also considers evidence. |
| `server/services/c2c/filing-lock.ts:24` | `readFilingLock` reads status/locked_at with FOR NO KEY UPDATE, fencing filing lock/submit against subsequent writes. |
| `server/services/authoring/document-lock.ts:55,220` | `reserveWritableDocument` reserves the authoring parent FOR UPDATE and touches updated_at, fencing a repeatable-read signer. `checkFilingWritable` inspects every bound editing copy for FROZEN/APPROVED/locked_at, but its actual query is plain SELECT. A transaction-local plain check alone is not a reservation against concurrent freeze. |
| `server/services/vault/vault-version-lock.ts:43` | `lockLiveVaultVersion` admits a live exact Vault UUID, optional exact program, current actor/program access and explicit organization; NULL organization refuses reconciliation. Default locks version/program FOR SHARE. It does not itself validate input UUID syntax, binary disposition, storage address or SHA-256 validity. |
| `server/services/document-data-disposition/eligibility.ts` | Canonical `vaultBinaryAvailableSql` and `vaultDataEligibleSql` distinguish original-file availability from retained extracted data. A keep_data decision still removes original-file availability. |
| `server/services/document-data-disposition/program-lock.ts:5` | Program advisory reservation serializes source-sensitive writes with disposition confirmation, using canonical lower-case UUID spelling and a 5s lock timeout. Confirmation takes this lock before its authoring-impact table locks (`service.ts:111–114`). |
| `server/routes/c2c/project-vault.ts:2584` | Existing authenticated exact-version original download: current project admission, exact same-program/org live source, binary-disposition guard, recorded storage identity and actual hash verification, with download audit before bytes leave. Reuse its endpoint; never return storage keys/provider URLs in section evidence JSON. |
| `server/services/authoring/authoring-refile-saved-section.ts:62,205` and `authoring-create-outcome.ts` | Existing commit-attempt/rollback/discard-connection pattern already distinguishes OUTCOME_UNKNOWN, retryAllowed:false from a known refusal. Reuse this transaction lifecycle pattern rather than treating every catch as proof that nothing committed. |

Exact-table searches found only the two route writers, schema/RLS/purge owners and existing tests. No MDX caller of those evidence endpoints exists. The similarly named authoring-actions section-evidence route and AnA CSR evidence tools read clinical/regulatory evidence; they do not persist these MDX associations. Data-room project-use pins and scientific span lineage are separate existing records, not substitutes for this section edge. No evidence-table integration was found in current Vault where-used or document-disposition impact readers; this edge alone must not be presented as scientific citation lineage or verified readiness.

## Confirmed gaps in current backend

1. Arbitrary nonempty strings are currently admitted as vault_doc references. No source UUID/existence/organization/program/disposition/storage/hash check occurs. A foreign, malformed or removed source can be inserted.
2. Link/unlink can change associations on a locked/submitted filing or one whose editing copy is frozen/approved. They do not apply the existing filing/authoring guards.
3. Lookup before BEGIN is not final write authority. Section/link identity and state need rechecking under transaction locks; DELETE may currently audit an already vanished link and report 204 because its row count is ignored.
4. There is no uniqueness or duplicate check. Every POST retry creates a new edge and new audit. The unused idempotency machinery in actions.ts does not make the evidence INSERT idempotent.
5. POST returns a raw inserted row 201; DELETE returns204. No authoritative read response supplies links for reload or reconciliation. A COMMIT exception is currently just generic500, without confirmed-vs-unknown outcome.
6. Current audit is atomic but incomplete as an evidence identity receipt: link payload is only `{evidenceRef}`; unlink payload is only `{evidenceId}`. It omits exact edge fields and the selected source version/hash. The audit action is c2c.work.resolve, bound to section:<documentId>:<key>, stored with its JSON payload in c2c_ana_actions and a hash/seal in audit_logs.
7. Evidence writes do not update section content or produce c2c_document_section_versions. That trigger fires only on a content change. Current Activity/versions is content history and must not be described as evidence-link history. Do not increment text versions or manufacture authoring revisions for this association change.

## Minimal existing backend owners

Production completion can stay within existing `documents.ts`, `document-outline.ts`, and, if needed for reusable nonblocking parent reservation, the existing `authoring/document-lock.ts`. Compose current Vault/disposition owners without adding a route, mount, service, table or a second access policy. Root must approve exact scope and acquire holds before any implementation.

### Efficient outline hint

Extend the existing live-section SELECT, aliasing its section row s:

```sql
SELECT s.section_key, s.status, s.owner_id, s.draft_source,
       s.drafted_at, s.accepted_at, s.version,
       /* existing sectionHasContentSql over s.content */ AS has_content,
       EXISTS (SELECT 1 FROM c2c_document_section_evidence ev
               WHERE ev.section_id = s.id) AS has_evidence
FROM c2c_document_sections s
WHERE s.document_id = $1
```

Carry has_evidence through withLive, default false for a virtual/unmaterialized row. UseDossier fetches section GET for has_content OR has_evidence. The existing section_id evidence index supports the EXISTS; no 47-empty-request refresh is required. Count all associations here, including legacy invalid sources, so the client actually requests and displays their unavailable state. Do not count only downloadable sources and hide the rest.

### Authoritative existing section GET

After current document admission, extend the existing section GET with an evidence list. Preserve section404 vs evidence[] and fail a projection query error as unavailable, never a successful empty list. Scope the projection again through document/section/org/current program; use LEFT JOIN so every actual association survives:

```sql
SELECT ev.id, ev.section_id, ev.evidence_kind,
       ev.paragraph_id, ev.confidence, ev.linked_by, ev.linked_at,
       v.id::text AS admitted_source_id, v.version AS admitted_source_version,
       v.document_title, v.file_name, v.mime_type, v.file_size,
       v.content_hash, v.created_by AS source_created_by,
       v.created_at AS source_created_at,
       CASE WHEN v.id IS NOT NULL
            THEN /* canonical vaultBinaryAvailableSql('v') */
            ELSE false END AS original_available
FROM c2c_document_section_evidence ev
JOIN c2c_document_sections s ON s.id = ev.section_id
JOIN c2c_documents d ON d.id = s.document_id
LEFT JOIN vault.documents v
  ON ev.evidence_kind = 'vault_doc'
 AND v.id::text = lower(btrim(ev.evidence_ref))
 AND v.program_id = d.project_id
 AND v.organization_id = d.org_id
 AND v.deleted_at IS NULL
 AND EXISTS (SELECT 1 FROM regulatory_programs p
             WHERE p.id = v.program_id AND p.organization_id = d.org_id
               AND p.deleted_at IS NULL)
WHERE d.id = $1 AND s.section_key = $2 AND d.org_id = $3
  AND d.project_id = ANY($4::uuid[])
ORDER BY ev.linked_at, ev.id
```

This is a query sketch for the existing owner, not implemented SQL. Text equality avoids throwing UUID casts on retained malformed refs. Return link id/section identity/kind, exact server linkedAt/linkedBy and a validated source projection. Keep uploader distinct from linker; resolve names through the repository's existing authoritative actor-name reader, never browser “You”. A hidden/foreign/malformed/unreconciled/missing source becomes `source:null, state:unavailable` with no raw evidence_ref, foreign UUID/title/hash/storage metadata. Link id remains available for a deliberate authorized unlink; unavailable must not look like no association. A same-project withdrawn source may expose only the metadata current policy allows and says the original is unavailable. A newer Vault family version is never silently substituted; current/superseded presentation, if included, must reuse vault-version-family's valid-link rule. No source prose is needed for this list.

For new edges, recover the linked-time UUID/version/hash from the immutable governed-action payload, if the UI needs a linked-time comparison. A legacy edge without that receipt is not retroactively “verified”; label its snapshot authority honestly. Existing current Vault metadata is not a historical link-time snapshot.

### Reservation and lock order: a verified bounded option

The existing code does NOT have one universal blocking order:

- Ordinary Authoring save: reserveWritableSection → parent FOR UPDATE/touch → authoring child lock → commitSectionToFiling → filing FOR NO KEY UPDATE (`authoring.router.ts:1889`, `commit-section-to-filing.ts:297`).
- Freeze: lockedSigningContent locks authoring parent FOR UPDATE (`authoring.router.ts:5474,5564`), then figuresRefused reads savedSourceExcerptsForSigning (`:5308,5584`), which can acquire the disposition-program lock via reserveDraftSourceStores (`draft-source-references.ts:258,275`).
- Source-sensitive refile takes disposition-program lock before reserveWritableSection (`authoring-refile-saved-section.ts:171,177`).
- Disposition confirmation takes program reservation before SHARE locks over authoring-impact stores (`document-data-disposition/service.ts:111–114`).

Therefore neither simply taking a blocking parent lock after disposition nor reversing those two is sufficient to claim compatibility. A concrete existing bounded precedent is `authoring-file-to-vault.ts:288–290`: source/disposition reservations first, then the authoring parent **FOR UPDATE NOWAIT**, with 55P03 treated as 409 DOCUMENT_MID_FREEZE (`:161,196`). A signer holding parent while waiting for disposition cannot cause that writer to wait on the parent; it rolls back and releases its program reservation.

For the section evidence writer, use that precedent:

1. BEGIN, establish current actor/project admission and canonical disposition-program reservation before source-sensitive locks.
2. Re-resolve bound authoring parents in the same organization and filing. Reserve each in deterministic id order with NOWAIT and the existing reserveWritableDocument parent-check/touch semantics. If a shared seam is required, extend the existing document-lock owner with an optional nonblocking reservation mode; retain default semantics for existing callers. Do not copy status vocabulary into the route. An in-flight signer yields a structured409 and full rollback. Missing/no-authoring-bundle behavior must remain deliberate and tested; a failed SQL statement cannot be caught and then treated as a healthy PostgreSQL transaction.
3. Only after authoring parents are reserved, call readFilingLock and reserve/re-read the exact governed section FOR UPDATE. Refuse locked/submitted filing, sealed editing copy, locked section, missing/changed section or admission failure. Recheck parent/section membership on this transaction. Do not take filing lock first and then wait on a signer parent.
4. For new vault_doc edges, validate syntax before any UUID cast; use lockLiveVaultVersion with the exact target program and actor. Recheck canonical binary disposition and source identity under the reservation; pin normalized 64-hex content hash and actual version, requiring a recorded storage_version_id or legacy s3_key. A metadata association is not a re-read/hash proof of physical bytes; the existing download verifies bytes on use.
5. Detect duplicates while the section row lock is held, then insert or deliberately reuse/refuse as specified below. Audit and mutation share this transaction. Set commitAttempted immediately before COMMIT; release/discard connection according to the actual transaction outcome.

NOWAIT and the existing disposition lock timeout make contention a known refusal before COMMIT; do not auto-retry a regulated write. Native concurrency coverage is needed before describing this new composition as race-safe. No signer change or broad lock-policy rewrite is proposed by this discovery.

### Source identity and approval bounds

`vault-version-family.ts:4` and `vault-version-checkin.ts:4` define row-per-version UUID identity, with supersedes_id linking valid family members. `vault-ingest.service.ts:521–565` refuses different bytes at the same (program,document_code,version) and admits same-hash retries. The deeper retention trace found the actual database guard in `migrations/20260926_vault_documents_record_immutability.sql:125`: id/program/version/content_hash/size/mime/uploader/time are frozen; organization/code/name/storage/lineage/deleted_at are write-once, with a guarded same-hash storage-adoption exception. Hard DELETE is reserved for the tenant-purge ceremony; TRUNCATE is refused. This corrects the initial search's incomplete “no blanket guard found” finding. Pin UUID/version/hash in the action receipt so historical association identity is explicit even though the referenced version already has strong database identity protections. Mutable descriptive metadata, tombstoning and original-file availability remain separate governed concerns.

Do not reuse official eSTAR admitVaultAttachmentSource as the generic section-evidence gate. It additionally requires approved/transmittable FDA material, which would improperly prevent uploading draft working evidence. Catalog extraction success is also not a prerequisite for naming an original binary attachment. Linking an attachment establishes an association, not that its scientific content is accepted, its original physically verified in that request, its content approved, or its section ready to file.

### Duplicate and receipt contract

The sole current writers can serialize duplicate decisions on the governed section row; no new index/migration is required for that bounded route contract. Normalize a valid new Vault UUID once and retain the evidence_ref UUID ABI. Exact duplicate identity is section_id + evidence_kind + canonical evidence_ref + paragraph_id with NULL-safe comparison. Do not deduplicate by filename/hash/title, follow a successor, rewrite legacy refs or delete existing duplicates.

Root should select one explicit outcome: return the existing admitted edge with a structured 200 reused:true receipt and no new audit, or refuse 409 already linked. A new edge returns 201 plus exact persisted link/section/source identity and action/audit receipt. A successful HTTP status alone is insufficient client confirmation. Existing duplicates remain distinct historical link ids until a person deliberately removes one. Seals/access/source checks run before a write response; recovery after an unknown outcome uses GET, not another POST.

DELETE must lock/re-read the exact scoped link in its transaction and use DELETE RETURNING/count. One successful deletion reports 204 (or a deliberately designed structured receipt); zero matching rows is not a fresh successful deletion/audit. Record the removed edge's full before-image in the same immutable action payload before deleting. Unlinking removes an association, not the Vault version or its original bytes.

### Audit/provenance and failure truth

For a new link/unlink action, enrich the existing governed-action payload with operation, link id, document/section identity, kind, exact ref, paragraph/confidence, server linked_by/time, and the admitted source UUID/version/normalized hash. This fits the existing action JSON and chained audit; no new table is needed. Preserve existing content/authorship versions and do not claim a new signature or clinical span lineage.

Use known structured refusals for invalid request 400, hidden/missing 404, denied project edit/seal 403 or current existing 409 seal vocabulary, locked/submitted/contended/stale source 409, and unavailable admission 503. Only a completed rollback before any COMMIT attempt supports “nothing changed”. COMMIT attempted and errored, failed rollback, lost transport or malformed/mismatched success receipt are unconfirmed outcomes. Return/retain OUTCOME_UNKNOWN with retryAllowed:false, original project/document/section identity and safe requested link identity; no source prose or unauthorized metadata. Reconcile with a fresh authorized existing section GET. Confirm exact edge presence for link, exact link-id absence for unlink, or keep the operation unresolved if the read fails. Never auto-replay POST/DELETE. An upload and its association are separate commits: uploaded-but-unlinked is a truthful recoverable state, not failed upload and not completed section attachment.

## Existing test owners and needed failure evidence

- `server/routes/c2c/__tests__/documents-project-scope.pglite.test.ts`: actual schema/current project access and write-right refusal, including link/unlink, but action ledger mocked. It currently seeds artifact refs and does not cover Vault validation/seal/duplicate/unknown outcomes.
- `server/__tests__/security/c2c-documents-evidence-link-audit-order.contract.test.ts`: mocked INSERT→audit→COMMIT and audit-failure rollback.
- `server/__tests__/security/c2c-documents-delete-audit-order.contract.test.ts`: mocked audit→DELETE→COMMIT, audit-failure rollback and unowned 404.
- `server/routes/c2c/__tests__/filing-section-respects-authoring-seal.test.ts`: existing PATCH seal behavior, not evidence writers and not native concurrent sealing.
- `server/services/c2c/__tests__/dossier-read.pglite.test.ts` and `document-outline-market-scope.pglite.test.ts`: existing actual outline consumers for a has_evidence addition.
- Existing Vault version-lock/family, ingest conflict, document-disposition and original-download cohorts cover reusable source contracts; run only a bounded selected cohort after implementation, not during root's current publication freeze.

Meaningful future cases: persisted upload/link→fresh GET→reload with empty prose; exact source metadata and correct uploader/linker; private/foreign/null-tenant/malformed/deleted/withdrawn/no-storage/bad-hash refs; frozen/approved/locked/submitted and in-flight signer; unavailable policy/seal/disposition reads; section/link vanished between initial lookup and transaction; duplicate serialized attempts with one edge/action; retained duplicate/invalid edges visible without foreign metadata; audit INSERT or DELETE failure rollback; COMMIT exception vs rollback exception; a response lost after successful commit reconciles by GET without replay. Do not use content versions or local store logs as evidence-link history.

## Coordination and search limits

Current COORD explicitly holds PathwayPanes.tsx in W7 and shared MDX CSS in D8; this discovery does not use those files. No explicit hold on documents.ts or document-outline.ts was found in the current hold rows; the historical RIM turn over documents.ts is released. Relevant Vault/source ownership must be rechecked and the exact new holds recorded before edits. Root's current qualified generic batch remains frozen until publication.

Live searches covered the exact table, route paths, four evidence kinds, section readers, all current table writers, source admission, disposition, authoring freeze/sign/parent reservations, Vault version identity, original download, history/audit, existing tests and COORD. The earlier lane's remaining-workflow-gaps.md records a fetched-history deletion search with no match and explicitly shallow boundaries. This task obeyed the no-Git instruction and did not repeat deletion history or fetch; therefore it makes no new exhaustive deleted-owner claim. Current source and referenced prior evidence remain distinct.

## Read epoch and source pins

Read at 2026-11-14T04:01:10.423155+00:00. Local HEAD read directly from metadata (no Git process): `ef27500a16a0f104699b8aa2b8600b2baefdd792`. These 18 pins identify the reviewed live source, not a publication or transitive qualification claim.

```json
[
  {
    "path": "server/routes/c2c/documents.ts",
    "sha256": "f6c172d9fc74f0c1dfb2fbade9cc75ca622569f974f7ba0dd3d4d4bc21087847"
  },
  {
    "path": "server/services/c2c/document-outline.ts",
    "sha256": "8f27f6748d1cd40285e7c856243196acb66d255646cd416252149433653c077a"
  },
  {
    "path": "server/services/c2c/filing-lock.ts",
    "sha256": "09c092de31ae5f261894d989f38341419889083207173f4ad9dfaee74ed757cf"
  },
  {
    "path": "server/services/authoring/document-lock.ts",
    "sha256": "b30f41fa92c57ddc5eca6c5a75214cbfe9d3014dfd0f81e8ffcbc2cc0354542e"
  },
  {
    "path": "server/services/vault/vault-version-lock.ts",
    "sha256": "05560bb064c5498b697e677ec8838e544672593761cfbb8bd12dcafdfe14bb4e"
  },
  {
    "path": "server/services/vault/vault-version-family.ts",
    "sha256": "92eaa6419ccc98273a76f5f7b7f9c66520905b3026486157496c59bcfbf4b26a"
  },
  {
    "path": "server/services/vault/vault-ingest.service.ts",
    "sha256": "a4e648da901987d3740fd186688ab6526770e4c843a7869ee1442806094281ea"
  },
  {
    "path": "server/services/document-data-disposition/eligibility.ts",
    "sha256": "b4d93194a0cdac02966b2b9bf0ca73e4dcf96fa6218ed259ecf4e469ce37db6f"
  },
  {
    "path": "server/services/document-data-disposition/program-lock.ts",
    "sha256": "04862a0cc8becdb04267ec08975fdfc5063ca39001fa07ef2d440fdec6071a42"
  },
  {
    "path": "server/services/document-data-disposition/service.ts",
    "sha256": "2cd0f80dc0e867fe0e260267c666e7409858ed5314030c68abf2e0f82f7a0ec6"
  },
  {
    "path": "server/services/authoring/authoring-file-to-vault.ts",
    "sha256": "571981600f70d03c05ee14937207cae4a2fb0ffcf6b02cef97f0fd58114a5926"
  },
  {
    "path": "server/services/authoring/authoring-refile-saved-section.ts",
    "sha256": "998e0d01216e16f69dbd8262553e8004758c3bc2a9531b0df7875d57484d9693"
  },
  {
    "path": "server/services/authoring/draft-source-references.ts",
    "sha256": "01b16e4a586b503c76efad3d2535a7b028c52225ad9de14c0cd97133ad3dfeff"
  },
  {
    "path": "server/routes/authoring.router.ts",
    "sha256": "89735df6c40bea6936770f31a8cad32d696a8ed0d8990f650160ab84a5d938d3"
  },
  {
    "path": "server/routes/c2c/project-vault.ts",
    "sha256": "8a19ca03c117ef611ece16f871eea1fce8b47ffc41fce46f32e97323c1ef1653"
  },
  {
    "path": "migrations/20260528_phase9_document_schema.sql",
    "sha256": "fd438fd6bd9c391faa65ca988b871cb1609136e9dff48ff3f8775729a6fce499"
  },
  {
    "path": "client/src/concept2cure/mdx/hooks/useDossier.ts",
    "sha256": "2d25a59d3a61391a63e20b3c934ae1152afa0146319c19cdd2a2841bf957b68c"
  },
  {
    "path": ".design/claude-convergence/COORDINATION.md",
    "sha256": "0a58d5a9d45f4dd96b1f268ced10ad5846119e54c56e3761e46892f7629a7a94"
  }
]
```

## Final discovery freeze

**FROZEN at 2026-11-14T04:07:47.712489+00:00. All attachment, retention, where-used and concurrency changes described above are UNIMPLEMENTED proposals.** Root must persist/review the concrete scope before any product edit. The initial immutability search was corrected against the actual deployed record guard; source identity/hash/version are database-protected, while original-file availability and tombstoning still have the confirmed attachment dependency gap. No product changes or test/Git/compiler/build processes occurred in this discovery. No further writes to this scratch findings file are planned.

The retention supplement adds 13 source pins (28 unique reviewed paths across both pin sets):

```json
[
  {
    "path": "migrations/20260926_vault_documents_record_immutability.sql",
    "sha256": "9d2505cfafc564e89ee5eb6e4c949317d25cf422381b8b0dd0c2823ab8c63edf"
  },
  {
    "path": "server/services/document-data-disposition/impact.ts",
    "sha256": "daa53069c0d320240c20d272ca08e1a438a80560e769ba0c19cd4d27b4408ad4"
  },
  {
    "path": "server/services/document-data-disposition/service.ts",
    "sha256": "2cd0f80dc0e867fe0e260267c666e7409858ed5314030c68abf2e0f82f7a0ec6"
  },
  {
    "path": "shared/document-data-disposition.ts",
    "sha256": "6b89d0836dc28a0f78aa0f7e30fc344def6942b3d260a66ef60eb0ae96709997"
  },
  {
    "path": "server/jobs/retentionCron.ts",
    "sha256": "221600e73e255f33ce2348221529b50968d417324ca28003aaf021185531be8a"
  },
  {
    "path": "server/services/vault/vault-where-used.ts",
    "sha256": "79bf786e9af800e5b0e4460472cccef38780fce85ec047a71fc9d627f897cc8b"
  },
  {
    "path": "client/src/concept2cure/v2/surfaces/VaultVersions.tsx",
    "sha256": "c2225a1bedbdac54aec6be7a055f9a4cb47b6a60b480d46a747a559ff7decab7"
  },
  {
    "path": "server/routes/c2c/project-vault.ts",
    "sha256": "8a19ca03c117ef611ece16f871eea1fce8b47ffc41fce46f32e97323c1ef1653"
  },
  {
    "path": "server/services/authoring/authoring-file-to-vault.ts",
    "sha256": "571981600f70d03c05ee14937207cae4a2fb0ffcf6b02cef97f0fd58114a5926"
  },
  {
    "path": "server/services/tenant/tenant-offboarding.ts",
    "sha256": "0cb115e106fd6a1ac2cc61c537f0d1d5cf4f11561d7a3140ed02bf91e5ce385b"
  },
  {
    "path": "server/services/tenant/purge-held-doors.ts",
    "sha256": "9b49ad529f885ac4b3159c19e18cd61ff9cad3e0eb92cdff360164f9134776b3"
  },
  {
    "path": "tests/db/vault-record-immutability.dbtest.ts",
    "sha256": "1dea127ffe5879427a4d17a9a70cb208edb792a6d0432a1067b8fffd821d8d27"
  },
  {
    "path": "tests/db/vault-where-used.dbtest.ts",
    "sha256": "7b750957008be1ee3706060cfbb8f86e877a3fa6baa244901e6e3de4ab234a49"
  }
]
```
