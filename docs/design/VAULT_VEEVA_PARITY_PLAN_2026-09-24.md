# Vault and data room — Veeva parity plan

**Date:** 2026-09-24. **Author:** session `…01KnUGoX` (the Vault read-model and surface lane).
**Produced by:** workflow `wf_7221b784-39b`: six read-only mappers of HEAD (versioning and immutability,
lifecycle and signatures, security, taxonomy, data room, a Veeva and data-room checklist), three
independent plans (immutability-first, user-workflow-first, data-room-first), two adversarial judges,
a synthesizer and a completeness critic. Every claim below cites the tree as it stood on 2026-09-24.
Verify against HEAD before building on it.

**How to use this file.** It is a plan, not a queue anyone may take from. A slice is claimed on the
work-order board before work starts, it names its launch row (CLAUDE.md RULE 2), and it files evidence
under `docs/evidence/`. Where a slice touches another lane's files, the board is how that is agreed.
The **founder decisions** section lists what no session may decide.

## 1. Where the Vault stands

The Vault's intake and download paths are sound. Ingest hashes each file, checks its magic bytes, runs a fail-closed virus scan and writes a hash-chained Part 11 audit row in the same transaction (server/services/vault/vault-ingest.service.ts:452-647). A download is re-hashed against the record and refused if its audit row cannot be written (server/routes/c2c/project-vault.ts:273-298, :741). Filing is a deterministic proposal that a person confirms. Full-text search works. Since today, the tenant purge runs as one transaction, refuses while a legal hold is active, and erases the stored bytes (server/services/tenant/tenant-offboarding.ts:440-455, :526-565). Measured against Veeva, the core of document control is missing or broken. No screen can check in a new version, even though the 409 refusal tells users to (vault-ingest.service.ts:577-582; client/src/concept2cure/v2/useVaultUpload.ts:83). A vault document has no version history, lifecycle or signed approval, and the eCTD packager never asks whether a vault leaf is approved (server/services/ectd/leaf-source-resolver.ts:183-188, :551). The database does nothing to stop a recorded vault row from being changed or deleted: no vault.* table has a trigger, and a same-bytes re-upload rewrites the title, type, classification, lineage and storage pointer (vault-ingest.service.ts:475-512). The audit trail is real but hard to use. Downloads are written as unsequenced legacy chain rows, the document detail has no history (client/src/concept2cure/v2/surfaces/Vault.tsx:1508), and the signed export an inspector would receive reads audit_events only, so it contains no Vault event at all (server/services/audit/signedAuditExport.ts:188, :308). In this product "data room" means the internal capture → classify → file lane. Its counts were fixed today (ad0c34e2) and its filing cabinet now shows every filed document (20137569). It still has no file-to-Vault action, a classifier that proposes wrong CTD sections at 'high' confidence, and a cross-project capture gap. An external due-diligence room does not exist, and cannot exist under the current auth and RLS until the founder decides how outside parties are admitted. The plan below adds no parallel store: a version is a vault.documents row, a lifecycle is a canonical_documents row, a signature is an electronic_signatures row and history is audit_logs. The only new table is an optional data-room seal that needs the founder's approval.

## 2. Parity against Veeva Vault and a due-diligence data room

| Capability | Today | Evidence | Planned in |
|---|---|---|---|
| Governed ingest: content hash, magic bytes, fail-closed virus scan, chained audit row in the same transaction | **present** | server/services/vault/vault-ingest.service.ts:213-226, :613-647; server/routes/vault-ingest.ts:150 | n/a (kept; VR-05 and VR-08 extend it) |
| Hash-verified download, audited before any byte is sent | **partial** | server/routes/c2c/project-vault.ts:273-298 (the audit write goes through the pool, so the row is legacy with chain_seq NULL: server/services/audit/chain.ts:46-48); :741 readVerifiedVaultBytes | VR-01 |
| Check in a new version of a document (Upload New Version) | **absent** | vault-ingest.service.ts:577-582 (the 409 says upload a new version); useVaultUpload.ts:77-85 sends no version and no supersedes; server/routes/vault-ingest.ts:122-123 checks lineage ids for uuid format only | VR-08, VR-09 |
| Version history: every prior version viewable and downloadable | **absent** | client/src/concept2cure/v2/surfaces/Vault.tsx:1508 (no version-history endpoint); :1185-1186 claims uploads are 'version-tracked' | VR-09 |
| Major/minor version numbering | **absent** | shared/schema/vault.ts:111 (free text, default '1.0'); only QMS bumps a version (server/routes/mdx-qms.ts:628-675) | VR-08 (convention is FD1) |
| Check-out / cancel checkout lock on a binary | **absent** | document_locks has no readers or writers (shared/schema.ts:2062-2090); collab_section_locks covers authoring sections only (server/routes/realtime-collab.ts:493-560) | excluded: check-in without check-out is enough for immutable versions |
| Re-uploading identical bytes leaves the recorded version unchanged | **broken** | vault-ingest.service.ts:475-512 (the DO UPDATE rewrites title, type, classification, retention, lineage and the storage pointer); handed to the AnA client-files lane in 49293661 | VR-05 |
| Edit document fields, with old and new values in the audit trail | **absent** | only placement, storage migration, authoring compensation and retention UPDATE vault.documents (vault-placement.service.ts:309; storage-migration.service.ts:212; authoring-file-to-vault.ts:179; retentionCron.ts:175-184) | VR-05 |
| Database-enforced immutability of a recorded version (no UPDATE, TRUNCATE or DELETE) | **absent** | no CREATE TRIGGER on any vault.* table in migrations/ or db/migrations/; gcc RLS grants UPDATE and DELETE (db/migrations/044c_gcc_vault_schema.sql:131-139); scripts/db/provision-app-role.mjs:136-142 | VR-06, VR-07 |
| WORM storage (S3 Object Lock, recorded S3 VersionId) | **absent** | terraform/stack/vault_storage.tf:13-16 (versioning only, no Object Lock); s3_version_id has no writer (shared/schema/vault.ts:115) | excluded: D1 infrastructure, needs the AWS account and FD3 |
| Lifecycle state on a vault document (Draft / In Review / Approved / Superseded) | **absent** | vault.documents has only processing_status and placement_status (shared/schema/vault.ts:78-85, :134-158); the surface counts 'confirmed' as settled (Vault.tsx:208-210) | VR-13 |
| Part 11 e-signature on a lifecycle transition, bound to the version's content | **partial** | QMS approval is correct (server/services/qms/document-approval-signature.ts:168-338); canonical lifecycle signatures are 'csig:' JSON with no electronic_signatures row and no digest (server/services/regulatory/lifecycleBindings.ts:98-115) | VR-12, VR-13 |
| Tamper-evident lifecycle history; a signature cannot be replaced | **broken** | recordSignature overwrites at any stage (server/services/regulatory/canonicalDocumentStore.ts:207-224); verifyAuditChain checks links only (shared/regulatory/document-lifecycle.ts:257-268); audit is a mutable jsonb column (migrations/20260731c_canonical_documents.sql:29) | VR-03 |
| Approving the next version supersedes the prior steady-state version | **absent** | the canonical spine never increments a version (server/services/regulatory/documentLifecycleOrchestrator.ts:219-262); QMS revise mutates the effective row in place (server/routes/mdx-qms.ts:628-678) | VR-13 |
| Only approved, current versions are published into a submission | **broken** | server/services/ectd/leaf-source-resolver.ts:183-188 (no vault_documents entry); the vault branch at :551 never calls noteUnfinalized | VR-14 |
| Where-used: the sequences a version is placed in | **absent** | submission_leaves.document_uuid exists (migrations/20260917b_submission_leaf_document_uuid.sql) but the Vault has no reader of it | VR-14 |
| Per-document audit trail (Doc Info → Audit Trail) | **absent** | Vault.tsx:1508; the only readers are org-wide (server/routes/mdx-audit.ts:70-120; server/routes/audit-trail-ledger.routes.ts:398) | VR-01, VR-09 |
| Signed audit export that contains Vault events | **broken** | AdminSurfaces.tsx:967 → signedAuditExport.ts:188, :308 read audit_events only, while the ledger shows audit_logs (audit-trail-ledger.routes.ts:351-354) | VR-02 |
| Deterministic auto-classification (a proposal a person confirms) | **partial** | server/services/vault/vault-filing.service.ts:217; unanchored patterns and generic /safety/ before ISS at server/services/ctd-ingestion-service.ts:263-266; a 'N.0' fallback at :288-297 | VR-04 |
| Controlled vocabularies enforced when a filing is saved | **absent** | evidence_kind and ctd_section accept any string (server/routes/vault-ingest.ts:129-130; project-vault.ts POST /:id/file :1599) | VR-04 |
| Metadata values shown as labels, not raw tokens | **broken** | 'Looks like' shows the raw evidence_kind token (Vault.tsx:333, :1400-1401), while the tree labels it | VR-04 |
| Library browse reaches every document | **present** | 20137569 added the 'Filed under another view' branch to filingCabinet (project-vault.ts:507); the root cause (the view is not stored) is handed to …01DiJJAk (49293661) | n/a (landed today); VR-04 narrows the view fallback |
| Type/subtype hierarchy and required fields per type | **absent** | 16 flat ingest types (shared/constants/domain/vault-taxonomy.ts:71-75); ingest requires only code, title and type (server/routes/vault-ingest.ts:114-131) | excluded (new capability, no launch row) |
| Full-text search over title, file name and body | **present** | project-vault.ts:1349; migrations/20260906_vault_documents_fulltext.sql:55-71 | n/a (VR-09 adds the current-version default) |
| Faceted filtering by type, section, filing status and stage | **partial** | exact-match filters exist on the public API only (server/services/vault/vault-document-index.service.ts:189-211); the in-app search takes only q, limit and offset | VR-18 (FD8) |
| Saved searches and views | **absent** | the only saved-query store is for precedents (shared/schema.ts:18452) | excluded |
| Renditions and an in-browser viewer | **absent** | convertDocxToPdf has no callers (server/services/pdf-converter.ts:75); the Vault only downloads | excluded |
| Overlays, controlled-copy stamps and dynamic watermarks on served bytes | **absent** | the download streams raw bytes (project-vault.ts:1471); watermarks exist only on PDFKit-generated exports (server/services/universal-packager.ts:486-509) | excluded (FD12; a stamped copy changes the served hash) |
| Binders and auto document numbering | **absent** | the code is the raw filename (useVaultUpload.ts:83); no binder model | excluded; VR-15 adds data-room index numbering |
| Per-document or per-folder ACL, dynamic access control, classification enforced on read | **absent** | reads are open to every org role (project-vault.ts GET routes); classification is a filter only (vault-document-index.service.ts:199-204) | excluded (D3 FORCE-RLS first; extend doc_permissions when built) |
| Place and lift a legal hold; hold records immutable | **partial** | the record exists and the purge and retention honour it (shared/schema/vault.ts:298-326; tenant-offboarding.ts:440-455; retentionCron.ts:112-114); no route or UI; rows can be updated and deleted | VR-17 (FD7) |
| Retention schedule and disposition | **partial** | unscheduled job with a hard-delete branch audited only to a file (server/jobs/retentionCron.ts:175-184; server/utils/audit-logger.js:13-19); nothing writes retention_until | VR-07 makes it fail closed; the schedule is FD3 |
| Tenant purge destroys records and bytes atomically, respecting holds | **present** | tenant-offboarding.ts:526-565 (one client, BEGIN/COMMIT), :440-455 (hold refusal), eraseStoredObjects after commit | VR-07 routes its vault DELETE through the one owner-run function |
| Data-room intake: capture → classify → file | **partial** | project-vault.ts:1152-1267 (lane read, counts fixed in ad0c34e2); no file action; AnA's filing tool is refused unless ana.document_catalog is on (server/services/ana/document-tools-shared.ts:99-111) | VR-10, VR-11 |
| Bulk actions with a result per item | **absent** | no bulk endpoint; the multi-file picker posts one at a time (Vault.tsx upload picker) | VR-11 |
| Data-room index numbering and required-section coverage | **absent** | leaf num = ctd_section or '—' (project-vault.ts:456); the resolver exists (server/services/ectd/required-sections.ts:186) | VR-15 |
| Immutable intake record and 'filed as which version' | **absent** | checksum is write-once by convention only (migrations/20260829_cre_source_versioning.sql:4-9); 'filed' is a bare checksum join (project-vault.ts dataRoom block) | VR-16 |
| Duplicate detection by exact content | **partial** | vault-ingest.service.ts:716-733; UNIQUE (program_id, content_hash) exists only on install-fresh databases (db/migrations/044c_gcc_vault_schema.sql:106-107; scripts/db/deploy-migrate.mjs:30) | VR-08 makes check-in behaviour the same on every install path |
| Data-room seal: freeze a hash-verified snapshot | **absent** | no seal or snapshot model for vault documents | VR-19 (FD8, FD9) |
| Closing archive: the room's bytes, index and audit trail in one verifiable file | **absent** | the tenant export carries rows and a digest but no bytes (server/services/tenant-export/tenant-full-export.service.ts:71,210) | VR-20 (FD8, FD10) |
| External room: invitations, non-tenant principal, permission tiers, NDA, Q&A, expiry, per-viewer analytics, redaction, view-only | **absent** | client_access has no writer; the portal serves GET /overview only and reads public.documents (server/routes/client-portal.ts:88-266); authentication requires an organization_users row (server/auth.ts:196-216) | excluded (FD12) |
| Periodic review of vault documents | **absent** | exists only for QMS next_review_date (server/routes/mdx-qms.ts:409-426) | excluded |
| FORCE RLS and a NOT NULL tenant key on vault.* | **partial** | ENABLE without FORCE (db/migrations/044c_gcc_vault_schema.sql:112-139); organization_id is nullable (shared/schema/vault.ts:95-106); production boot refuses runtime-owned non-FORCE tables (server/db/rlsEnforcement.ts:164-290) | excluded (D3 lane) |

## 3. Slices, in order

Each slice is one focused session. "Extends" names the one canonical implementation it grows (zero
duplication); no slice adds a parallel store. A version is a `vault.documents` row, a lifecycle is a
`canonical_documents` row, a signature is an `electronic_signatures` row, and history is `audit_logs`.

### VR-01 — Every Vault download joins the sequenced audit chain, and each document shows its own history  `[M]`

- **Launch row:** D5 (§11.10(e): the audit trail must be available for review). recordVaultDownload calls writeChainedAuditRow(pool, …) with no transaction (server/routes/c2c/project-vault.ts:273-286). writeChainedAuditRow opens none of its own (server/services/auditService.ts:256-287), so chain.ts:46-48 records the row as legacy (chain_seq NULL), not serialized against concurrent writers. The Vault document detail says no history endpoint backs it (client/src/concept2cure/v2/surfaces/Vault.tsx:1508). Evidence: docs/evidence/D5-VAULT-HISTORY/<date>/, red run filed first.
- **Veeva capability:** Doc Info → Audit Trail: a per-document audit trail that includes downloads.
- **User outcome:** A user opens a Vault document and sees its History, newest first: - who ingested it, and with which SHA-256; - every filing decision, from → to; - every download: who, when, and which hash. Each entry shows the actor's name, its chain position, and whether it is sequenced or legacy. Every new download is a sequenced, HMAC-sealed chain row. A failed history read renders as an error, never as 'no history'. VR-09 widens the history to the whole version family.
- **Extends:** recordVaultDownload moves to a checked-out client running BEGIN / writeChainedAuditRow(client) / COMMIT. This is the shape the placement writer already uses (server/services/vault/vault-placement.service.ts:355-381). The audit-before-send order and the 500 AUDIT_WRITE_FAILED refusal stay. The history read is the org audit reader in server/routes/mdx-audit.ts:70-120, which already has the tenant predicate in its SQL, the actor-name join and the chain status. It is extracted into one exported function that also selects chain_seq and accepts a table_name plus a set of record_ids. GET /api/mdx/audit and the new GET /api/c2c/project-vault/:id/documents/:documentId/history both call it, so there is no second audit SQL.
- **Files:** `server/routes/c2c/project-vault.ts`, `server/routes/mdx-audit.ts`, `client/src/concept2cure/v2/surfaces/Vault.tsx`, `server/routes/__tests__/vault-download.test.ts`, `server/routes/__tests__/vault-document-history.test.ts`, `tests/db/vault-download-audit-sequenced.dbtest.ts`
- **Schema:** none. idx_audit_table_record (table_name, record_id) exists on 0000-provisioned databases (migrations/0000_sweet_joseph.sql:6968; shared/schema.ts:364). Confirm it with EXPLAIN on a deploy-migrated PostgreSQL 16. Only if it is absent there, add CREATE INDEX IF NOT EXISTS on audit_logs (tenant_id, table_name, record_id) in a new C2C_MIGRATION_FILES entry placed before UUID_TENANT_ISOLATION_NONPUBLIC (scripts/db/migration-set.mjs:2588).
- **Immutability:** Vault download rows become sequenced chain rows taken under the per-tenant advisory lock, replacing forkable legacy rows. The history shows audit_logs, where the database already refuses UPDATE and TRUNCATE, and refuses DELETE outside the archive path (db/migrations/20260617_audit_logs_immutability.sql, applied at scripts/db/migration-set.mjs:1582). Security plan P0-8 retires that archive bypass; nothing here depends on it.
- **Tests first:**
  - tests/db/vault-download-audit-sequenced.dbtest.ts (PostgreSQL 16, app_service, RLS enforcing): a vault download's audit_logs row has chain_seq NOT NULL. Red at HEAD (NULL, because it is written on the pool).
  - same file: two concurrent downloads plus one ingest in a single tenant produce consecutive chain_seq values, and verify-chain reports ok (GET /api/c2c/actions/verify-chain, server/routes/c2c/actions.ts:743).
  - server/routes/__tests__/vault-download.test.ts: an audit INSERT failing inside the transaction still returns 500 AUDIT_WRITE_FAILED and sends no body. This guards the existing contract and stays green.
  - server/routes/__tests__/vault-document-history.test.ts: GET …/history returns this document's ingest, file and download rows with actor name, contentHash and sequenced or legacy status. It excludes another document's rows. Another org's document id returns 404. Red: the route does not exist.
  - same file: GET /api/mdx/audit returns byte-identical results before and after the extraction (regression guard for the shared reader).
  - client: the History panel replaces the no-endpoint note at Vault.tsx:1508, and a rejected read renders the error state.
- **Ownership:** None blocking. project-vault.ts and Vault.tsx belong to this lane (…01KnUGoX, D5 row in docs/work-orders/README.md). Task K landed in 20137569 and the tree is clean. readVerifiedVaultBytes (project-vault.ts:741) is the released D1 lane's reader and is not edited. mdx-audit.ts has no lane claim; check its last-24h history before editing.
- **Founder decision:** none
- **Depends on:** nothing

### VR-02 — The signed audit export an inspector receives contains the Vault's events  `[M]`

- **Launch row:** D5 (§11.10(b): accurate and complete copies of records). The Admin audit trail displays audit_logs (server/routes/audit-trail-ledger.routes.ts:351-354). Its Export button (client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx:967 → GET /api/audit/export/signed) reads only audit_events (server/services/audit/signedAuditExport.ts:188, :308). So no vault ingest, filing or download event appears in any exported file. Evidence: docs/evidence/D5/<date>-signed-export-audit-logs/.
- **Veeva capability:** Audit trail export: a complete, verifiable copy for an inspector.
- **User outcome:** The organisation's signed export now contains every audit_logs row, Vault events included, each with its sha256_chain, chain_seq and seal, labelled by source. The same export can be narrowed to a resource type and a set of record ids, which VR-09 uses for 'export this document's history'. The file verifies at /api/audit/export/verify.
- **Extends:** generateSignedAuditExport (server/services/audit/signedAuditExport.ts) stays the one signed export. It gains audit_logs as a labelled second source, with resourceType and recordIds filters; the manifest and HMAC cover both sources. This is the first half of P1-19 in docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md:68 ('the signed export reads audit_logs as well as audit_events'). The KMS signature and export key-id halves of P1-19 are not taken here.
- **Files:** `server/services/audit/signedAuditExport.ts`, `server/routes/audit-trail-routes.ts`, `server/services/audit/__tests__/signedAuditExport-sources.test.ts`, `tests/db/signed-export-audit-logs.dbtest.ts`
- **Schema:** none
- **Immutability:** The exported file is sealed by the existing signed-export manifest, and its rows are the append-only audit_logs rows. Nothing becomes mutable.
- **Tests first:**
  - tests/db/signed-export-audit-logs.dbtest.ts: an export for an org that holds a vault.document.ingest row contains that row with its sha256_chain. Red at HEAD: 0 audit_logs rows.
  - same file, two-tenant fixture with RLS enforcing: tenant B's audit_logs rows never appear in tenant A's export.
  - /api/audit/export/verify accepts the new export, and refuses it after a one-byte change to any row.
  - the recordIds and resourceType filters return only rows for those records, and the manifest states the filter.
  - regression: an audit_events-only org exports the same rows as before.
- **Ownership:** signedAuditExport.ts and audit-trail-routes.ts carry no lane claim. P1-19's owner is 'eng (D5)', which is this lane's row: record on the board that the audit_logs-source half is taken, so the Part 11 substrate lane does not repeat it.
- **Founder decision:** none
- **Depends on:** nothing

### VR-03 — Lifecycle records cannot be rewritten: canonical_documents append-only in the database, and a verifier that recomputes hashes  `[M]`

- **Launch row:** D5. Today: - The lifecycle trail is a mutable jsonb column (migrations/20260731c_canonical_documents.sql:29), written by an unlocked read-modify-write (server/services/regulatory/canonicalDocumentStore.ts:163-204). - recordSignature overwrites a signature at any stage and appends no event (:207-224). - verifyAuditChain checks linkage only (shared/regulatory/document-lifecycle.ts:257-268). Evidence: docs/evidence/D5/<date>-lifecycle-append-only/.
- **Veeva capability:** Lifecycle state history and signatures are immutable and tamper-evident.
- **User outcome:** A document the API reports as chain-valid is tamper-evident: an edit to any recorded event is detected. A recorded approval cannot be replaced, and two concurrent transitions cannot fork the trail. A review that asks for revision (in_review → authoring) ends that review round. Its signature stays in the trail, and the next round records a fresh review sign-off. This is the precondition for putting a vault document on this spine (VR-12, VR-13).
- **Extends:** The one lifecycle spine. canonicalDocumentStore.persistState moves to FOR UPDATE inside one transaction. recordSignature becomes write-once and appends an audit event. advanceDocument clears reviewSignature only on in_review → authoring, the revision edge in LEGAL_TRANSITIONS (shared/regulatory/document-lifecycle.ts:162). The shared verifyAuditChain gains an injected hasher so the module stays crypto-free while recomputing sha256 over canonicalAuditPayload (:249-254). The trigger copies the esign_block_mutation shape (db/migrations/20260730_esign_audit_db_level_immutability.sql:35-66).
- **Files:** `server/services/regulatory/canonicalDocumentStore.ts`, `server/services/regulatory/documentLifecycleOrchestrator.ts`, `shared/regulatory/document-lifecycle.ts`, `server/services/regulatory/lifecycleBindings.ts`, `server/routes/document-lifecycle.ts`, `migrations/<date>_canonical_documents_append_only.sql`, `scripts/db/migration-set.mjs`, `tests/regulatory/document-lifecycle-pipeline.pglite.test.ts`, `shared/regulatory/__tests__/document-lifecycle.test.ts`, `tests/db/canonical-documents-append-only.dbtest.ts`
- **Schema:** One new C2C_MIGRATION_FILES entry, placed after migrations/20260731c_canonical_documents.sql (scripts/db/migration-set.mjs:2293) and before UUID_TENANT_ISOLATION_NONPUBLIC / TENANT_ISOLATION_SWEEP (:2588, :2599). It is guarded on to_regclass('public.canonical_documents'), a table that is already public with organization_id INTEGER NOT NULL. It uses CREATE OR REPLACE FUNCTION plus CREATE TRIGGER only when absent from pg_trigger (the esign idiom), with no DROP anywhere: a BEFORE UPDATE OR DELETE row trigger and a BEFORE TRUNCATE statement trigger. UPDATE rules: - audit must extend OLD.audit, keeping its prefix. - approval_signature may only go NULL → value. - review_signature may go NULL → value, or value → NULL only when OLD.stage = 'in_review', NEW.stage = 'authoring' and the audit array grew. - canonical_id, organization_id, created_at and source_refs are frozen. - content_hash is frozen once OLD.stage <> 'authoring'. - A superseded or withdrawn row is frozen entirely. DELETE and TRUNCATE are refused unless current_user owns the table. No purge deletes canonical_documents today (tenant-offboarding.ts lists it nowhere). When one does, it goes through VR-07's owner-run function. No table, no column.
- **Immutability:** Enforced by trigger: - the canonical lifecycle trail only grows; - approvals are written once; - a review round can close only by a recorded revision transition; - the source binding is frozen, and the content hash is frozen after authoring. The trigger name also goes on the list that security plan P0-9 checks at startup (every immutability trigger must exist) once that check lands.
- **Tests first:**
  - tests/db/canonical-documents-append-only.dbtest.ts (minted non-owner role through tests/db/harness.ts withSession): a raw UPDATE that rewrites audit[0].actor succeeds at HEAD (red), and is refused after.
  - shared/regulatory/__tests__/document-lifecycle.test.ts: verifyAuditChain on an event whose actor was edited while its hashes were left intact returns valid at HEAD (red), and invalid after.
  - pglite pipeline: POST /api/regulatory/documents/:id/sign 'approved' twice overwrites the first approval (red), then returns 409 SIGNATURE_ALREADY_RECORDED with the first one unchanged.
  - pglite pipeline: in_review → authoring → in_review records a second review signature, while the first stays in the audit array; a stale approval cannot be recorded without a new review.
  - real PostgreSQL: two concurrent advances on one document fork the trail at HEAD (red), and are serialized after.
  - DELETE and TRUNCATE by the runtime role are refused; negative control: without the new file applied, the raw UPDATE succeeds.
- **Ownership:** server/routes/document-lifecycle.ts is this lane's. canonicalDocumentStore.ts, lifecycleBindings.ts, documentLifecycleOrchestrator.ts and shared/regulatory/document-lifecycle.ts are unclaimed. scripts/db/migration-set.mjs is shared: rebase immediately before pushing, and run ci:migration-set-order and ci:migration-drop-safety.
- **Founder decision:** none
- **Depends on:** nothing

### VR-04 — Filing proposals you can trust, vocabularies held on save, and labels instead of tokens  `[M]`

- **Launch row:** D4. URS-VAULT-007 is rated high in RA-001 (docs/validation/RA-001-RISK-ASSESSMENT.md:53). The classifier's CTD patterns are unanchored substrings: 'Permission…' and 'Otherwise…' match /iss/ and /ise/ (server/services/ctd-ingestion-service.ts:264-265). The generic /safety\|adverse\|csr/ is tested before ISS (:263), so 'Integrated Summary of Safety.pdf' is proposed as 5.3.5. A module fallback emits a non-section 'N.0' at 0.4 (:288-297). Confidence 0.8 is labelled 'high' (vault-filing.service.ts:257-268). Evidence: docs/evidence/D4/<date>-vault-classifier-anchoring/, with OQ-002 re-run.
- **Veeva capability:** Auto-classification that suggests and a person confirms; controlled picklists enforced on save.
- **User outcome:** Beside 'Confirm filing', the proposal is either right or honestly 'needs review'. The type the uploader declared informs it, and a conflict between filename and declared type is flagged instead of overridden. A filing with an evidence kind outside the list, or a section that is not a CTD section code ('banana', a bare module '3'), is refused on save with the vocabulary named. A transient database error no longer silently files against the TMF view. The detail pane and the data-room tooltip say 'Clinical study report', not 'csr'.
- **Extends:** The one classifier, fixed in place with no second rule table: - detectCTDSection's SECTION_PATTERNS (ctd-ingestion-service.ts:248-268) get word boundaries, the ISS/ISE patterns move ahead of the generic safety pattern, and the 'N.0' fallback is removed (it returns the module with no section). - classifyForFiling (server/services/vault/vault-filing.service.ts:217) gains an optional documentType input in FilingInput (:49-56), mapped to VaultDocKind in shared/constants/domain/vault-taxonomy.ts. - resolveVaultView's catch-all fallback to 'service' (:355-363) is narrowed to 42P01. Writers use the shared validators: - VAULT_DOC_KINDS (vault-taxonomy.ts:152) for evidence_kind; - validateSectionCode(…, 'ctd') (shared/regulatory/placement-vocabulary.ts:248-278) for ctd_section, on POST /api/vault/ingest (server/routes/vault-ingest.ts:129-130) and POST /:id/file (project-vault.ts:1599). This does NOT use headingPathFor: it matches by prefix and returns null for every Module 1 code (server/services/submission-gateways/ectd-packager/ich-headings.ts:178-199). validateSectionCode accepts '2.0' by shape (shared/regulatory/section-code.ts:85), and EU Module 1 has a real 1.0. So 'N.0' is stopped at its source, the detector. Tightening the shared validator for modules 2-5 would change leaf placement too, so it is handed to the D7 lanes. Labels come from KIND_LABEL (Vault.tsx:333, :1400-1401).
- **Files:** `server/services/ctd-ingestion-service.ts`, `server/services/vault/vault-filing.service.ts`, `shared/constants/domain/vault-taxonomy.ts`, `server/routes/vault-ingest.ts`, `server/routes/c2c/project-vault.ts`, `client/src/concept2cure/v2/surfaces/Vault.tsx`, `server/services/vault/__tests__/vault-filing.service.test.ts`, `server/routes/__tests__/vault-file-vocabulary.test.ts`, `client/src/concept2cure/v2/__tests__/vaultSurfaceLabels.test.tsx`, `server/services/vault/vault-ingest.service.ts (one line: pass documentType at the classifyForFiling call, ~:416)`
- **Schema:** none. CHECK constraints on evidence_kind and ctd_section are deliberately not added. Existing rows hold the classifier's 'N.0' values, and PostgreSQL enforces even a NOT VALID CHECK on every later UPDATE of a row, which would make legacy rows impossible to place or back-fill.
- **Immutability:** n/a. This narrows what a governed filing decision can record, so out-of-vocabulary values never enter the chained placement audit.
- **Tests first:**
  - vault-filing.service.test.ts: 'Permission to cross-reference.pdf' and 'Otherwise unrelated memo.docx' (pharma) are not 5.3.5.3 'high'. Red today.
  - 'Integrated Summary of Safety.pdf' proposes 5.3.5.3. Red today: 5.3.5, because /safety/ is tested first. This is a failing case, not a control.
  - 'Safety Data Sheet - ethanol.pdf' is not 5.3.5 'high'; 'Item2 notes.pdf' yields no section. Both red today.
  - Positive controls, green before and after: 'Clinical Overview.pdf' → 2.5; 'ISS tables.pdf' → 5.3.5.3; 'stability-protocol.pdf' → 3.2.P.8; 'cover letter.pdf' → 1.1.
  - A declared documentType PROTOCOL on a neutral filename gives evidenceKind 'protocol'. A declared type that contradicts the filename rule gives needsReview naming both.
  - server/routes/ctd-onboarding.ts:269, the second caller of detectCTDSection: run its tests and record every changed proposal.
  - vault-file-vocabulary.test.ts: POST /:id/file with ctdSection 'banana' or evidenceKind 'nonsense' returns 422 with nothing written, and POST /api/vault/ingest with ctdSection 'banana' returns 400. Red today: stored and audited as a decision.
  - resolveVaultView: a non-42P01 error propagates. Red today: it degrades to 'service'.
  - vaultSurfaceLabels.test.tsx: evidenceKind 'csr' renders 'Clinical study report' at both places. Red today.
- **Ownership:** vault-filing.service.ts, ctd-ingestion-service.ts, vault-taxonomy.ts and routes/vault-ingest.ts are unclaimed; the last commits were before 09-23. The one-line documentType pass-through is in vault-ingest.service.ts, claimed by …01DiJJAk (docs/work-orders/README.md, AnA client-files row): claim the hunk with that lane's consent, or land everything else and hand the line on. 49293661 handed that lane 'the filing view is not stored'. Narrowing the fallback here is complementary, so tell them. The chat capture call (server/routes/chat/upload.ts:459-487) keeps its input unchanged.
- **Founder decision:** none
- **Depends on:** nothing

### VR-05 — Re-uploading a recorded file changes nothing; fields change only through a governed Edit details  `[L]`

- **Launch row:** D5 (§11.10(e): a change must not obscure what was recorded). A same-hash retry runs ON CONFLICT … DO UPDATE and overwrites document_title, document_type, classification, retention_policy, parent_document_id and supersedes_id (nulling them when omitted), plus file_name and the storage pointer (server/services/vault/vault-ingest.service.ts:475-512). The only audit is another vault.document.ingest row carrying the new values (:613-647), and the prior stored copy is orphaned. This was handed to the AnA client-files lane in 49293661. Evidence: docs/evidence/D5/<date>-vault-reupload-noop/.
- **Veeva capability:** A version's recorded fields never change as a side effect of an upload. Field edits are audited with old and new values.
- **User outcome:** Re-uploading a file already in the Vault returns the existing record unchanged. The response names any fields that differ ('Already in the Vault as Protocol; use Edit details to change it'), and the redundant stored copy is removed. A user changes a document's title, type or confidentiality classification through Edit details, with a written reason. The History (VR-01) shows exactly which fields changed, from what to what, by whom and why. The filing audit row now records the evidence kind before and after. An API caller can no longer attach a raw supersedesId or parentDocumentId, which today are checked only as uuids (server/routes/vault-ingest.ts:122-123). No client sends them (useVaultUpload.ts:77-85; Etmf.tsx:318-324; server/services/ana/document-catalog-tools.ts:581-593).
- **Extends:** ingestVaultDocument's upsert (vault-ingest.service.ts:475): - It becomes ON CONFLICT DO NOTHING plus a FOR UPDATE re-read of the occupying row. - Equal hash: unchanged:true, no audit row, and the retry's copy goes through the one discard path (server/services/vault/vault-ingest-discard.ts:69-122), which never deletes referenced bytes. - Different hash: the existing 409 VERSION_CONTENT_CONFLICT. The metadata writer is editVaultDocumentMetadata, added beside placeVaultDocument in vault-placement.service.ts with the same shape: program ownership, vaultWriteRefusal, FOR UPDATE, then UPDATE plus a from/to/reason writeChainedAuditRow on one client. writePlacement's audit gains evidenceKind in from/to (:367-377). The vocabularies are VR-04's. Working agreement: two behaviours go away, and the commit names each replacement and its test. - Changing type or title by re-uploading is replaced by Edit details, via POST /api/c2c/project-vault/:id/documents/:documentId/details and the Vault detail pane. - Re-proposing placement on a retry is replaced by the existing Confirm / Move actions over placeVaultDocument.
- **Files:** `server/services/vault/vault-ingest.service.ts`, `server/services/vault/vault-placement.service.ts`, `server/routes/vault-ingest.ts`, `server/routes/c2c/project-vault.ts`, `client/src/concept2cure/v2/surfaces/Vault.tsx`, `client/src/concept2cure/v2/useVaultUpload.ts`, `server/routes/__tests__/vault-ingest-conflict.pglite.integration.test.ts`, `tests/db/vault-ingest.dbtest.ts`, `tests/db/vault-placement.dbtest.ts`, `tests/db/vault-metadata-edit.dbtest.ts`
- **Schema:** none
- **Immutability:** No ingest path can rewrite a recorded version's descriptive fields, lineage or storage pointer. The only writer of descriptive fields records before, after and reason in the append-only chain. This is the precondition for VR-06's trigger: the old DO UPDATE would trip it.
- **Tests first:**
  - vault-ingest-conflict.pglite.integration.test.ts: its ON_CONFLICT regex (:44-56) is rewritten to the DO NOTHING contract in the same commit, and shown red against HEAD.
  - same file: a same-hash retry with a different title, type, classification and retention leaves the row byte-equal, including s3_key and storage_version_id. Red today.
  - tests/db/vault-ingest.dbtest.ts: a retry that omits supersedesId does not null a recorded one. An identical retry writes no second ingest audit row, and its stored copy is deleted while the original copy is kept. Both red today.
  - Control, green before and after: different bytes at an occupied (program, code, version) return 409 VERSION_CONTENT_CONFLICT with the original hash intact.
  - vault-metadata-edit.dbtest.ts: POST details without a reason returns 422. With a reason, it writes exactly one chained row carrying from/to of the changed fields and the reason. A viewer gets 403; another org's document gets 404; a type outside VAULT_INGEST_DOCUMENT_TYPES gets 422.
  - vault-placement.dbtest.ts: the filing audit row carries evidenceKind in from/to. Red today.
  - A raw supersedesId or parentDocumentId in the ingest body returns 400. Red today: persisted.
  - AnA place_project_document and authoring file-to-vault suites stay green (agent → suggested kept).
- **Ownership:** vault-ingest.service.ts and vault-placement.service.ts are claimed by …01DiJJAk (docs/work-orders/README.md, AnA client-files row), touched today in 370d9a75, b609f95b and d36d7467. This exact finding was handed to that lane in 49293661. Execute it in that lane, or by an agreement recorded on the board; do not race it. The follow-through lane's V1 (filing sends no reason) is also with that lane: take it here only if agreed. project-vault.ts and Vault.tsx belong to this lane.
- **Founder decision:** none (whether an approved version may be corrected in place is FD6, enforced in VR-13)
- **Depends on:** VR-04

### VR-06 — The database refuses any change to a recorded vault version's identity, bytes or lineage  `[M]`

- **Launch row:** D5. No vault.* table has a trigger. The gcc RLS grants UPDATE to program writers (db/migrations/044c_gcc_vault_schema.sql:131-139), and the runtime role has full DML on the vault schema (scripts/db/provision-app-role.mjs:136-142). So `UPDATE vault.documents SET content_hash='x'` succeeds today. The record-class policy (docs/compliance/part11-immutability-record-class-policy.md:26-39) has no vault row. Evidence: docs/evidence/D5/<date>-vault-record-immutability/, with that UPDATE shown succeeding first.
- **Veeva capability:** Steady-state versions are locked: content and identity can never be edited, only superseded.
- **User outcome:** A regulatory user or an inspector can rely on this: once a version is in the Vault, no application path and no session holding the runtime role can change its bytes pointer, SHA-256, size, MIME type, code, version label, program, tenant, uploader or lineage. The database refuses. Descriptive fields change only through VR-05's audited writer, and filing only through placement.
- **Extends:** The esign_block_mutation shape (db/migrations/20260730_esign_audit_db_level_immutability.sql:35-66): a column diff with named write-once exceptions. Plus the doc_revisions statement-level TRUNCATE trigger (db/migrations/20260817_doc_revisions_immutable_ledger.sql:66-75). It applies to the existing vault.documents table; there is no new store.
- **Files:** `migrations/<date>_vault_documents_record_immutability.sql`, `scripts/db/migration-set.mjs`, `scripts/ci/check-vault-document-writers.mjs`, `package.json`, `docs/compliance/part11-immutability-record-class-policy.md`, `tests/db/vault-record-immutability.dbtest.ts`, `server/__tests__/migrations/vault-documents-record-immutability.pglite.integration.test.ts`
- **Schema:** One new C2C_MIGRATION_FILES entry after every file that alters vault.documents, i.e. after migrations/20260911_vault_evidence_citations.sql (scripts/db/migration-set.mjs:2195), and before UUID_TENANT_ISOLATION_NONPUBLIC (:2588). Guarded on to_regclass('vault.documents'). CREATE OR REPLACE FUNCTION vault.documents_record_guard() plus CREATE TRIGGER only when absent from pg_trigger, with no DROP: a BEFORE UPDATE row trigger and a BEFORE TRUNCATE statement trigger. Column rules: - Frozen: id, program_id, version, content_hash, file_size, mime_type, created_by, created_at. - Write-once, NULL → value only: organization_id, document_code, file_name, filename, s3_key, s3_bucket, storage_version_id, storage_provider, s3_version_id, retention_policy, supersedes_id, parent_document_id, deleted_at. The write-once list is exactly what makes the backfills that replay on every deploy pass: migrations/20260821_vault_documents_canonical_shape.sql:121-131, :149, and migrations/20260905_vault_documents_organization_id.sql:96-102. Every one of them is `WHERE x IS NULL`. One transition exception: s3_key, s3_bucket and storage_provider may change value → value only in the UPDATE that sets storage_version_id NULL → value with content_hash unchanged. That is the storage adoption at server/services/vault/storage-migration.service.ts:211-224. Mutable, each through its named writer: - document_title, document_type, classification (VR-05's edit writer; also NULL → value backfills); - folder_id, evidence_kind, ctd_section, placement_*, placed_by, placed_at (placement writer); - processing_status, processed_at, processing_error, extracted_text, page_count, word_count, language, storage_class, retention_until, updated_at. No table and no column.
- **Immutability:** BEFORE UPDATE and BEFORE TRUNCATE triggers, firing for every role, protect each version's identity, byte pointer, hash, lineage and uploader. Only the table owner can disable a trigger. The production runtime role cannot own vault.documents, because production boot refuses runtime ownership of RLS-enabled non-FORCE tables (server/db/rlsEnforcement.ts:164-290). A CI gate pins the set of code sites that may UPDATE the table. The trigger name joins security plan P0-9's startup self-check when that lands. A future change to the frozen list must amend this file in place with a dated header.
- **Tests first:**
  - tests/db/vault-record-immutability.dbtest.ts, as a minted non-owner role through tests/db/harness.ts withSession: UPDATE content_hash is refused with IMMUTABILITY_VIOLATION. Red at HEAD: 1 row updated, filed under red/.
  - same file: version, document_code, program_id and organization_id value → value are refused; storage_version_id value → other is refused; deleted_at back to NULL is refused; supersedes_id value → other is refused; TRUNCATE is refused. Each is red at HEAD.
  - Controls, green before and after: placeVaultDocument confirm, move and unfile (tests/db/vault-placement.dbtest.ts); the storage adoption (server/services/vault/__tests__/storage-migration.pglite.integration.test.ts); the authoring compensation soft-delete (authoring-file-to-vault pglite suite); VR-05's edit and same-hash retry.
  - Rule 1 replay (pglite): insert legacy rows with NULL document_code, s3_key, s3_bucket, file_name and organization_id, then apply the whole set twice. Both runs are green and the backfills fill the NULLs.
  - Negative control: without the new file, the same raw UPDATE succeeds.
  - scripts/ci/check-vault-document-writers.mjs selftest: a planted `UPDATE vault.documents` outside the named writers (placement, metadata edit, storage-migration, authoring compensation, retention soft-delete) fails the gate. Shown red on the plant.
- **Ownership:** The new migration, the CI gate and the policy doc are unclaimed. migration-set.mjs is shared: rebase immediately before pushing, and run ci:migration-set-order and ci:migration-drop-safety. The control suites belong to …01DiJJAk and the released D1 lane; they are run here, not edited.
- **Founder decision:** none
- **Depends on:** VR-05

### VR-07 — A recorded vault version cannot be deleted except by the tenant purge, through one owner-run function  `[M]`

- **Launch row:** D5 and D6. Today any runtime-role DELETE of a vault row succeeds. The retention job hard-deletes when a policy says so (server/jobs/retentionCron.ts:175-184) and audits that only to a file logger (server/utils/audit-logger.js:13-19). The security audit is retiring the runtime-settable bypass GUC as a pattern (P0-8, docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md:31), so it is not copied here. Evidence: docs/evidence/D5/<date>-vault-record-no-delete/.
- **Veeva capability:** Versions are retained; destruction happens only through governed disposition.
- **User outcome:** No person, job, tool or runtime-role session can remove a recorded version. The only exception is the platform-admin tenant purge, and only for an organization already pending deletion with no active legal hold. Retention can at most tombstone (deleted_at) until the founder decides the retention policy.
- **Extends:** VR-06's migration, amended in place with a dated header: - A BEFORE DELETE row trigger refuses unless current_user is the table's owner. - A new SECURITY DEFINER function, public.purge_tenant_vault_records(p_org integer), is owned by that owner, with SET search_path = pg_catalog, vault, public, REVOKE ALL FROM PUBLIC, and EXECUTE granted to the runtime role. - The function restates at the database the two preconditions the purge already checks in code. It refuses unless organizations.status = 'pending_deletion' (set at server/services/tenant/tenant-offboarding.ts:161) and no vault.legal_holds row for the org is active (as :440-455 checks). It then deletes that org's vault.document_chunks and vault.documents rows using VAULT_DOCUMENT_TENANCY's predicate. A pglite contract test pins that the SQL copy selects the same rows as server/services/tenant/vault-tenancy.ts. - purgeTenant already runs on one checked-out client (tenant-offboarding.ts:526-565, from 2ddb77b0). For vault.documents it calls the function inside that transaction instead of the generic DELETE. The same function is where later immutable-record tables (VR-16, VR-19) are purged.
- **Files:** `migrations/<date>_vault_documents_record_immutability.sql (VR-06's file, amended in place with a dated header)`, `server/services/tenant/tenant-offboarding.ts`, `server/jobs/retentionCron.ts`, `tests/db/vault-record-immutability.dbtest.ts`, `tests/db/tenant-purge.dbtest.ts`, `server/services/tenant/__tests__/tenant-purge-vault-scope.pglite.integration.test.ts`, `tests/db/harness.ts`
- **Schema:** No table and no column. VR-06's file gains a trigger created conditionally with no DROP, plus one CREATE OR REPLACE FUNCTION public.purge_tenant_vault_records(integer) SECURITY DEFINER, with REVOKE and GRANT statements that are idempotent on replay.
- **Immutability:** Recorded versions cannot be deleted by the runtime role at all. Destruction goes through one owner-run function that refuses unless the organization is pending deletion and holds no active legal hold. TRUNCATE is refused by VR-06. Where the runtime role owns the table (dev, pglite) the guard is inert; production boot forbids that ownership (server/db/rlsEnforcement.ts:164-290). This limit is stated in the evidence.
- **Tests first:**
  - tests/db/vault-record-immutability.dbtest.ts, as a minted non-owner role: DELETE FROM vault.documents WHERE id = … is refused. Red at HEAD: 1 row deleted.
  - Same role: SET LOCAL of any GUC followed by DELETE is still refused, which proves there is no settable bypass.
  - The function refuses an org whose status is not 'pending_deletion', and refuses an org with an active hold.
  - tests/db/tenant-purge.dbtest.ts: the purge still removes the tenant's vault rows and bytes, and a hold still refuses it. Green before and after.
  - Retention: runRetention with a hard_delete policy on an expired document leaves the row in place and reports the refusal in its summary. Red at HEAD: deleted at retentionCron.ts:183.
  - Cleanup audit: run all 14 suites that DELETE vault.documents (server/mcp/__tests__/mcp-connector.dbtest.ts; server/routes/__tests__/vault-ingest-conflict.pglite.integration.test.ts; server/services/tenant/__tests__/tenant-purge-vault-scope.pglite.integration.test.ts; server/services/vault/__tests__/vault-document-index.pglite.integration.test.ts; tests/db/{document-catalog-recall,document-catalog,rag-pipeline-tenant-scope,tenant-purge,vault-catalog-tenant-isolation,vault-chunk-backfill,vault-chunking-off,vault-ingest,vault-passage-search,vault-placement}.dbtest.ts). Owner-connection cleanups stay green. Any that deletes as a minted role moves to one harness helper that cleans up as the owner.
- **Ownership:** tenant-offboarding.ts was released by the D6 purge lane after 2ddb77b0; re-read HEAD before editing. retentionCron.ts's discarded audit write belongs to WO-16C (…01E8btkB, claimed): touch only the hard-delete outcome reporting, and tell that lane. The 14 cleanup suites sit mostly in …01DiJJAk's test area: run them, and edit only for the harness helper, by agreement.
- **Founder decision:** none (whether retention may ever destroy a version is FD3; until then the database refuses)
- **Depends on:** VR-06

### VR-08 — Check in a new version of a vault document, with lineage the database validates (server)  `[L]`

- **Launch row:** D2, with D7 following. The Vault's own 409 says 'Upload it under a new version' (server/services/vault/vault-ingest.service.ts:577-582), and nothing can do that. A D7 leaf 'replace' needs a successor version to name. Evidence: docs/evidence/D2-VAULT-VERSIONS/<date>/. A new URS-VAULT versioning requirement and an OQ step are added to the D4 package.
- **Veeva capability:** Upload New Version (check-in): one document identity, one version history.
- **User outcome:** A user records revised bytes as the next version of an existing document by naming that document; VR-09 adds the UI. The server assigns the version, keeps the document code and filing, and links the predecessor. A forged, cross-program or cross-tenant lineage pointer cannot be recorded. Two people checking in against the same version cannot both succeed. Checking in bytes identical to an earlier version is refused the same way on every install path.
- **Extends:** ingestVaultDocument over the existing row-per-version model: UNIQUE (program_id, document_code, version) at shared/schema/vault.ts:174-178. The new body field supersedesDocumentId triggers these steps inside the ingest transaction, following the algorithm at server/services/ana/artifactVersionStore.ts:252-330: 1. Lock the head row FOR UPDATE. 2. Require it to be in the caller's program and tenant, and current (no live successor). 3. Refuse bytes equal to any family version. 4. Assign the next version per FD1. 5. Insert with supersedes_id set and the head's document_code, inheriting the head's filing. The ingest audit row records the inheritance. The 409 VERSION_CONTENT_CONFLICT names the check-in path. This deliberately does NOT build vault.document_versions (VAULT_DATA_ROOM_ASSESSMENT_2026-09-05.md:855): it would duplicate the row model in a schema that no RLS sweep covers.
- **Files:** `server/services/vault/vault-ingest.service.ts`, `server/routes/vault-ingest.ts`, `migrations/<date>_vault_documents_version_lineage.sql`, `scripts/db/migration-set.mjs`, `tests/db/vault-version-checkin.dbtest.ts`, `server/routes/__tests__/vault-ingest-conflict.pglite.integration.test.ts`
- **Schema:** One new C2C_MIGRATION_FILES entry after VR-06's file and before UUID_TENANT_ISOLATION_NONPUBLIC, guarded on to_regclass('vault.documents'). No table, no column, no FK, no DROP. (a) CREATE OR REPLACE FUNCTION vault.documents_lineage_guard(), plus a conditional BEFORE INSERT trigger. When NEW.supersedes_id is not null, it takes pg_advisory_xact_lock on the predecessor id, then requires that the predecessor exists, is not tombstoned, has the same program_id, document_code and organization_id, and has no live successor; otherwise it raises VAULT_LINEAGE_INVALID. This enforces 'one successor, same family' for every new write regardless of legacy data. (b) A partial unique index vault_documents_one_successor ON vault.documents (supersedes_id) WHERE supersedes_id IS NOT NULL AND deleted_at IS NULL, created only when no duplicate pointer exists. Otherwise it RAISEs NOTICE with the count and skips. A data condition never becomes an exception, because deploy-migrate stops on the first failure (scripts/db/deploy-migrate.mjs:351). A self-FK is deliberately not added. Even NOT VALID, it would make the tenant purge fail on any legacy cross-tenant pointer, and ON DELETE SET NULL would violate VR-06's write-once rule.
- **Immutability:** Lineage becomes append-only and validated by the database: at most one live successor per version, never across program, code or tenant. With VR-06, a written link can never be re-pointed or cleared.
- **Tests first:**
  - tests/db/vault-version-checkin.dbtest.ts (PostgreSQL 16, app_service, RLS on): a check-in against v1 creates a row with v1's document_code, the next version per FD1 and supersedes_id = v1.id, and leaves v1 byte-equal. Red: the field does not exist and the upload returns 409.
  - supersedesDocumentId naming another tenant's document returns 404, with no row and no stored object. A viewer gets 403 before any byte is stored.
  - A raw INSERT whose supersedes_id names another program's row is refused by the database. Red at HEAD: accepted.
  - Two concurrent check-ins against v1: exactly one 201, and the other gets 409 VERSION_NOT_CURRENT naming the new head.
  - A check-in whose bytes equal v1 gets 409 CONTENT_ALREADY_A_VERSION naming v1, on schemas with and without idx_vault_documents_program_hash_unique (db/migrations/044c_gcc_vault_schema.sql:106-107). Red: DUPLICATE_CONTENT on gcc installs, an unrelated row on deploy-migrated ones.
  - A head with a non-numeric version (eSTAR's sha prefix, server/services/pathway-engines/estar/estar-artifact-retention.ts:22-29; authoring's 'draft-<sha8>', server/services/authoring/authoring-file-to-vault.ts:284-298) gets 409 VERSION_SCHEME_UNKNOWN; no version is invented. A client-sent version together with supersedesDocumentId gets 400 VERSION_IS_ASSIGNED.
  - Replay: apply the set twice on a database seeded with two rows sharing a supersedes_id. Both runs are green, a NOTICE is emitted, and a third successor INSERT is refused by the trigger.
  - Controls: eSTAR retention and authoring file-to-vault are unchanged.
- **Ownership:** vault-ingest.service.ts belongs to …01DiJJAk: coordinate as in VR-05, ideally in the same handoff. routes/vault-ingest.ts is unclaimed. migration-set.mjs is shared.
- **Founder decision:** FD1 (version numbering) must be answered before this ships, because VR-06 freezes the label once written. FD2 (revert) ships as a refusal until decided.
- **Depends on:** VR-05, VR-06

### VR-09 — See every version in the Vault, download any of them, and upload the next one  `[M]`

- **Launch row:** D2, with D4 URS/OQ follow-through. The detail pane shows only the current version and says no version-history endpoint exists (client/src/concept2cure/v2/surfaces/Vault.tsx:1508), while the empty state claims uploads are 'version-tracked' (:1185-1186). Evidence: docs/evidence/D2-VAULT-VERSIONS/<date>/, with red/green surface tests.
- **Veeva capability:** Doc Info → Versions: view and download any prior version, and Upload New Version from the document.
- **User outcome:** The tree lists one entry per document, showing the current version and a count ('v2.0 · 2 versions'). The detail lists every version with version, SHA-256 prefix, size, uploader and date. Any version downloads through the hash-verified, audited route. 'Upload new version' works from the detail pane, and a 409 conflict offers 'Upload as a new version of <title>' instead of a dead end. History (VR-01) spans the whole family and can be exported as a signed file (VR-02's recordIds filter). Search hides superseded versions by default, with an 'include earlier versions' toggle. The document count counts documents, not versions (URS-VAULT-004). A legacy lineage pointer that fails validation is shown as 'unverified link', never drawn as lineage.
- **Extends:** The canonical Vault read model: - filingCabinet (project-vault.ts:507) and the uploads window group rows by family. - A new GET /:id/documents/:documentId/versions sits beside GET /:id. - The existing download route (:1471) already addresses any row id through readVerifiedVaultBytes (:741) and VR-01's transactional audit, so there is no second byte path. - The search route (:1349) gets a current-only default using the successor relation. - useVaultUpload.ts, the one client ingest path, gains supersedesDocumentId and sends no documentCode for a check-in.
- **Files:** `server/routes/c2c/project-vault.ts`, `client/src/concept2cure/v2/surfaces/Vault.tsx`, `client/src/concept2cure/v2/useVaultUpload.ts`, `server/routes/__tests__/vault-versions.test.ts`, `server/routes/__tests__/vault-tree-bounded.test.ts`, `server/routes/__tests__/vault-search.test.ts`, `client/src/concept2cure/v2/__tests__/vaultCheckInVersion.test.tsx`, `docs/validation/URS-002-VAULT.md`, `docs/validation/OQ-002-VAULT.md`
- **Schema:** none
- **Immutability:** n/a (read path and UI). Prior versions are served only through the hash-verifying reader, with the download audited before any byte is sent.
- **Tests first:**
  - vault-tree-bounded.test.ts: two rows in one family render ONE leaf carrying the head version and versionCount 2. Red: two leaves.
  - vault-versions.test.ts: GET …/versions returns the family newest first, with hashes and uploaders; another tenant's id returns 404; a legacy pointer outside the family is marked unverified.
  - The header's document count equals the number of families, not rows.
  - vault-search.test.ts: a superseded version is excluded by default and included with includeSuperseded=true, and the total counts the same set.
  - vaultCheckInVersion.test.tsx: 'Upload new version' posts supersedesDocumentId and no documentCode. The 409 conflict renders the check-in offer. The version list renders hash prefixes and uploaders. The empty-state copy asserts only what the product does.
  - History for a family includes every version's ingest, filing and download rows, and the per-document export contains exactly those rows.
- **Ownership:** All files belong to this lane except useVaultUpload.ts, which is unclaimed. readVerifiedVaultBytes is not edited.
- **Founder decision:** none
- **Depends on:** VR-08, VR-01, VR-02

### VR-10 — A file captured into a project appears in that project's data room  `[M]`

- **Launch row:** D2 (the Projects and Vault launch surfaces must not undercount by omission). findSourceByChecksum is org-wide (server/services/clinical-regulatory-evidence/evidence-spine.service.ts:312-330). The capture reuses its match without re-scoping it (server/routes/chat/upload.ts:434-445). So bytes already captured in project A never appear in project B's data room, Project home sources or pin list. This was inferred from code, so it is shown failing first. Evidence: docs/evidence/D2/<date>-capture-project-scope/.
- **Veeva capability:** A document loaded against a product or room appears in that room.
- **User outcome:** Dropping into Project B a file whose bytes were first captured in Project A makes it appear in B's data room, B's Project home sources and B's AnA pin list. Re-dropping the same bytes into the same project still resolves to the one existing source. A's citations and 'used in' back-references are unchanged.
- **Extends:** findSourceByChecksum takes the capture's program scope, the same scope findSupersededCandidate already applies (evidence-spine.service.ts:355-385). The capture call site in upload.ts's source-identity block passes it. cre_evidence_sources has no unique constraint on checksum, so two project-scoped rows with one checksum are already storable.
- **Files:** `server/services/clinical-regulatory-evidence/evidence-spine.service.ts`, `server/routes/chat/upload.ts (source-identity block :427-445 only)`, `server/services/clinical-regulatory-evidence/__tests__/canonical-source-identity.pglite.integration.test.ts`, `server/routes/c2c/__tests__/projects-sources-scope.test.ts`
- **Schema:** none
- **Immutability:** n/a
- **Tests first:**
  - pglite: capture bytes X into program A, then into program B. listClientDocuments(org, {programId: B, currentOnly: true}) contains a source with checksum X. Expected red at HEAD; if it is green, the finding is withdrawn and the slice closes with that evidence.
  - The same bytes captured twice into A resolve to one source id (the existing contract).
  - A capture with no project scope never adopts a project-scoped source.
  - Project home /sources for B lists the capture (server/routes/c2c/projects.ts ~:1487), and A's 'used in N sections' count for its source is unchanged.
- **Ownership:** evidence-spine.service.ts is unclaimed (task J's edit landed in ad0c34e2). Only the retrieval-atom blocks of chat/upload.ts are claimed by …01DiJJAk; this edit is in the source-identity block outside them, but it is the same file, so tell that lane first.
- **Founder decision:** none
- **Depends on:** nothing

### VR-11 — File from the data room into the Vault, and confirm filings in bulk, with a result for every item  `[L]`

- **Launch row:** D2. The capture lane dead-ends. In a default tenant nothing moves a captured source to 'filed' except re-uploading identical bytes on the Vault page. AnA's file_chat_upload_to_vault is refused because ana.document_catalog is off (server/services/ana/document-tools-shared.ts:99-111). Suggested placements, including false 'high' ones, have no pending-confirmation count (project-vault.ts:1097-1130 counts only 'unfiled'). Evidence: docs/evidence/D2-DATA-ROOM-FILE/<date>/.
- **Veeva capability:** Intake inbox → library, and bulk actions that report per-document success or failure.
- **User outcome:** A user selects captured sources in the data room and chooses 'File into Vault'. Each one goes through the same governed ingest as a Vault upload. It lands as suggested or unfiled, never confirmed by a machine. The result lists each source as filed, already in the Vault, or refused with its reason. It says complete:false on a partial failure, and never reads as done. A source whose stored bytes no longer match the checksum recorded at capture is refused (SOURCE_BYTES_CHANGED). In the cabinet, 'Confirm N suggested in <folder>' confirms a set with one written reason, one chained placement row per document, and any refusals listed. The header shows 'N awaiting confirmation' next to Unfiled.
- **Extends:** - The upload-to-vault orchestration now private to AnA's handleFileChatUploadToVault (server/services/ana/document-catalog-tools.ts:543-600: loadUploadedFile, derivedDocumentCode, ingestVaultDocument) is extracted once into a vault service function. The new route and the AnA tool both call it: zero duplication, not a second copy. - resolveSourceUploadIds (evidence-spine.service.ts:274) maps a source to its upload. - placeVaultDocument runs per item, each in its own transaction. - The program-wide count query (project-vault.ts:1117-1130) gains a 'suggested' FILTER.
- **Files:** `server/routes/c2c/project-vault.ts`, `server/services/vault/<agreed name>-file-upload-to-vault.ts`, `server/services/ana/document-catalog-tools.ts`, `client/src/concept2cure/v2/surfaces/Vault.tsx`, `server/routes/__tests__/vault-data-room-file.test.ts`, `tests/db/vault-data-room-file.dbtest.ts`, `tests/db/vault-placement.dbtest.ts`
- **Schema:** none
- **Immutability:** Each item is the existing chained ingest or placement row on its own transaction, with no machine confirm. Refiling the same bytes is a no-op because of VR-05, so bulk filing cannot multiply metadata rewrites or orphaned copies. The source-bytes check stops the data room laundering changed bytes into the Vault.
- **Tests first:**
  - tests/db/vault-data-room-file.dbtest.ts: POST /:id/data-room/file with [new bytes, bytes already in this program's Vault, another org's source id] returns [filed, already_filed, refused NOT_FOUND]. Exactly one vault row is added, suggested or unfiled, never confirmed. Red: no route.
  - A 503 from the antivirus scan on item 2 does not roll back item 1, and the response carries complete:false.
  - Loaded bytes whose hash differs from cre_evidence_sources.checksum give 409 SOURCE_BYTES_CHANGED, with nothing stored. A viewer gets 403 before any byte is read.
  - POST /:id/file-batch confirm without a note returns 422. With a note, it writes one chained vault.document.file row per document carrying the note. A document moved concurrently is refused CONFLICT in the item list, and the others commit.
  - GET /:id returns awaitingConfirmationCount over the whole program, not the window.
  - The AnA file_chat_upload_to_vault suites stay green through the shared function, and a source guard finds one loadUploadedFile → ingestVaultDocument orchestration.
- **Ownership:** document-catalog-tools.ts and the vault services belong to …01DiJJAk: the extraction must be agreed with, or handed to, that lane. project-vault.ts and Vault.tsx belong to this lane.
- **Founder decision:** none (FD11 is a confirmation that the AnA toggle does not govern a person's filing; this slice waits only if the founder rules otherwise)
- **Depends on:** VR-05, VR-10, VR-04

### VR-12 — Lifecycle sign-offs become Part 11 signature records bound to content the server reads  `[L]`

- **Launch row:** D5. Today: - /:id/sign and advance → approved record a 'csig:<uuid>' JSON object with no electronic_signatures row, no printed name and no content binding (server/routes/document-lifecycle.ts:195-206; server/services/regulatory/lifecycleBindings.ts:98-115). - The audit binding uses logAction, which swallows failures (lifecycleBindings.ts:59-80). - contentHash and hasContent come from the request body (document-lifecycle.ts:164-176, :256-262). - canonical_documents records no author, so separation of duties cannot be checked. Evidence: docs/evidence/D5-LIFECYCLE-SIGNING/<date>-part11-records/.
- **Veeva capability:** A Part 11 signature manifestation on each lifecycle transition, bound to the signed version.
- **User outcome:** A review or approval is a real electronic signature: printed name, declared meaning and time, bound to the SHA-256 of the exact content the server read. Signature, chained audit row and stage change commit together or not at all. Nobody can sign off a document they authored or uploaded. A review signed before a revision cannot satisfy the approval gate for the revised content.
- **Extends:** - reverifySigner is already wired at document-lifecycle.ts:123. - persistGovernedActionSignature (server/services/part11/signature-persistence.ts:667-743) runs on the same client as persistState, and writeChainedAuditRow replaces logAction. - The transaction follows the QMS signed-approval template (server/services/qms/document-approval-signature.ts:168-338), and assertSignerIsNotAuthor comes from server/services/governance/separation-of-duties.ts. - A new BINDING_BASIS value, VAULT_DOCUMENT_VERSION, takes its digest from vault.documents.content_hash read FOR SHARE, following the FILED_ESTAR_ARTIFACT precedent (signature-persistence.ts:124-130). A source with no derivable digest binds GOVERNED_ACTION_LEDGER, honestly labelled as not a content hash. - REVIEW_SIGNOFF_REQUIRED additionally requires the review's bound digest to equal the current content_hash. - Supersession never revokes a signature. It needs no change to the esign trigger, whose revocation defect is P0-7's.
- **Files:** `server/routes/document-lifecycle.ts`, `server/services/regulatory/lifecycleBindings.ts`, `server/services/regulatory/canonicalDocumentStore.ts`, `server/services/regulatory/documentLifecycleOrchestrator.ts`, `shared/regulatory/document-lifecycle.ts`, `server/services/part11/signature-persistence.ts`, `migrations/20260731c_canonical_documents.sql`, `tests/regulatory/document-lifecycle-pipeline.pglite.test.ts`, `server/routes/__tests__/document-lifecycle-part11-record.test.ts`
- **Schema:** canonical_documents.created_by INTEGER, added by ADD COLUMN IF NOT EXISTS, amended in place into migrations/20260731c_canonical_documents.sql with a dated header note saying what was added, why and by which change (Rule 1: in-place amendment, drift self-documented). For a vault-sourced document the author is vault.documents.created_by. The table is already public with organization_id INTEGER NOT NULL. BINDING_BASIS is code only. No table and no DROP.
- **Immutability:** Every lifecycle signature is an append-only electronic_signatures row bound to a server-derived digest. Every lifecycle event is a per-tenant chain row in the same transaction as the state change. VR-03's trigger makes the canonical row's copy write-once.
- **Tests first:**
  - document-lifecycle-part11-record.test.ts (pglite): POST /:id/sign writes exactly one electronic_signatures row (printed name, meaning, bound_payload_digest = the vault row's content_hash, binding_basis VAULT_DOCUMENT_VERSION) and one chained audit_logs row. Red: only csig JSON.
  - A body contentHash of 'forged' is ignored, and the stored hash is the server's. Red: stored as sent.
  - An injected failure of the audit or signature INSERT rolls back the stage change. Red: the stage persists because logAction swallows the failure.
  - The creator or uploader approving gets 403 SELF_APPROVAL. Red: allowed.
  - After in_review → authoring → content change → in_review, the round-1 review does not satisfy REVIEW_SIGNOFF_REQUIRED.
  - Control: the electronic_signatures row refuses UPDATE (db/migrations/20260730_esign_audit_db_level_immutability.sql:33-66).
- **Ownership:** The route belongs to this lane. server/services/part11/* has no active claim; only one BINDING_BASIS constant is added. The orchestrator, bindings and store are unclaimed. The security plan's P0-10 (every signer through reverifySigner) is compatible and needs no coordination beyond a board note.
- **Founder decision:** none (refusing self-approval follows the QMS precedent)
- **Depends on:** VR-03

### VR-13 — Send a vault version for review, approve it with an e-signature, and supersede the previous version  `[L]`

- **Launch row:** D5, the precondition for D10's 'a governed document filed into a sequence'. A vault row's only status is its filing status, and the Vault counts a 'confirmed' filing as settled, the same as 'approved' (client/src/concept2cure/v2/surfaces/Vault.tsx:208-210). The lifecycle route has zero client callers. Evidence: docs/evidence/D5-VAULT-APPROVAL/<date>/, with OQ-002-VAULT steps added.
- **Veeva capability:** QualityDocs/RIM review and approval with e-signature. Approving the next version automatically supersedes the prior steady-state version.
- **User outcome:** From a version's detail, 'Send for review' moves it to In review. A reviewer signs 'reviewed'. An approver who is neither the uploader nor the reviewer re-authenticates in EsignModal and approves exactly those bytes. The tree and detail show Not reviewed, In review, Approved or Superseded, separately from filing status. Approving v2 moves v1 to Superseded in the same transaction, so v1 stays approved and usable while v2 is drafted. That is the opposite of QMS's revise-in-place defect. The approved version shows its signature manifestation after reload. Editing details of an approved version is refused (FD6 default).
- **Extends:** The canonical spine, with no stage column on vault.documents and no seventh state vocabulary: - canAdvanceDocument / LEGAL_TRANSITIONS (shared/regulatory/document-lifecycle.ts:161-210) over canonical_documents, one row per vault version, entered as sources.vault_documents, which is already declared (shared/regulatory/canonical-document.ts:51-65). - POST /api/regulatory/documents derives title, type, hasContent and content_hash from the org-checked vault row. - VR-12's signing. - EsignModal (client/src/concept2cure/_shared/components/EsignModal.tsx). - The audit target is 'vault_document:<uuid>', matching the ingest, filing and download rows, so VR-01's history shows it. It stays distinct from AnA's 'vault-document:', which means concept2cure_artifacts (server/services/ana/AnaToolExecutor.ts:19668). - VR-05's edit writer reads the canonical stage and refuses at approved or later.
- **Files:** `server/routes/document-lifecycle.ts`, `server/services/regulatory/documentLifecycleOrchestrator.ts`, `server/services/regulatory/canonicalDocumentStore.ts`, `server/services/vault/vault-placement.service.ts`, `server/routes/c2c/project-vault.ts`, `client/src/concept2cure/v2/surfaces/Vault.tsx`, `migrations/<date>_canonical_documents_vault_version.sql`, `scripts/db/migration-set.mjs`, `tests/db/vault-lifecycle.dbtest.ts`, `client/src/concept2cure/v2/__tests__/vaultLifecycle.test.tsx`, `docs/validation/OQ-002-VAULT.md`
- **Schema:** One new C2C_MIGRATION_FILES entry after VR-03's file and before the final pair: CREATE UNIQUE INDEX IF NOT EXISTS canonical_documents_vault_version_uq ON canonical_documents (organization_id, (source_refs->'vault_documents'->>'nativeId')) WHERE source_refs ? 'vault_documents'. It is preceded by a duplicate count that RAISEs NOTICE and skips rather than failing the deploy; none is expected, since the route has had 0 client callers. The route also refuses a second start by lookup, so enforcement does not depend on the index. Public table, INTEGER org key, additive, no DROP.
- **Immutability:** An approved version's bytes and hash are frozen (VR-06), its canonical content hash and signatures are frozen (VR-03), and its approval is an append-only electronic_signatures row (VR-12). Supersession is a forward, recorded transition; the spine forbids approved → authoring.
- **Tests first:**
  - tests/db/vault-lifecycle.dbtest.ts (PostgreSQL 16, app_service, RLS on): starting the lifecycle for a vault version creates one canonical row at 'authoring' whose content_hash equals the vault row's, even when the body sends another. A second start returns the same canonical id. Another tenant's vault id returns 404. Red: POST / trusts the body.
  - The uploader approving gets SELF_APPROVAL with no signature row; a viewer gets 403; in_review → approved without a review sign-off gets 409 REVIEW_SIGNOFF_REQUIRED.
  - Approving v2 moves v1's canonical row to superseded in the same transaction, with two chained audit rows. An injected failure leaves both unchanged. Red: v1 stays approved.
  - The approval's bound_payload_digest equals v2's content_hash, read FOR SHARE.
  - A 'confirmed' but unapproved upload does not count as settled. Red: Vault.tsx:208-210.
  - vaultLifecycle.test.tsx: 'Approve' opens EsignModal and sends bearer-authenticated credentials, and the approved version shows printed name, meaning and time after reload.
  - Editing details of an approved version returns 409 APPROVED_VERSION_IMMUTABLE.
- **Ownership:** document-lifecycle.ts, project-vault.ts and Vault.tsx belong to this lane; the orchestrator and store are unclaimed. The edit-refusal hunk is in vault-placement.service.ts (…01DiJJAk): coordinate. No QMS file is touched (…01Wcyqbq owns mdx-qms.ts).
- **Founder decision:** FD4 (approval policy). The slice ships the strict default: every vault document must be approved before it counts as settled or transmittable, review sign-off is required, and the uploader may neither review nor approve. It is relaxed only by the founder. FD6 (correcting an approved version in place) ships as a refusal.
- **Depends on:** VR-08, VR-09, VR-12, VR-06

### VR-14 — Only an approved, current vault version can be transmitted, and each version shows where it is placed  `[M]`

- **Launch row:** D7 and D10. FINALIZED_STATUSES_BY_STORE has no vault_documents entry (server/services/ectd/leaf-source-resolver.ts:183-188), and the vault branch (:551) never calls noteUnfinalized (:408). So an unreviewed upload, or an authoring export stamped WORKING DRAFT (server/services/authoring/authoring-file-to-vault.ts:345-366), passes transmit's 'only finalized documents' rule (server/services/submission-service/submission-service.ts:1377-1384). Evidence: docs/evidence/W5/<date>-vault-leaf-finalized/.
- **Veeva capability:** RIM Submissions: only steady-state versions are published; where-used shows each version's placements.
- **User outcome:** When a user places a vault document into a submission, the dialog shows its lifecycle stage, pre-fills the CTD section from its filing (today it starts blank: client/src/concept2cure/v2/surfaces/VaultPlaceIntoSubmission.tsx:185), and warns that a draft will not be transmitted. Assembly or transmit refuses a leaf whose version is not approved, or is superseded, or whose approval digest differs from the leaf's pinned hash, and names the leaf. On the document, 'Placed in' lists each sequence and section per version, so a reviser knows the next sequence needs a replace.
- **Extends:** The one finalization rule. vault_documents joins FINALIZED_STATUSES_BY_STORE and reads VR-13's canonical stage (approved, placed, packaged or submitted are finalized; a missing row means authoring). It also requires the approval's bound digest to equal the leaf's pinned content_hash (submission-service.ts:1684-1708). The vault branch calls noteUnfinalized; no second gate is added. 'Placed in' is an org-scoped read of submission_leaves.document_uuid (migrations/20260917b_submission_leaf_document_uuid.sql) added to VR-09's versions read.
- **Files:** `server/services/ectd/leaf-source-resolver.ts`, `server/services/ectd/__tests__/leaf-source-resolver-vault-finalized.test.ts`, `server/services/submission-service/__tests__/transmit-vault-leaf-unfinalized.test.ts`, `client/src/concept2cure/v2/surfaces/VaultPlaceIntoSubmission.tsx`, `client/src/concept2cure/v2/__tests__/vaultPlaceIntoSubmissionDialog.test.tsx`, `server/routes/c2c/project-vault.ts`, `client/src/concept2cure/v2/surfaces/Vault.tsx`
- **Schema:** none
- **Immutability:** What leaves for a regulator is pinned twice: to an append-only approval, and to the exact bytes whose hash the leaf pinned. VR-06 and VR-03 refuse any upstream change to either.
- **Tests first:**
  - leaf-source-resolver-vault-finalized.test.ts: a vault leaf with no canonical row, or at authoring or in_review, counts as unfinalized. Red: 0.
  - An approved current version is finalized. A superseded one is unfinalized for a new assembly. An approval whose digest differs from the pinned hash is unfinalized.
  - Transmit with an unfinalized vault leaf is refused DISPATCH_BLOCKED, naming the leaf's section. Red: dispatches.
  - The dialog pre-fills ctd_section, and a draft shows the non-transmittable warning. Red at :185.
  - vault-versions.test.ts: each version lists its submission_leaves placements for this org only.
- **Ownership:** leaf-source-resolver.ts belongs to the D7 lanes: …01LjrcEe (package spine, claimed) and …01TtwRHm (IND eCTD, claimed). It was touched today by 7fd5d6af. Hand them the resolver hunk with its red test, or take it by recorded consent. Their fixtures that place vault leaves will need an approved version. The dialog, project-vault.ts and Vault.tsx belong to this lane.
- **Founder decision:** FD5: grandfathering of vault leaves in open, untransmitted sequences, and whether a sealed Authoring export carries its approval to the vault copy. The slice refuses both until decided.
- **Depends on:** VR-13

### VR-15 — A numbered data-room index, and required-section coverage from the one resolver  `[M]`

- **Launch row:** D2 (the Vault and Submission Readiness launch apps). A leaf's number today is ctd_section or '—' (server/routes/c2c/project-vault.ts:456). Nothing shows, from the program's own rule pack, what the vault holds against what is required. Evidence: docs/evidence/D2/<date>-vault-index-coverage/.
- **Veeva capability:** RIM content plan / expected-document list; data-room hierarchical index numbering and a printable index.
- **User outcome:** Every cabinet leaf carries a stable index number: the normalized section code in a CTD view, and folder ordinal plus position otherwise. The Vault shows 'Required sections: n of m have an approved (or, before VR-13, confirmed) document' as a per-module checklist from the program's live rule pack. It names the pack version, or says the ICH baseline applies and why. Suggested and unfiled documents never count. Each missing section offers Upload and Move. Only counts are shown: no percentage, no model, and no feed into any readiness ring.
- **Extends:** resolveRequiredSections (server/services/ectd/required-sections.ts:186), the one resolver every gate uses, with its provenance and fallback contract. normalizeCtdCode, compareSectionCode and sortBySectionCode (shared/regulatory/section-code.ts:115-150). A pure coverage helper beside the read model, and leaf numbering in uploadLeaf/filingCabinet.
- **Files:** `server/routes/c2c/project-vault.ts`, `server/services/vault/vault-coverage.ts`, `client/src/concept2cure/v2/surfaces/Vault.tsx`, `server/services/vault/__tests__/vault-coverage.test.ts`, `server/routes/__tests__/vault-tree-bounded.test.ts`
- **Schema:** none
- **Immutability:** n/a while the room is live; VR-19 freezes the index numbers when it seals the room.
- **Tests first:**
  - Pure: required [2.5, 3.2.P.8, 5.3.5.3] against [{'3.2.p.8', confirmed}, {'2.5', suggested}] gives covered [3.2.P.8] and missing [2.5, 5.3.5.3].
  - A program with no program_type reports provenance 'fallback' with its reason, never labelled as the program's own list.
  - Rule-pack read failure returns unavailable with a reason, never '0 of m'.
  - Index numbers are stable across reads and ordered by compareSectionCode.
  - A device or service view whose pack is not CTD-numbered shows the resolver's message and no figure.
  - A source guard confirms the coverage block feeds no readiness figure.
- **Ownership:** required-sections.ts is read, not edited; it is in the D7 spine. project-vault.ts and Vault.tsx belong to this lane. Label the block 'Vault coverage', not readiness.
- **Founder decision:** none
- **Depends on:** VR-04

### VR-16 — The data room's capture record is append-only, and 'filed' names the vault version  `[M]`

- **Launch row:** D2, with D5. cre_evidence_sources.checksum is 'written once' only by convention (migrations/20260829_cre_source_versioning.sql:4-9), and is_current and previous_version_id can be rewritten by any UPDATE. 'Filed' is a bare checksum join that does not say which version the bytes became (the dataRoom block of server/routes/c2c/project-vault.ts, ~:1152-1240). Evidence: docs/evidence/D2/<date>-data-room-capture-immutable/.
- **Veeva capability:** An immutable intake index with version indication, and a 'where filed' view.
- **User outcome:** For each captured source the data room says whether its bytes are filed and as which version, for example 'Filed as v1.0, superseded by v2.0'. A source's checksum and revision link can never be rewritten, so 'filed' and 'changed since cited' cannot be falsified after the fact.
- **Extends:** listClientDocuments (server/services/clinical-regulatory-evidence/evidence-spine.service.ts:218), createSupersedingSource (:77-104), the project-vault data-room block, and VR-08's version family. There is no third store: the room still references vault.documents by hash.
- **Files:** `migrations/<date>_cre_evidence_sources_capture_immutability.sql`, `scripts/db/migration-set.mjs`, `server/routes/c2c/project-vault.ts`, `client/src/concept2cure/v2/surfaces/Vault.tsx`, `tests/db/cre-capture-immutability.dbtest.ts`, `server/routes/__tests__/vault-data-room-counts.test.ts`
- **Schema:** One new C2C_MIGRATION_FILES entry after migrations/20260829_cre_source_versioning.sql (scripts/db/migration-set.mjs:1443) and before the final pair. It adds a conditional trigger on public.cre_evidence_sources (organization_id already an integer) using CREATE OR REPLACE FUNCTION plus CREATE TRIGGER only if absent, with no DROP. Rules: - checksum and previous_version_id may only go NULL → value; - organization_id, source_type and created_at are frozen; - is_current may only go TRUE → FALSE; - TRUNCATE is refused; - DELETE is refused unless current_user owns the table. No purge deletes this table today. If one is added, it extends VR-07's owner-run function, amended in place. No replaying migration UPDATEs this table, as grep over migrations/ and db/migrations/ confirmed. Before the trigger lands, enumerate every writer (the known SQL writer is evidence-spine.service.ts:85) and run each writer's suite. No table.
- **Immutability:** Capture identity (checksum), revision lineage and retirement become write-once in the database.
- **Tests first:**
  - tests/db/cre-capture-immutability.dbtest.ts (non-owner role): a raw UPDATE of checksum succeeds at HEAD (red); refused after.
  - is_current FALSE → TRUE succeeds at HEAD (red); refused after. DELETE and TRUNCATE are refused.
  - Control: createSupersedingSource still retires the predecessor. Every enumerated writer's suite stays green.
  - vault-data-room-counts.test.ts: a source whose bytes equal a superseded vault version reports 'Filed as v1.0 (superseded by v2.0)'. Red: plain 'filed'.
  - Control: ad0c34e2's window, currentOnly and needs_review assertions are unchanged.
- **Ownership:** evidence-spine.service.ts is unclaimed. project-vault.ts and Vault.tsx belong to this lane. The retrieval blocks of chat/upload.ts (…01DiJJAk) are only read.
- **Founder decision:** none
- **Depends on:** VR-07, VR-08, VR-10

### VR-17 — Place and lift a legal hold from the Vault; hold records are append-only  `[M]`

- **Launch row:** D6 (the per-tenant data-retention statement), with D5. vault.legal_holds exists, and the purge (server/services/tenant/tenant-offboarding.ts:440-455) and retention (server/jobs/retentionCron.ts:112-114) honour it. But no route or UI can place or lift a hold, and a hold row can be edited or deleted. Evidence: docs/evidence/D6/<date>-vault-legal-hold/.
- **Veeva capability:** Legal Hold on documents and programs, preventing disposition.
- **User outcome:** An authorized user places a hold, with a reference and a reason, on a document or a whole program, and sees an 'On legal hold' badge and the hold's history. Lifting it needs an attributed reason (and an e-signature if FD7 says so). While a hold is active, retention cannot even tombstone the document, and the purge and its owner-run function refuse the organization.
- **Extends:** vault.legal_holds (shared/schema/vault.ts:298-326; migrations/20260906b_vault_legal_holds.sql), which already has an integer organization_id, the tenant_isolation_policy and the scope and lift CHECKs. The governed-write shape of placeVaultDocument (transaction, FOR UPDATE, chained audit). VR-07's function already re-checks active holds.
- **Files:** `server/routes/c2c/project-vault.ts`, `client/src/concept2cure/v2/surfaces/Vault.tsx`, `migrations/<date>_vault_legal_holds_append_only.sql`, `scripts/db/migration-set.mjs`, `tests/db/vault-legal-hold.dbtest.ts`
- **Schema:** One new C2C_MIGRATION_FILES entry after migrations/20260906b_vault_legal_holds.sql (scripts/db/migration-set.mjs:2167) and before the final pair. It adds a conditional trigger on the existing vault.legal_holds that refuses DELETE, TRUNCATE and any UPDATE other than the write-once lift (lifted_at, lifted_by, lift_reason going NULL → value). No new table, no DROP.
- **Immutability:** Hold records become append-only with a write-once lift, enforced by trigger. A held document cannot be destroyed, because VR-07's function refuses.
- **Tests first:**
  - Placing a hold writes the row and a chained vault.legal_hold.place row in one transaction. Red: no route.
  - A viewer, or a role outside FD7's answer, is refused.
  - UPDATE of an active hold's reason succeeds at HEAD (red); refused after. DELETE of a hold row succeeds at HEAD (red); refused after.
  - Control: a lift without a reason is refused by the existing CHECK. Control: retention skips a held document. Control: the purge is refused with an active hold.
- **Ownership:** project-vault.ts and Vault.tsx belong to this lane. retentionCron.ts and tenant-offboarding.ts are not edited (the D6 lane is released; WO-16C owns retentionCron's audit write).
- **Founder decision:** FD7: who may place and lift a hold, and whether lifting requires an e-signature.
- **Depends on:** VR-07

### VR-18 — Filter the Vault by type, section, filing status and lifecycle stage, with counts  `[M]`

- **Launch row:** D2. The search route claims to search 'CONTENT and metadata' but matches only title, file name and body (migrations/20260906_vault_documents_fulltext.sql:55-71), and takes only q, limit and offset. The only metadata filters live on the public API (server/services/vault/vault-document-index.service.ts:189-211). Evidence: docs/evidence/D2-VAULT-SEARCH/<date>/.
- **Veeva capability:** Faceted library search with counts.
- **User outcome:** A user filters the Vault by document type, evidence kind, CTD section prefix, filing status and lifecycle stage ('Approved Module 3 documents'), with or without a text query. Each facet value shows a count, and the header shows the real total ('12 of 340').
- **Extends:** The in-app GET /:id/search (project-vault.ts:1349), keeping its shared predicate for page and count, its tenant EXISTS and its 'an error is not an empty result' contract. The metadata predicate in listVaultDocuments (vault-document-index.service.ts:189-211) is extracted once into an exported filter builder that the public API and in-app search both call. Stage comes from VR-13's canonical join. The search vector is not changed.
- **Files:** `server/routes/c2c/project-vault.ts`, `server/services/vault/vault-document-index.service.ts`, `client/src/concept2cure/v2/surfaces/Vault.tsx`, `server/routes/__tests__/vault-search.test.ts`, `server/services/vault/__tests__/vault-document-index.pglite.integration.test.ts`, `client/src/concept2cure/v2/__tests__/vaultSearchFacets.test.tsx`
- **Schema:** none
- **Immutability:** n/a (read path)
- **Tests first:**
  - vault-search.test.ts: each filter narrows both results and total. An empty q with a filter browses instead of returning EMPTY_QUERY. Red: filters ignored.
  - Facet counts equal COUNT(*) over the identical predicate.
  - The public API's responses are unchanged after the builder is shared (regression).
  - A source guard: exactly one definition of the metadata predicate.
  - Client: chips send the parameters and show counts, and a failed facet read renders an error, not 0.
- **Ownership:** This lane owns all files (vault-document-index.service.ts was last changed by this lane in e4ecfb26).
- **Founder decision:** FD8: confirm facets are scheduled before D1-D10 are green (Rule 2). The current-version default already ships in VR-09 whatever is decided.
- **Depends on:** VR-09, VR-13

### VR-19 — Seal the data room: a hash-verified snapshot nobody can alter  `[M]`

- **Launch row:** No D row names this. It is nearest to D5 (tamper-evident records), plus a new URS-VAULT requirement for D4. Under Rule 2 it needs the founder's scheduling decision (FD8). Evidence: docs/evidence/D5/<date>-data-room-seal/.
- **Veeva capability:** Binder or submission-archive snapshot with pinned versions; a data room's closing snapshot.
- **User outcome:** A user with the role named in FD9 seals a program's data room with a reason, and an e-signature if FD9 says so. The server records every document's id, version, content hash, folder, section, index number, filing status and lifecycle stage as they stand, hashes that manifest, and writes the seal to an append-only table and to the audit chain. Later, anyone in the tenant can Verify seal. The server recomputes the manifest hash, checks each document still exists with the same hash, and optionally re-hashes stored bytes. The answer is intact, changed (naming documents), or could not verify, and never intact when anything was unreadable.
- **Extends:** The Vault read model's tenant predicate for enumeration; stableStringify (shared/canonical-json.ts:38) for the manifest; readVerifiedVaultBytes (project-vault.ts:741) for byte checks; writeChainedAuditRow on the seal's own transaction; VR-15's index numbering. If FD9 makes sealing a signed act: reverifySigner plus persistGovernedActionSignature, bound to manifest_sha256. Nothing is reused from ivdr_binder_packs (a BIGINT-org claim binder outside the catalog) or from eCTD sequences.
- **Files:** `migrations/<date>_vault_data_room_seals.sql`, `scripts/db/migration-set.mjs`, `server/services/vault/vault-seal.service.ts`, `server/routes/c2c/project-vault.ts`, `client/src/concept2cure/v2/surfaces/Vault.tsx`, `migrations/<date>_vault_documents_record_immutability.sql (VR-07's purge function amended in place, dated)`, `server/services/tenant/tenant-offboarding.ts`, `server/services/tenant-export/tenant-full-export.service.ts`, `tests/db/two-tenant-fixture.ts`, `tests/db/vault-seal.dbtest.ts`
- **Schema:** CREATE TABLE IF NOT EXISTS public.vault_data_room_seals, with columns: - id uuid primary key - organization_id INTEGER NOT NULL - program_id uuid NOT NULL - reason text NOT NULL, CHECK non-blank - manifest jsonb NOT NULL - manifest_sha256 text NOT NULL, CHECK ^[0-9a-f]{64}$ - document_count integer NOT NULL - sealed_by integer NOT NULL - signature_id (nullable; set when FD9 = signed) - sealed_at timestamptz NOT NULL DEFAULT now() Plus an index on (organization_id, program_id, sealed_at DESC), and a conditional append-only trigger: UPDATE and TRUNCATE refused; DELETE refused unless current_user owns the table. The new C2C_MIGRATION_FILES entry goes before UUID_TENANT_ISOLATION_NONPUBLIC, so the sweep adds tenant_isolation_policy with FORCE (Rule 1: public schema, integer org key). VR-07's owner-run purge function is amended in place to also delete the org's seals. No DROP.
- **Immutability:** Seal rows (manifest, hash, who, when, why) are append-only in PostgreSQL, and their hash is also in a sequenced audit_logs row, so a forged row cannot match the chain. The documents they name are frozen by VR-06 and VR-07.
- **Tests first:**
  - As app_service: UPDATE, DELETE and TRUNCATE of a seal are refused.
  - Sealing a three-document room gives a manifest listing all three. manifest_sha256 = sha256(stableStringify(manifest)), and the chained vault.data_room.seal row carries the same hash.
  - Verify with nothing changed returns intact. With a stored object removed it returns could_not_verify, never intact. In a scratch schema without VR-06's trigger, a changed content_hash returns changed [doc].
  - Two-tenant contract with RLS enforcing: A cannot list, verify or forge B's seals. This is a new compile-checked Domain entry in tests/db/two-tenant-fixture.ts.
  - A seal without a reason returns 422, a viewer gets 403, and a foreign program gets 404. The purge removes seals through the function, and a hold refuses it.
- **Ownership:** tenant-offboarding.ts and tenant-full-export.service.ts are the released D6 lane's files: re-read HEAD. tests/db/two-tenant-fixture.ts is shared by the D3 lanes. The rest belongs to this lane.
- **Founder decision:** FD8 (Rule 2 scheduling) and FD9 (signed or audited act; which role).
- **Depends on:** VR-15, VR-01, VR-07, VR-13

### VR-20 — Closing archive: a sealed room's bytes, index and audit trail in one verifiable file  `[L]`

- **Launch row:** D6-adjacent: the tenant data return carries no document bytes (open item on the D6 purge row of docs/work-orders/README.md: 'the data return's bytes (founder)'). It is also inspection readiness. It needs FD8 and FD10. Evidence: docs/evidence/D6/<date>-closing-archive/.
- **Veeva capability:** Data room closing archive; Submissions Archive export.
- **User outcome:** For a seal, a user downloads a ZIP containing: - every sealed document's original bytes at an index-numbered path; - the manifest; - a printable index; - SHA256SUMS; - the chained audit rows for those documents, with the chain verdict at export time. The archive is built and fully verified before any byte is sent. If a document is unreadable or differs from the seal, the request is refused with the list, and nothing partial ever ships.
- **Extends:** readVerifiedVaultBytes (project-vault.ts:741) for every entry; VR-01's transactional audit-before-send; the archiver streaming already used by server/services/universal-packager.ts (archiver in package.json:482); VR-01's history reader for the audit extract; and signedAuditExport's manifest shape (server/services/audit/signedAuditExport.ts:56-80). Time-of-check/time-of-use fix: entries are streamed through the verified reader into a staged temporary file with bounded heap, each compared with the seal manifest. Only when every entry verifies and the staged file's own SHA-256 is computed is the chained vault.data_room.archive row written, carrying that hash. Then the staged file is streamed and deleted. The served bytes are exactly the verified ones. If FD10 makes this the data return's byte carrier, tenant-full-export calls this builder; no second builder is written.
- **Files:** `server/services/vault/vault-seal.service.ts`, `server/routes/c2c/project-vault.ts`, `client/src/concept2cure/v2/surfaces/Vault.tsx`, `tests/db/vault-seal-archive.dbtest.ts`
- **Schema:** none
- **Immutability:** A byte-exact, hash-listed copy of an immutable seal. The export is a sequenced chain row whose hash equals the delivered file's.
- **Tests first:**
  - A three-document seal archive unzips, SHA256SUMS verifies every file, and the archive's manifest hash equals the seal's.
  - One stored object missing: 409 ARCHIVE_INCOMPLETE naming it, with zero bytes streamed.
  - The audit write fails: 500, nothing sent, staged file removed. On success, exactly one sequenced vault.data_room.archive row carries the served file's SHA-256, and the test re-hashes the received body against it.
  - A document whose hash differs from the seal is refused.
  - A 200 MB room builds with bounded heap. A foreign seal id returns 404.
- **Ownership:** readVerifiedVaultBytes is called, not edited. Making this the tenant data return's carrier would edit tenant-full-export.service.ts (released D6 lane) and waits on FD10.
- **Founder decision:** FD8 (Rule 2 scheduling) and FD10 (delivery mode; whether it is the D6 data return's byte carrier).
- **Depends on:** VR-19

## 4. Corrections from the completeness critic

The critic read the synthesized plan against the tree and judged the first slice **not ready as written**.
These corrections apply to the slices above. Where they conflict, the correction wins.

1. **VR-01 extracts the wrong audit reader. The plan says mdx-audit.ts:70-120 is the reader to reuse and that doing so leaves 'no second audit SQL'. A second one already exists, and it is the canonical one. server/routes/audit-trail-ledger.routes.ts:9-23 calls itself 'The one ledger (VSR-001 F-2)'. Its AUDIT_LOGS_SQL (:261-278) already selects chain_seq, the predecessor hash (LAG in chain order), the users join, and runs in a tenant-stamped transaction. The Admin audit trail (AdminSurfaces.tsx:1007) and OQ-002 (tests/validation/oq/vault/run.mjs:23) both read it. mdx-audit.ts has none of this: it orders by created_at (:103), does not select chain_seq, and says at :119-127 that audit_logs is 'a SINGLE GLOBAL chain across every tenant'. That has been false since 26c65e2e (server/services/audit/chain.ts:11-24).**
   *Fix:* Extract the per-record history reader from readAuditLedger / AUDIT_LOGS_SQL in audit-trail-ledger.routes.ts, not from mdx-audit.ts. Do not filter by record_id inside the LAG CTE: that makes prev_hash the document's previous row, not the chain predecessor. Filter first, then get each row's predecessor with a LATERAL lookup on (tenant_id, chain_seq) through audit_logs_tenant_chain_seq_idx (migrations/20260921_audit_logs_chain_seq.sql:81). Leave mdx-audit.ts alone, or point it at the shared reader and correct its stale comment.
2. **One VR-01 test cannot pass reliably. It asserts that two downloads and one ingest get 'consecutive chain_seq values'. chain_seq comes from one global sequence (migrations/20260921_audit_logs_chain_seq.sql:72, :112 nextval). Other tenants, parallel suites and rolled-back inserts all consume values, so gaps are normal and the test would be flaky or wrong.**
   *Fix:* Assert instead: each row's chain_seq is non-null and distinct; each row's sha256_chain derives from the tenant's previous sequenced row; and GET /api/c2c/actions/verify-chain reports ok.
3. **One VR-01 control is described as staying green, but it will go red for a harness reason. vault-download.test.ts:35 mocks the pool as { query, connect: vi.fn() }, and connect returns undefined. Once recordVaultDownload moves to pool.connect() + BEGIN/COMMIT, the 'audit INSERT fails → 500 AUDIT_WRITE_FAILED, no body' test fails before it reaches the behaviour it checks.**
   *Fix:* In the same commit, give the mock a client with query and release, route the audit INSERT failure through that client, and say in the commit that the assertions did not change.
4. **The DELETE and TRUNCATE guards in VR-03, VR-06, VR-07, VR-16, VR-17 and VR-19 mostly depend on 'current_user owns the table', and they do nothing on a single-role estate. deploy-migrate supports single-role estates explicitly (scripts/db/deploy-migrate.mjs:50-51, :383-384). The boot refusal the plan relies on (server/db/rlsEnforcement.ts:230-243) only fires when the runtime owns an RLS table that is NOT FORCEd. The public tables canonical_documents, cre_evidence_sources and vault_data_room_seals are FORCEd by the sweep, so that check never fires for them. vault.documents drops out too as soon as the D3 lane applies FORCE, which the plan's own exclusions assign to D3. A table owner can also DISABLE TRIGGER.**
   *Fix:* Add a boot and deploy refusal whenever the runtime role owns any table that carries one of these guards, whether or not FORCE is set. Make P0-9's startup self-check require pg_trigger.tgenabled <> 'D', not just that the trigger exists. Add a CI gate against DISABLE TRIGGER and session_replication_role in migrations. Say in the evidence that on a single-role estate the guards are void.
5. **VR-07's database preconditions can be set by the same role that calls the function, so its outcome ('no … runtime-role session can remove a recorded version') is overstated. organizations.status has no guard: the lifecycle is enforced only in code (tenant-offboarding.ts:23-25), and no trigger sits on organizations. Under VR-17 a runtime session can still lift a hold (lifted_at goes NULL → value). EXECUTE is granted to the runtime role. The retention window and the final-export digest that assertPurgePermitted checks are not re-checked inside the function. Also, the planned in-migration GRANT runs at deploy step 4, and on a first mint app_service does not exist until step 5 (deploy-migrate.mjs:44-51), so that GRANT would stop the deploy.**
   *Fix:* Either state the limit honestly (the guard stops accidental and direct DELETEs, not a compromised runtime role), or require a precondition the runtime role cannot write, such as an append-only offboarding record carrying the elapsed window and final_export_digest. Drop the in-migration GRANT: provision-app-role.mjs:335 already grants EXECUTE ON ALL FUNCTIONS at step 5. Revoking from PUBLIC is enough.
6. **VR-06 would permanently block the storage relocation the D1 lane still owes. The board records that no local→S3 migration path exists yet (docs/work-orders/README.md, W2/D1 section), and rows now record their provider (7fd5d6af). storage-migration.service.ts:211-224 only adopts rows whose storage_version_id IS NULL. VR-06 refuses storage_version_id value → value, which is exactly the change moving a 'local' row to S3 needs.**
   *Fix:* Before freezing, add a named relocation exception to the VR-06 trigger: storage_version_id, storage_provider, s3_key and s3_bucket may change only when content_hash is unchanged, in a transaction that re-hashes the bytes at the new store and writes a chained vault.document.relocate row. Or record the D1 lane's agreement that relocation will never be needed.
7. **VR-19 would turn a CI gate red. scripts/ci/check-purge-coverage.mjs ratchets the number of public org-keyed tables that are not in PURGE_CHILD_TABLES and fails if it grows (header :1-30; .github/workflows/ci.yml:1480). vault_data_room_seals is a new public org-keyed table deleted only through VR-07's function, so the residue grows. Putting it in PURGE_CHILD_TABLES instead would run a generic DELETE that the table's own trigger refuses.**
   *Fix:* Have the gate read the owner-run function's table list, or add a baseline entry with a written reason. Name ci:purge-coverage in VR-19's tests. Separately, amending VR-06's file so its function deletes seals means that function body references a table created in a later file. The function must be plpgsql, which does not resolve tables at creation; a LANGUAGE sql body would fail on a fresh install.
8. **VR-12 adds canonical_documents.created_by so separation of duties can be checked, but VR-03's trigger does not freeze that column. A raw UPDATE could change the recorded author and then pass the self-approval check.**
   *Fix:* VR-12 amends VR-03's trigger file in place, with a dated header, to make created_by write-once (NULL → value only), and adds a red test that tries to reassign the author.
9. **VR-04's label fix names a map that does not exist and expects a label that differs from the canonical one. There is no KIND_LABEL in Vault.tsx. The tree shows folder labels (:230), and :333 and :1401 show the raw token. The canonical labels are VAULT_DOC_KINDS in shared/constants/domain/vault-taxonomy.ts:152-155, where 'csr' is 'Clinical study reports' (plural), and :89 of that file forbids keeping a second label list. The planned test expects 'Clinical study report', so it either forces a duplicate map or fails.**
   *Fix:* Render labels from VAULT_DOC_KINDS and assert the canonical string. Correct the plan's claim that 'the tree labels it'.
10. **VR-04 checks vocabularies only at two routes, but the plan's exclusions say they are 'enforced in the one writer'. Other callers reach the writer directly: AnA's place_project_document passes model-supplied ctd_section and evidence_kind straight into placeVaultDocument (server/services/ana/document-placement-tools.ts:103-104, :222-231), and authoring calls it too (authoring-file-to-vault.ts:306). placeVaultDocument itself checks no vocabulary (vault-placement.service.ts:330-333). The model-supplied path, the likeliest source of junk values, stays open.**
   *Fix:* Put the VAULT_DOC_KINDS and validateSectionCode checks inside placeVaultDocument and ingestVaultDocument. Those are the …01DiJJAk lane's files, so land it by recorded agreement. Add a red test through the AnA tool.
11. **Two slices assume there is one client ingest path, but a second one remains. Etmf.tsx:325 posts to /api/vault/ingest itself. VR-05 changes what a same-hash retry returns, and VR-09 adds check-in, but both change only useVaultUpload.ts. The assessment already records this duplication as open (VAULT_DATA_ROOM_ASSESSMENT_2026-09-05.md:586).**
   *Fix:* Move Etmf.tsx onto useVaultUpload inside VR-05 and delete its copy (zero duplication), naming the reachable replacement in the commit. At minimum, add Etmf to VR-05's client tests.
12. **Authoring and eSTAR exports do not fit the version-family model. authoring-file-to-vault.ts:288-291 writes each export as a new row with code 'authoring-<id>' and version 'draft-<sha8>' or '<ver>-<sha8>', with no supersedes link. VR-08 refuses check-in against these (VERSION_SCHEME_UNKNOWN), and VR-09 groups families by the successor relation. So one authored document shows as N separate 'current' documents, counts N times, and VR-14 treats every copy as current.**
   *Fix:* Define what a family is for these rows: either the successor chain, with authoring linking each re-export to the previous head through VR-08's path (authoring lane consent), or document_code plus a declared ordering. Add a VR-09 test with two authoring exports of one document.
13. **One vault table falls outside every slice and exclusion: vault.document_archives. The retention job copies whole rows into it, extracted_text included (server/jobs/retentionCron.ts:79-91; shared/schema/vault.ts:338-355). Nothing makes it immutable, even though its creating file calls it an 'immutable JSON snapshot' (migrations/20260608_vault_retention.sql:8). The tenant purge's list does not include it, and the purge-coverage gate cannot see it because the gate reads public tables only. Its creating migration is on no deploy applier list.**
   *Fix:* Add document_archives to VR-06/VR-07's scope (append-only trigger, deleted only through the owner-run purge function) and to C2C_MIGRATION_FILES, or record an explicit exclusion with a reason.
14. **Data-room intake records no one and writes no audit row. cre_evidence_sources has no created_by column (db/migrations/20260724_clinical_regulatory_evidence_spine.sql:32-64). Neither the chat capture nor createSupersedingSource writes a chained audit row: server/routes/chat/upload.ts and evidence-spine.service.ts contain no writeChainedAuditRow or logAction call. VR-16 freezes the checksum, but who captured the file, and when a source was superseded, are not in the chain. stored_artifact_ref and client_program_id also stay mutable, so a source can be moved to another project's room or re-pointed at different bytes.**
   *Fix:* Extend VR-16: add created_by as an additive column; write chained data_room.capture and data_room.supersede rows in the capture and supersession transactions; make stored_artifact_ref and client_program_id write-once.
15. **Several Veeva capabilities have neither a slice nor a stated exclusion: - Document relationships. VR-05 turns parentDocumentId into a 400 (server/routes/vault-ingest.ts:122) with no replacement, which the working agreement requires. - Version compare. - Review annotations and comments. - Library search across programs. - Moving a document to another project (VR-06 freezes program_id). - A scheduled fixity sweep that re-hashes stored bytes. server/jobs has only auditChainIntegritySweep.ts, so byte loss is found only when someone downloads. - Where-used beyond eCTD: estar-attachment-plan.ts:508 reads vault bytes, and vault.evidence_citations references documents.**
   *Fix:* Add each to the parity table, as a slice or as an exclusion with a reason. Name the replacement for parentDocumentId, or make its removal a founder decision. Add the fixity sweep as a D5 slice that extends auditChainIntegritySweep and writes a chained verdict per document. Extend VR-14's 'Placed in' to eSTAR attachments.
16. **Smaller corrections: - VR-08's lineage trigger compares organization_id, which is nullable on legacy rows (shared/schema/vault.ts:95-106), so a plain '=' fails those rows. It also takes an advisory lock on a uuid, which must first be hashed to a lock key. - VR-13 lists 'in_review → approved without sign-off gets 409 REVIEW_SIGNOFF_REQUIRED' among its red tests, but shared/regulatory/document-lifecycle.ts:190 already enforces it. - writeChainedAuditRow always writes old_values NULL (server/services/auditService.ts:306). VR-05's before/after values live in new_values, which the chain hash covers.**
   *Fix:* In VR-08, use IS NOT DISTINCT FROM, or refuse heads with a NULL org, and use the two-key or hashtext advisory-lock form. In VR-13, label that test a control. In VR-05, record that before/after is kept in new_values on purpose, and tell the D5 substrate lane that P1-19's old_values half is still open.

First-slice blockers the critic named:
- Point the history reader at the canonical ledger (readAuditLedger / AUDIT_LOGS_SQL in server/routes/audit-trail-ledger.routes.ts), not mdx-audit.ts, which orders by created_at, has no chain_seq and still claims a single global chain. Compute each filtered row's chain predecessor with a LATERAL lookup on (tenant_id, chain_seq), not a LAG over already-filtered rows.
- Replace the 'consecutive chain_seq' assertion. chain_seq is a global sequence with gaps. Assert non-null and distinct values, per-tenant predecessor linkage, and verify-chain ok.
- Update the vault-download.test.ts pool mock (line 35: connect is vi.fn() returning undefined) in the same commit, so the AUDIT_WRITE_FAILED control fails only for the behaviour it guards.

## 5. Founder decisions

No session decides these. Each lists the slices it blocks and the plan's recommendation.

### FD1. What version numbering does a checked-in Vault upload get?

- (a) Sequential majors: 1.0 → 2.0 → 3.0. Matches the existing '1.0' default (shared/schema/vault.ts:111), and every version is a new immutable row.
- (b) Veeva-style major.minor: 0.1, 0.2 for drafts, then 1.0 on approval. Approval would have to relabel a frozen row, or mint a second row with the same bytes, which UNIQUE (program_id, content_hash) refuses on install-fresh databases (db/migrations/044c_gcc_vault_schema.sql:106-107).
- (c) Plain integers: 1, 2, 3.

**Recommendation:** (a). Approval is a lifecycle stage on the canonical record (VR-13), not a relabel. Under (a) a version number never changes after it is written, which VR-06 requires.
**Blocks:** VR-08, VR-09

### FD2. May a check-in re-issue bytes identical to an earlier version (a revert)?

- (a) Refuse, naming the earlier version (CONTENT_ALREADY_A_VERSION).
- (b) Allow it as a new version. This needs UNIQUE (program_id, content_hash) removed on install-fresh databases, by amending that creating file in place under Rule 1.

**Recommendation:** (a) for launch. It behaves the same on every install path. A revert is rare and can be expressed by checking in a trivially re-rendered file.
**Blocks:** VR-08

### FD3. What is the records-retention and destruction policy for Vault versions, including noncurrent S3 object versions and Object Lock?

- (a) Never destroy during a tenant's life: retention may only tombstone (deleted_at), and only the tenant purge destroys.
- (b) Hard-delete after a written retention period, through a signed, chained disposition with an owner-run function like VR-07's.
- (c) (a) now, with S3 Object Lock in governance mode and noncurrent-version retention set in the D1 lane.

**Recommendation:** (c). VR-07 makes (a) the enforced state now, so the undecided policy fails closed. Object Lock and noncurrent retention go to the D1 storage lane once the AWS account exists. This is already on the founder list for D1 ('document-storage retention').
**Blocks:** retention hard-delete stays refused (VR-07), S3 Object Lock / WORM (excluded, D1 lane)

### FD4. What is the approval policy for Vault documents?

- (a) Every Vault document must be reviewed and approved before it counts as settled or transmittable; a distinct 'reviewed' signature before 'approved'; the uploader may neither review nor approve; approval authority follows isSigningAuthorized.
- (b) Approval required only for a named set of document types (e.g. Module 2-5 content), with correspondence and forms exempt.
- (c) Approval alone, with no separate review signature, and the reviewer may be the uploader.

**Recommendation:** (a) as the shipped default: it is the spine's gate as written, and follows the QMS self-approval precedent. Move to (b) only with a written list of exempt types. Whether reviewers are named people or role queues can wait; VR-13 ships stage-based queues.
**Blocks:** VR-13, VR-14

### FD5. How does the transmit gate roll out, and does a sealed Authoring export carry its approval to the Vault copy?

- (a) No grandfathering: open sequences with unapproved Vault leaves are refused at their next transmit, naming each leaf, and the user approves in the Vault. Authoring exports are approved again in the Vault.
- (b) Grandfather leaves placed before the gate ships; enforce for new placements only.
- (c) (a), except a sealed Authoring export's approval carries over when that approval is bound to the exported bytes' SHA-256.

**Recommendation:** (a) now. Today no Authoring signature is bound to the exported PDF's bytes (authoring-file-to-vault.ts:282-291 marks sealed or draft only in the version string), so (c) is only possible once such a binding exists.
**Blocks:** VR-14

### FD6. May the descriptive metadata of an approved Vault version be corrected in place?

- (a) No: a correction at approved or later is a new version.
- (b) Yes, by a document coordinator, with a reason and before/after audit, as Veeva allows.

**Recommendation:** (a) for launch. It keeps the approved record and its signature's meaning unambiguous, and it is what VR-13 ships.
**Blocks:** VR-13 (edit refusal policy)

### FD7. Who may place and lift a legal hold, and does lifting require an e-signature?

- (a) Org admin only; lifting requires an e-signature with a reason; an active hold always blocks the tenant purge (today's behaviour).
- (b) Any editor may place a hold; admin lifts; no e-signature.
- (c) (a), plus a platform-admin purge override with a recorded legal reason.

**Recommendation:** (a). An override (c) is a legal and contract question that should wait for counsel.
**Blocks:** VR-17

### FD8. Under Rule 2, are facets, the data-room seal and the closing archive scheduled before D1-D10 are green?

- (a) Defer all three until the launch rows are green.
- (b) Schedule the seal and archive now as D5/D6 evidence work, and defer facets.
- (c) Schedule all three.

**Recommendation:** (b) only if the founder decides the closing archive is the D6 data return's byte carrier (FD10). Otherwise (a). VR-09 already delivers the current-version default, which is the part of search that is required.
**Blocks:** VR-18, VR-19, VR-20

### FD9. Is sealing the data room an e-signed act, and which role may seal?

- (a) An e-signed act: reverifySigner plus an electronic_signatures row with meaning 'sealed', bound to manifest_sha256; admin or manager.
- (b) An audited action with a written reason; any editor.

**Recommendation:** (a). A seal is what a counterparty or inspector will rely on, and the signing path already exists.
**Blocks:** VR-19

### FD10. How is a closing archive delivered, and is it also the byte carrier for the tenant data return (the open D6 item)?

- (a) Download only, built from a staged, fully verified file.
- (b) A KMS-encrypted stored object with an expiring link served through the audited reader, never a presigned URL.
- (c) (a), and tenant-full-export calls the same builder so the data return carries bytes.

**Recommendation:** (c). It answers the open D6 question with one builder and no second export path.
**Blocks:** VR-20

### FD11. Does the ana.document_catalog toggle govern a person's 'File into Vault' action in the data room?

- (a) No. The toggle governs AnA's catalog and comprehension; a person filing through the Vault's own ingest needs no toggle, just like a Vault upload.
- (b) Yes. Filing from the data room waits until the toggle is on.

**Recommendation:** (a). The board records the toggle as governing AnA's catalog (docs/work-orders/README.md, AnA client-files row), and a person's governed filing is the same act as a Vault upload.
**Blocks:** VR-11 (only if the founder chooses b)

### FD12. How are external parties admitted to a data room: principal model, who may grant, invitation vs existing account, expiry and revocation, and exclusion of the org default workspace?

- (a) Defer until D1-D10 are green (Rule 2).
- (b) A new non-tenant principal type with room-scoped policies on new public tables (organization_id INTEGER NOT NULL): invitation by email, grants that expire and can be revoked, the default workspace excluded, and every read through readVerifiedVaultBytes with actor_kind on the audit trail.
- (c) Grant external users an organization_users row in the owning tenant. Rejected: that gives tenant-wide access.

**Recommendation:** (a) now, then (b) when the launch rows are green. Production auth requires an organization_users row (server/auth.ts:196-216) and every portal table is integer-org FORCEd, so no grant insert can work without this decision.
**Blocks:** the entire external data room (excluded from this plan)

## 6. Deliberately excluded

- The external virtual data room: invitations, a non-tenant principal, room grants, permission tiers, a view-only secure viewer, per-viewer dynamic watermarking, NDA click-through, Q&A, access expiry and revocation, per-viewer engagement analytics, redaction, and actor_kind / external_principal_id on audit_logs. It is outside the launch catalog under Rule 2, the board says 'Data room — founder decisions first' (docs/work-orders/README.md), and it is structurally impossible today: authentication requires an organization_users row (server/auth.ts:196-216), and client_access has no writer. FD12.
- Client-portal honesty defects: safeRows renders every SQL error as an empty list (server/routes/client-portal.ts:150-160), ClientPortal.tsx:236 claims Part 11 logging that no code performs, and a client-controlled req.body.watermark is accepted at server/routes/cerv2-export-routes.ts:938. These surfaces are outside launch scope. Report them on the board; do not build.
- A vault.document_versions table (VAULT_DATA_ROOM_ASSESSMENT_2026-09-05.md:855). It duplicates the row-per-version model of vault.documents in a schema that no RLS sweep covers (Rule 1, zero duplication). Its named template's own immutability file (db/migrations/20260318_ga_immutability_hardening.sql) is on no automated applier.
- A lifecycle or stage column on vault.documents, or any separate vault lifecycle table. Either would be a seventh document-state vocabulary; the canonical spine (canonical_documents, public, INTEGER org) is extended instead (VR-13).
- A self-referencing foreign key on vault.documents.supersedes_id. Even NOT VALID, it would make the tenant purge fail on any legacy cross-tenant pointer, and ON DELETE SET NULL contradicts VR-06's write-once rule. VR-08's BEFORE INSERT trigger enforces lineage for every new write instead.
- CHECK constraints on placement_status, evidence_kind or ctd_section. Legacy rows hold classifier 'N.0' sections, and PostgreSQL enforces a NOT VALID CHECK on every later UPDATE, so those rows would become impossible to place or back-fill. Vocabularies are enforced in the one writer (VR-04, VR-05) and by the writer-site CI gate (VR-06).
- Tightening validateSectionCode to refuse 'N.0' for modules 2-5. It is shared with leaf placement, so the change belongs to the D7 lanes; EU Module 1 has a legitimate 1.0. VR-04 removes 'N.0' at its source, the detector.
- Using headingPathFor to validate a vault section. It matches by prefix, and returns null for every Module 1 code (server/services/submission-gateways/ectd-packager/ich-headings.ts:178-199).
- A runtime-settable GUC bypass for deleting vault records. The security audit's P0-8 is retiring that pattern for audit_logs; VR-07 uses an owner-run SECURITY DEFINER function instead.
- Legal-hold checks inside the vault.documents trigger. The purge already checks holds in its transaction (tenant-offboarding.ts:440-455) and VR-07's function re-checks them. A trigger reading vault.legal_holds through its tenant policy could fail open under a system scope.
- S3 Object Lock / WORM, recording s3_version_id, and noncurrent-version retention. These belong to the D1 storage lane (terraform/stack/vault_storage.tf), need the AWS account, and depend on FD3. No page will claim WORM storage; the immutability claim rests on database guards only.
- FORCE ROW LEVEL SECURITY on vault.*, and making vault.documents.organization_id NOT NULL. This is D3 lane work, and establishRequestTenantScope must first refuse an empty orgUuid (server/middleware/establishRequestTenantScope.ts:180) or the Vault would read empty.
- Per-document and per-folder ACLs, dynamic access control, and classification enforced on read. No launch row needs them, and the access model is a founder decision. When built, they must extend authoring's doc_permissions (db/migrations/20260727_authoring_object_permissions.sql), not add a second ACL.
- Renditions (DOCX → PDF), an in-browser viewer, controlled-copy overlays, and signature pages stamped on downloads. These are new capabilities outside D1-D10. A stamped copy changes the served hash that URS-VAULT-006 pins, so a stamped copy would have to be modelled as a separate rendition.
- Check-out and cancel-checkout locks, and reviving the dead document_locks table (shared/schema.ts:2062-2090). Versions are immutable once recorded, so check-in without check-out (VR-08) is enough.
- Binders, auto document numbering by type pattern, type/subtype hierarchy, required fields per type, bulk edit of arbitrary fields, saved searches and views, and a VQL-like query. New capability that no launch row needs.
- Periodic review and signed withdraw/obsolete for Vault documents. The spine declares no signed 'withdrawn' meaning (shared/regulatory/document-lifecycle.ts:104-112), and periodic review belongs to QMS controlled documents.
- QMS defects: revise mutates the effective row in place, superseded_by_id is never written, and retire is unsigned (server/routes/mdx-qms.ts:628-710). They belong to the follow-through lane (…01Wcyqbq) and security plan P0-18. Once VR-08 exists, adopting its version-chain shape is a handoff to that lane.
- Recording the filing view on the vault row. It was handed to …01DiJJAk in 49293661, because the fix is in placeVaultDocument and the ingest. VR-04 only narrows resolveVaultView's error fallback; the read side was fixed in 20137569.
- The follow-through lane's V1 (single-document filing sends no reason). It was handed to …01DiJJAk and is taken in VR-05 only by agreement. VR-11's bulk confirm carries its own required reason.
- Moving AnA read receipts (vault.document_read_receipts) into the Part 11 chain, passage or semantic search in the Vault UI, and turning on ana.document_catalog or ana.vault_chunking. These are the AnA lane's code and the founder's toggles.
- Consolidating the second vault read model, server/routes/mdx-vault.ts. The MDX surface is flagged off, so this is zero-duplication cleanup with no launch row; retire it when it is next touched.
- Veeva Vault sync or migration (server/integrations/veeva-vault/, referenced only by its own test). A new integration outside the catalog.
- Bulk zip or folder import, and streaming uploads beyond the 50 MB in-memory cap (server/routes/vault-ingest.ts:56,71). Scale work with no launch row.
- The classifier's model-written catalog document_kind as a governed classification. Rule 2's model boundary applies: governed type, placement and approval stay deterministic and signed by a person.
