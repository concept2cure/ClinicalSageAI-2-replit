# Project first: every record anchored to one project (PF-00 to PF-17)

**Date:** 2026-09-26. **Author:** session `…01KnUGoX`.
**Source:** the project-anchoring audit `wf_9dedbf38-bee`: a scout, seven segment audits (project, Data Room, Vault, AnA, Authoring, submission, producers), an adversarial verify of each, a critic of the lineage plan, and a synthesis. Every claim below cites the file and line it was verified against, at HEAD `b8cd6c2c` unless stated.
**Companion:** `docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md`. The LX items trace lineage hop by hop; the PF items make the project the first hop of every chain. The founder's principle, verbatim: *"all starts with a project as the beginning of a client's work process, and from there into Vault, data room and beyond."*

## 1. Answer

No. Only the project itself starts correctly. The Projects wizard creates exactly one regulatory_programs row, and that row's organization comes from the signed-in user (server/routes/c2c/projects.ts:765). The dossier outline scaffolded with it carries its key (migrations/20260528_phase9_document_schema.sql:56).

The chain first loses its project at the very next hop: the submission the same wizard creates for a drug project.
- `submissions` had no project column at all until LX-22 added a nullable `program_id` on 2026-09-26 (migrations/20260925b_submissions_program_anchor.sql:56). No writer fills it yet (submission-service.ts:137-157).
- Intake still reuses any same-organization submission whose product name matches (project-intake.ts:124-137). Two projects can therefore share one filing.
- Submission Center makes the user pick a programme, then sends only its title (SubmissionCenter.tsx:482-488).
- As a result, every sequence, leaf and transmittal reaches its project only by name matching, or through a JSON field in an audit row.

Earlier in the chain, the Data Room, AnA conversations and study designs do carry a project key. But it is optional, and it is checked only for UUID shape. The exception is Authoring's POST /docs, which LX-20 fixed yesterday. So a file uploaded with no project open, or with another organization's project id, is accepted and lands in no project anyone can open. The same file dropped into a second project silently resolves to the first project's record (evidence-spine.service.ts:312-330).

A Vault document can be placed into any submission of the organization, because the leaf check compares organizations, not projects (submission-service.ts:1692-1716). A second "project" identity, the integer projects.id, still keys the Tasks board, AnA drafts and submission packages. It is bridged to the real project by an optional anchor with no foreign key, and a name match on every deploy can re-link that anchor (20260814:143-170).

The plan below has 18 PF fixes. They make regulatory_programs.id the one key:
- one ownership check at every writer;
- a same-organization composite foreign key as the database backstop;
- submissions written with their project;
- cross-project placements refused.

Most go ahead of LX-04/LX-06, LX-11 and LX-12. Seven of the fixes also carry a decision only you can make.

## 2. The invariant

KEY. regulatory_programs.id (UUID) is the only project key. Its owner is regulatory_programs.organization_id INTEGER NOT NULL (migrations/20260524_program_workbench_schema.sql:26-28). The pair is unique through regulatory_programs_id_org_uq (migrations/20260925b_submissions_program_anchor.sql:62). projects.id, cmc_projects.id, fda_510k_projects.id and client_workspace_id are never a record's project key. A row keyed to one of them reaches a program only through a recorded anchor that has a foreign key, and a write is refused when that anchor is NULL or points outside the caller's organization.

STORES AND HOW EACH CARRIES IT.
(a) Direct key. The column holds the program UUID, and a same-organization composite foreign key backs it: (key, org) → regulatory_programs(id, organization_id). The key is added NOT VALID and guarded under Rule 1, the same way 20260925b:66-76 does it. It is written only after programInOrganization(db, id, org) returns true (server/services/c2c/program-access.ts:138-150). This covers:
- submissions.program_id
- c2c_documents.project_id
- vault.documents.program_id
- cre_evidence_sources.client_program_id (client_document)
- authoring_documents.client_program_id
- chat_threads, via a program column that replaces metadata->>'programId'
- cdisc_prm_studies.program_id
- submission_transmittals.program_id
- projects.regulatory_program_id (the anchor)
- cmc_projects and the device project tables, through a new program link
- cmc_* project_id where it names a program

(b) Recorded parent key. NOT NULL plus a foreign key to a record in (a). This covers:
- c2c_document_sections → c2c_documents
- authoring_sections, doc_revisions, comments, citations, freezes and signatures → authoring_documents
- vault.document_catalog and vault.document_chunks → vault.documents
- chat_messages → chat_threads
- ectd_sequences → submissions
- submission_leaves → ectd_sequences
- a transmittal → its sequence (a new sequence_id)
- a filing copy → c2c_document_aliases → authoring_documents

REFUSED. Every refusal happens before any write, and each one fails closed:
- No program where the record kind needs one: 400 PROJECT_REQUIRED.
- A program that is missing, soft-deleted or in another organization: 404 'Project not found'. This is the LX-20 shape, 404 rather than 403, so nothing leaks.
- A leaf, pin, citation, filing copy, conversation turn or transmittal whose source's program differs from the target's program: 409 CROSS_PROJECT.
- No project is ever assigned by name, code, checksum or a model's argument.
- A record never moves from one program to another. It can go from none to a program only through one audited adopt action.
- The database answers 23503 as a backstop for a cross-organization key.

WHAT THE USER SEES.
- Create controls are disabled, with 'Open a project first' or a project picker, until a project is open.
- A refusal is shown as a notice that names its reason. It is never an empty result and never a 'ready' chip.
- ProjectHome lists every record kind by key: sources, documents, conversations, submissions, transmittals, designs and Module 3.
- Every create writes an audit row whose new_values names program_id.

EXCEPTIONS. Only these, each by founder decision and each enumerated: global-public corpus sources, and organization-level QMS SOPs.

## 3. Where each store stands today

| Segment | Store | How it is anchored | Evidence |
|---|---|---|---|
| project | regulatory_programs | the key; org from the authenticated request; one server INSERT | migrations/20260524_program_workbench_schema.sql:26-28; server/routes/c2c/projects.ts:765; on the applier at scripts/db/migration-set.mjs:100 (index 1). ADR-0011 is still 'Proposed' (docs/adr/0011-canonical-project-identity-space.md:5), and a different ADR also uses number 0011 (docs/adr/README.md:28) |
| project | projects.regulatory_program_id (PM-spine anchor over integer projects.id) | direct but optional; no FK; the backfill infers a link by name/code and re-runs on every deploy | migrations/20260814_projects_regulatory_program_anchor.sql:89 (column), :143-170 (name/code match UPDATE, RAISE NOTICE only), :30-41 (no-FK rationale, stale: 20260524 is on the set at migration-set.mjs:100); only app writer program-project-anchor.ts:235; nine other projects INSERTs never set it |
| project | c2c_documents.project_id | direct FK to regulatory_programs(id), but nullable on every deployed database and not org-matched | migrations/20260528_phase9_document_schema.sql:55-56; migrations/20260529_phase9_backfill.sql:31 (DROP NOT NULL, replayed every deploy; set index :103); only live writer scaffold-project-documents.ts:153 inside the creation transaction |
| project | c2c_document_sections | parent key (document_id NOT NULL FK CASCADE) | migrations/20260528_phase9_document_schema.sql:88-90 |
| project | submissions.program_id | direct key with a same-org composite FK (LX-22 part 1), but nullable, written by no writer, filled only by a one-to-one deploy backfill; intake still adopts by name | migrations/20260925b_submissions_program_anchor.sql:56, :66-76, :100-110; server/services/submission-service/submission-service.ts:137-157 (insert names no program); server/routes/c2c/project-intake.ts:124-137 (name/title adoption); server/routes/submissions.ts:167-174 (no program field) |
| project | c2c_project_pinned_evidence | direct project_id with no FK and no org column; evidence_ref unchecked; creating file not on the applier | migrations/20260529_phase10_schema.sql:88-96; server/routes/c2c/projects.ts:1234-1243 |
| dataroom | cre_evidence_sources (client_document) | direct but optional; two id-spaces; UUID shape-checked only; identity adopted across projects by checksum | migrations/20260726_cre_source_program_scope.sql:68-69 (no FK); db/migrations/20260724_clinical_regulatory_evidence_spine.sql:34,36; server/routes/chat/upload.ts:52-62 (regex only), :557-558; evidence-spine.service.ts:312-330 (checksum + org, no program) |
| dataroom | file_uploads | none (organization_id only) | migrations/20260726_file_uploads_tenancy.sql:46-60; AnA edit_spreadsheet saveDerivedUpload (uploaded-file-access.ts:270-305) |
| dataroom | lumen_data_atoms (chat_upload) | inferred: the program appears only as a free-text 'program:<uuid>' tag, which nothing reads | server/routes/chat/upload.ts:658-664; migrations/0000_sweet_joseph.sql:3958-3971 |
| dataroom | concept2cure_artifacts (numeric-path upload) | other id-space (projects.id), not org-checked | server/routes/chat/upload.ts:252-343; migrations/0000_sweet_joseph.sql:1849, FK :6488 ON DELETE CASCADE |
| dataroom | vault.document_chunks | parent key, org-checked on write | migrations/20260905b_vault_document_chunks.sql:43-45; server/services/vault/document-chunking.service.ts:250-258 |
| vault | vault.documents | direct, NOT NULL, org-checked at ingest (deleted_at ignored), no FK | db/migrations/044c_gcc_vault_schema.sql:69; server/services/vault/vault-ingest.service.ts:190-192 (no deleted_at); all four callers require a program (vault-ingest.ts:115, document-catalog-tools.ts:563-575, authoring-file-to-vault.ts:384-389, estar-artifact-retention.ts:149) |
| vault | vault.documents version pointers (parent_document_id, supersedes_id) | each version row is direct; the pointers are unchecked UUIDs | migrations/20260821_vault_documents_canonical_shape.sql:108-109, :155-160; vault-ingest.service.ts:548-549, :488-489 |
| vault | Vault placement (folder_id and related columns) | on the document row; program, org and deleted_at checked | migrations/20260823_vault_document_placement.sql:49; server/services/vault/vault-placement.service.ts:222-248, :309-322 |
| vault | vault.document_catalog / document_read_receipts | parent key (FK CASCADE) | migrations/20260905_document_catalog.sql:79-80, :102-104 |
| ana | chat_threads | JSON only (metadata.programId); shape-checked; fixed when the thread is minted; never compared on resume | migrations/20260728_chat_thread_store.sql:70-79 (integer project_id unused); server/services/chat-thread-helpers.ts:168-170, :180-196; cortex-unified.ts:1332-1344 (no org) |
| ana | chat_messages | parent key to chat_threads | migrations/20260728_chat_thread_store.sql:96-98 |
| ana | ai_threads.project_id | free text holding either id-space; unchecked from the request body | db/migrations/20260224_ai_trace_chain.sql:21; server/routes/chat/send-message.ts:163-170 |
| ana | concept2cure_artifacts (AnA drafts, save_document_to_vault, create_artifact, approve_import) | other id-space; the UUID path goes through the org-checked anchor, the numeric path is unchecked | server/routes/ana-ri/post-processing.ts:159-170; server/services/ana/artifactVersionStore.ts:143-165; stream.ts:503-504, :1740-1741 (projectId = Number(uuid)\|\|null) |
| authoring | authoring_documents.client_program_id | direct but optional. POST /docs refuses a foreign, missing or deleted program (LX-20); from-draft checks shape only; no adopt path | server/services/authoring/authoring-documents.ts:458-477; server/services/authoring/authoring-from-draft.ts:150-153, :223-238; migrations/20260727_authoring_document_program_scope.sql:22-24, :57-60 |
| authoring | authoring_sections / doc_revisions / comments / citations / freezes / signatures | parent key through authoring_documents (composite tenant FKs); comment doc_id comes from the body unchecked | db/migrations/20260725_authoring_document_loop_tables.sql:59-61, :184-204; server/routes/authoring.router.ts:2254-2296 |
| authoring | authoring_citations / document_span_lineage (source side) | inferred: a citation's project is read from the cited source's program, not the document's | server/services/clinical-regulatory-evidence/source-usage.service.ts:186-203, :421-425; span-lineage.service.ts:254-279 |
| authoring | coauthor_documents (filing copies) | none; reaches a project only through c2c_document_aliases, and only when made from an authoring document | migrations/0000_sweet_joseph.sql:1538-1556; server/services/coauthor/coauthor-snapshot.ts:436-445, :503-508 |
| authoring | canonical_documents.project_id | free text, optional, unchecked (API only) | migrations/20260731c_canonical_documents.sql:12-15; server/routes/document-lifecycle.ts:167-177 |
| authoring | concept2cure_signatures (seals) | parent key into the integer space; the seal writer does not check the org (flag-off route) | migrations/0000_sweet_joseph.sql:1849, :6507; server/routes/ana-ri/seal-verified.ts:59 |
| submission | ectd_sequences / submission_regions | parent key to submissions (whose program_id is NULL for every product-created row) | migrations/20260604_submission_core_canonical.sql:45, :62-64 |
| submission | submission_leaves | parent key to the sequence; the document's program is never compared with the sequence's | server/services/submission-service/submission-service.ts:1692-1716 (org-only vault verifier), :1842-2072 upsertLeaf |
| submission | submission_transmittals | direct but optional, from the request body; null on both spines; no sequence_id; no FK on install-fresh databases | migrations/20260509_submission_gateways.sql:12-16; server/routes/mdx-submission-gateway.ts:164; submission-service.ts:1389-1397 (programId: null); shared/schema.ts:19319-19326 |
| submission | c2c_submission_packages | other id-space (projects.id), not org-checked | migrations/0002_phase15_submission_ops.sql:10; server/routes/submission-ops.ts:236-251; server/services/ana-ri/command-executor.ts:1839-1860 |
| submission | estar_submissions / eSTAR export artifact | other id-space, nullable, no FK, unchecked; export anchored on the fda_510k_projects serial | migrations/20260730_estar_submission_project_link.sql:15-16; server/services/pathway-engines/estar/estar-submission-service.ts:85-111; server/routes/510k-estar-routes.ts:223-230 |
| submission | rendered_leaf_files / ind_dispatch_snapshots | none (out of launch scope) | migrations/20260903_rendered_leaf_files.sql:35-56; migrations/20260610_ind_dispatch_snapshots.sql:12-16 |
| producers | cdisc_prm_studies.program_id | direct but optional, shape-checked; the upsert overwrites it and has no tenant predicate; its column file is on no applier | db/migrations/20260727_prm_program_link.sql:32-33 (absent from C2C_MIGRATION_FILES); server/services/study-design/study-design-repository.ts:162-166, :236-243 |
| producers | statistical_summary artifacts / unified_tasks from the bridge | other id-space, reached through the optional anchor; programId echoed unvalidated | server/services/biostatistics-bridge/bridge-service.ts:145-163, :394-411; migrations/0000_sweet_joseph.sql:1849 |
| producers | cmc_source_objects / cmc_module3_sections / cmc_provenance_events | free-text key holding either id-space; several writers unchecked (cmc-changes is served in production) | db/migrations/20260401_cmc_convergence_os.sql:3-6, :19-22, :92-95; server/api/cmc/module3OperatingSystemRoutes.ts:83-113; server/routes/cmc-changes.routes.ts:116-138; server/services/cmc/project-membership.ts:19-39 (dual-space, no deleted_at) |
| producers | cmc_projects | a separate project identity with no program link | db/migrations/20260730_cmc_projects_reconstruction.sql:31-47 |
| producers | qms_documents / qms_change_controls / quality_management_plans | none (organization_id only); artifact_id unconstrained | migrations/20260511_qms_and_labeling.sql:23-43; server/routes/mdx-qms.ts:164, :356-375 |

## 4. The fixes

Each fix names the tests that must fail first, its owner by lane window (as measured at 02:55Z; re-read each file's log before editing) and any decision only the founder can make.

### PF-00: The founder-path walk asserts one program at every hop, by column, and fails on the cross-project and cross-organization cases

- **Launch row:** D4 (validation evidence) for D2
- **Relation to the lineage plan:** Amends LX-00. It comes first, and every later PF closes one of its baselined entries
- **Size:** M
- **Closes:**
  - project MISSED-4 (the walk cannot catch two programs sharing one submission)
  - critic S3 (the walk ends at a checksum, not a project)
  - critic D2 (the baseline carries no project hop)
- **Files:**
  - tests/lineage/founder-path-lineage.world.ts
  - tests/lineage/founder-path-lineage.hops-filing.ts (:243-249 reads c2c.project.create JSON; it must read submissions.program_id)
  - tests/lineage/founder-path-lineage.hops-authoring.ts
  - tests/lineage/founder-path-lineage.pglite.test.ts
  - tests/lineage/founder-path-lineage.baseline.json (ceiling 18, no project hop today)
  - scripts/ci/check-canvas-path.mjs
- **Tests first (red at HEAD):**
  - A new check, project-key-by-column, for every record the walk visits: submission.program_id, transmittal.program_id, the thread's program, vault.documents.program_id, source.client_program_id, and design.program_id. Each must equal k.programId. It is red at HEAD on submission (the backfill runs only on deploy) and on transmittal (the baselined {sequenceIdColumn:false, programId:null})
  - A second world with two programs for the same product in one organization, asserting distinct submissions. It is red at HEAD: ensureSubmissionSpine returns created:false (project-intake.ts:134-136)
  - Cross-organization negatives: org B names org A's program on upload, from-draft, thread, study-design persist and transmit. Each must be refused with zero rows written. All are red today
  - Launch no-project negatives: POST /api/authoring/docs and POST /api/chat/upload with no project. Red today
  - Each new baseline entry is closedBy a PF id; the ceiling is raised once and then only shrinks. Delete one entry and show the gate failing, as LX-00 did
- **Owner and windows:**
  - …01KnUGoX (this session; LX-00 is claimed on the board, docs/work-orders/README.md:87). Every tests/lineage file was last changed by this session in 942b7d68, so there is no window conflict
- **Founder decision:** None.

### PF-01: One project key, decided: the project-identity ADR is accepted, renumbered and indexed

- **Launch row:** D2
- **Relation to the lineage plan:** Precedes every LX. It is the premise of LX-20/PF-02 and of dropping the integer space in PF-09
- **Size:** S
- **Closes:**
  - ADR-0011 is 'Proposed' (docs/adr/0011-canonical-project-identity-space.md:5)
  - The ADR number collision (docs/adr/README.md:28 indexes a different 0011)
  - PF-creation-5 (decision half)
  - critic P1
- **Files:**
  - docs/adr/0011-canonical-project-identity-space.md (a new number)
  - docs/adr/README.md
  - docs/PROJECT_IDENTITY_SPIKE_2026-08-21.md (the inventory the ADR classifies)
- **Tests first (red at HEAD):**
  - A contract test that ADR numbers are unique and every docs/adr/*.md is indexed. Red at HEAD on the two 0011 files
  - A schema-contract test that enumerates every column named project_id, program_id, client_program_id or regulatory_program_id and requires each to be classified as key, anchor or subordinate. It fails on any column left unclassified
- **Owner and windows:**
  - The founder decides. …01KnUGoX drafts. The ADR files have no edits in the last 24h
- **Founder decision:** Accept regulatory_programs.id as the only project key. projects.id, cmc_projects.id, fda_510k_projects.id and client_workspace_id become subordinate ids that reach a program only through a recorded anchor. The ADR moves live tenant data, so it needs your approval.

### PF-02: One ownership check at every writer in the UUID space (completes LX-20)

- **Launch row:** D2, with D3 for the cross-org half
- **Relation to the lineage plan:** Completes LX-20 (8eaccfa6 and bfbf0ee8 covered only POST /docs and the canvas tool). Precedes LX-02, LX-03, LX-06 and LX-10
- **Size:** L
- **Closes:**
  - PF-dataroom-3
  - ana MISSED-1
  - vault MISSED-1
  - PF-vault-2
  - vault MISSED-3
  - PF-ana-5
  - PF-authoring-2 (the from-draft residual)
  - PF-ana-10
  - PF-ana-13
  - PF-BCQ-1 (cross-org half)
  - producers MISSED-2 (the interview session binds an unverified project)
  - authoring missed (resolveOpenProgram's legacy branch trusts the anchor)
  - PF-SUB-8 (the body programId on transmit)
  - Zero duplication: projectBelongsToTenant and the hand-written copies LX-20 lists
- **Files:**
  - server/services/c2c/program-access.ts:138-150 (the one check; unchanged)
  - server/routes/chat/upload.ts:52-62 (resolveProjectScope becomes programInOrganization; refuse 404 before any write)
  - server/services/vault/vault-ingest.service.ts:190-192 (use the canonical check, so deleted_at is honoured)
  - server/services/authoring/authoring-from-draft.ts:150-153, :223
  - server/services/chat-thread-helpers.ts:168-196
  - server/routes/study-design.ts:480-497
  - server/services/study-design/study-design-repository.ts:162-166
  - server/services/submission-gateways/governed-transmit.ts:308, :602
  - server/services/vault/document-catalog.service.ts:523-534
  - server/services/authoring/authoring-draft-tool.ts:73-80
  - server/services/cmc/project-membership.ts:19-39 (moved onto the canonical check, then deleted)
  - server/services/ana/AnaToolExecutor.ts (create_labeling_document :14081-14090, create_per_document :8367-8382, CMC interview start :18970-19015)
  - server/routes/c2c/projects.ts (the six hand copies)
  - server/routes/c2c/actions.ts:158
  - server/routes/mdx-engineering.ts:157
  - innovation-routes programBelongsToOrg
- **Tests first (red at HEAD):**
  - Flip canonical-source-identity.pglite.integration.test.ts:212-219, which today accepts org B writing PROGRAM_A: the upload must now be refused 404 with no cre_evidence_sources row and no atom (audit probe P3/P4 returned 200)
  - Vault ingest into a soft-deleted program returns 404 (red: the probe-deleted SQL returned 1 row)
  - POST /api/authoring/docs/from-draft with org 2's program returns 404 and issues no INSERT (red: the audit probe got 201)
  - getOrCreateThread with a foreign or missing UUID is refused
  - POST /api/study-design/persist with a foreign program returns 404
  - The transmit body naming org B's program is refused (red: probe P5)
  - A CI gate: every INSERT that names program_id or client_program_id on an anchored table sits in a function that calls programInOrganization. Show it failing on upload.ts first
- **Owner and windows:**
  - Split by lane; windows as of 2026-09-26T02:55Z.
  - This session (…01KnUGoX): program-access.ts and authoring-draft-tool.ts.
  - Other lanes, closed or cold windows:
  - upload.ts identity block: unclaimed (last 22562bb2 by …01DiJJAk; window closed at 02:29Z). Take it after telling …01DiJJAk, who owns the atom blocks.
  - vault-ingest.service.ts and document-catalog.service.ts: the AnA client-files lane …01DiJJAk (claimed; last 370d9a75 on 09-24).
  - chat-thread-helpers.ts: cold (…01KiDof7, 09-07).
  - study-design.ts and study-design-repository.ts: cold.
  - governed-transmit.ts: cold (…015weqdG). Coordinate with the package-spine lane …01LjrcEe (claimed, D7).
  - AnaToolExecutor.ts: window closed at 02:54Z.
  - projects.ts: window closed at 01:31Z.
  - Still open, so hand these off:
  - authoring-from-draft.ts is in …01FSu2RL's window until 2026-09-26T03:06Z.
  - actions.ts is in …0194UQPx's window (3d09bf2a) until 2026-09-26T23:00Z.
- **Founder decision:** None. LX-20 already decided 404 rather than 403.

### PF-03: Writers in the integer space check that the projects row is the caller's and name its program

- **Launch row:** D3
- **Relation to the lineage plan:** Precedes LX-07 (one AnA document engine; save_document_to_vault) and LX-12 (the package spine keys on projects.id)
- **Size:** M
- **Closes:**
  - PF-dataroom-4
  - PF-ana-3
  - PF-ana-4
  - PF-ana-16 (latent)
  - PF-SUB-10
  - PF-creation-10
  - ana MISSED-3 (Artifacts Center shows another org's project code)
  - ana MISSED-4 (governed-action with no runId)
  - submission missed (the eSTAR export is anchored on the fda_510k_projects serial)
  - PF-BCQ-7 (latent)
- **Files:**
  - server/services/c2c/program-access.ts (a companion projectInOrganization(db, projectId, org) that returns the row's regulatory_program_id or null; same file, no new module)
  - server/routes/chat/upload.ts:252-343
  - server/routes/ana-ri/post-processing.ts:159
  - server/services/ana/artifactVersionStore.ts:143-165
  - server/services/ana-ri/command-executor.ts (create_artifact; create_submission_package :1839-1860)
  - server/services/ana/AnaToolExecutor.ts (approve_import :14369-14406; save_document_to_vault :19627-19657)
  - server/routes/ana-ri/utility.ts:81-91
  - server/routes/submission-ops.ts:151, :236-251
  - server/routes/device-projects.ts:159-168
  - server/routes/artifacts-center-routes.ts:250-252
  - server/routes/510k-estar-routes.ts:223-230
  - server/services/ana/verifiedSealService.ts:201-216
- **Tests first (red at HEAD):**
  - Re-run the scratch probe anaDraftForeignNumeric as a test: persistCollectedDrafts with org 1 and project 999, where 999 is org 2's, must refuse and write no upsert (red: it issued 0 ownership queries)
  - Chat upload with a numeric projectId of another org returns 404 and writes no concept2cure_artifacts row (red: probe P5)
  - POST /api/submission-ops/packages with a foreign projectId returns 404
  - POST /api/device-projects with a foreign clientWorkspaceId returns 404
  - The Artifacts Center never renders a foreign project code (join on p.organization_id = a.organization_id)
  - approve_import with a foreign project_id is refused
- **Owner and windows:**
  - This session: command-executor.ts (own window, 14607f90) and program-access.ts.
  - Cold or closed windows:
  - post-processing.ts: W1 lane …01T2wooC (82242c4c, 09-24). Coordinate.
  - AnaToolExecutor.ts: closed.
  - device-projects.ts: closed (…01E8btkB, 02:29Z).
  - artifacts-center-routes.ts: cold (352840f1).
  - submission-ops.ts: the package-spine lane …01LjrcEe (claimed). Hand off.
  - Still open, so hand these off:
  - utility.ts is in …0194UQPx's window (94036a27) until 2026-09-27T02:26Z.
  - 510k-estar-routes.ts is in …0194UQPx's window until 2026-09-26T23:00Z.
- **Founder decision:** None.

### PF-04: The database refuses a project key from another organization: same-org composite keys on every direct key

- **Launch row:** D3
- **Relation to the lineage plan:** Follows PF-02 and PF-03, so writers refuse with 404 before the database raises 23503. Extends the key LX-22 introduced to every direct key. Precedes LX-03 and LX-10
- **Size:** M
- **Closes:**
  - PF-creation-11
  - The FK half of PF-SUB-7 and PF-SUB-8 (submission_transmittals has no FK on install-fresh)
  - PF-BCQ-4 (cdisc_prm_studies.program_id is on no applier)
  - PF-SUB-13 (applier half)
  - The 'writer discipline only' condition on every direct key
- **Files:**
  - A new additive migration, inserted before the final sweep pair in scripts/db/migration-set.mjs (as 20260925b sits at index 309). It reuses regulatory_programs_id_org_uq (20260925b:62) and adds (key, org) FKs, NOT VALID and guarded on pg_constraint, on: authoring_documents(client_program_id, tenant_id), cre_evidence_sources(client_program_id, organization_id), vault.documents(program_id, organization_id), c2c_documents(project_id, org_id), cdisc_prm_studies(program_id, tenant_id), submission_transmittals(program_id, organization_id), and projects(regulatory_program_id, organization_id)
  - migrations/20260814_projects_regulatory_program_anchor.sql:30-41, amended in place with a dated header, because the 'no durable applier' reason is false
  - Put db/migrations/20260727_prm_program_link.sql's column onto the set through the additive file
  - Declare the references in the Drizzle models (shared/schema/*.ts), so a push neither drops nor misses them
  - Mirror the tables in server/db/pglite-harness.ts
  - Choose ON DELETE per table against PURGE_CHILD_TABLES (server/services/tenant/tenant-offboarding.ts:639-640 purges vault.documents before regulatory_programs). Everywhere else use SET NULL (key), as 20260925b:74 does
- **Tests first (red at HEAD):**
  - A PGlite contract per table, modelled on tests/schema-contract/submissions-program-anchor.pglite.test.ts: a cross-org insert fails with 23503; two replays change nothing; a purge-shaped delete is not blocked; the file sits before the final sweep pair
  - ci:migration-drop-safety and its selftest stay green
  - A pre-flight query lists existing cross-org rows, which NOT VALID keeps. Seed it with probe P3's org-2 source naming org 1's program and show that it lists that row
- **Owner and windows:**
  - …01KnUGoX. migration-set.mjs is shared: this session touched it last in 041976f2, and …01J935DZ in dd23c9c6 at 2026-09-25T23:53Z, so it is inside that lane's window until 2026-09-26T23:53Z. Insert only, before the final pair, and note it on the board
- **Founder decision:** None for the keys. When to VALIDATE after quarantining existing cross-org rows is an operations decision for each environment.

### PF-05: A submission is created with its program, and intake never adopts another project's submission (LX-22 part 2)

- **Launch row:** D2 (for D7)
- **Relation to the lineage plan:** LX-22 part 2. Precedes LX-11, LX-12 and LX-13, and turns PF-00's submission hop green
- **Size:** M
- **Closes:**
  - PF-creation-1 (the rest of it)
  - PF-creation-2
  - PF-SUB-1
  - PF-SUB-3
  - creation MISSED-1 (Submission Center discards the programme id)
  - submission missed (LX-22 half-built, items a–d)
- **Files:**
  - server/routes/c2c/project-intake.ts:112-151 (reuse only a submission with program_id = this program; otherwise create it anchored)
  - server/routes/c2c/projects.ts:846, :885-896
  - server/services/submission-service/submission-service.ts:137-157, :179, :219 (programId in the insert; SUBMISSION_CREATED details name it)
  - server/routes/submissions.ts:167-174, :220-226 (programId required and checked with programInOrganization)
  - client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx:466-489 (send programme.id)
  - client/src/concept2cure/v2/surfaces/Projects.tsx:351-387, :881 (after a skip notice, a second click cannot create a second program)
  - migrations/20260925b_submissions_program_anchor.sql, amended in place with a dated header: CHECK (program_id IS NOT NULL OR created_at < <cutover>) NOT VALID, guarded on pg_get_constraintdef
- **Tests first (red at HEAD):**
  - Flip server/routes/c2c/__tests__/projects-create.test.ts:415-436, which pins adoption by identity as intended: two programs with the same product must get two submissions, each carrying its own program_id
  - Probe P1 (spine-repro) as a PGlite test: 'C2C-101 IND (NSCLC)' and 'C2C-101 IND (Melanoma)' get distinct ids (red: both get 1)
  - POST /api/submissions without programId returns 400; with a foreign one, 404
  - A client test that the Submission Center form posts programId
  - A wizard test: after the projectAnchorSkipped notice, Create cannot mint a second program
  - tests/golden-journeys/drug-nda-ectd.journey.test.ts:321 stays green
- **Owner and windows:**
  - …01KnUGoX (LX-22 is claimed; docs/work-orders/README.md:87 says part 2 'waits on those windows'). As of 2026-09-26T02:55Z every window it named has closed:
  - projects.ts: …01FSu2RL, closed at 01:31Z.
  - submission-service.ts: …015oLV2v, closed at 02:43Z.
  - routes/submissions.ts: last non-merge 9bd657d0 by …01AiwZKG, closed at 02:54Z.
  - SubmissionCenter.tsx: …01FSu2RL, closed at 01:15Z.
  - project-intake.ts is cold. Re-read each file's log before editing
- **Founder decision:** When a new program names a product that already has a submission under another program, proposed: a new submission for the new program, never a shared one. Whether device, CER and MDR programs get a submission at intake is LX-26's decision (PF-15).

### PF-06: One program → submission read, and the four name matchers are deleted

- **Launch row:** D2 (for D7)
- **Relation to the lineage plan:** Follows PF-05; precedes LX-13 and LX-14. LX-00's sequence-to-project hop moves off the audit JSON
- **Size:** M
- **Closes:**
  - PF-SUB-2
  - PF-SUB-4
  - PF-creation-6
  - creation MISSED-2
  - submission missed (a fourth matcher)
  - PF-SUB-11 (the submissions half)
  - PF-vault-5 (the picker half)
- **Files:**
  - server/routes/c2c/projects.ts (GET /:id/submissions keyed on program_id, on the existing router)
  - server/services/cmc/submission-spine.ts:50-80
  - client/src/concept2cure/v2/surfaces/DispatchReadiness.tsx:92-181 (its own comment at :107-108 says no server read exists)
  - server/services/ind-lifecycle/ind-checklist-view-assembler.ts:252-263
  - server/routes/ectd-compile.ts:510, :1230, :1401, :1624 (callers)
  - client/src/concept2cure/v2/surfaces/ProjectHome.tsx:1472-1484
  - client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx:317
  - client/src/concept2cure/v2/surfaces/filingTarget.tsx:106
  - client/src/concept2cure/v2/__tests__/dispatchReadinessProgramScope.test.tsx
  - tests/lineage/founder-path-lineage.hops-filing.ts:243-249
- **Tests first (red at HEAD):**
  - Probe P6 as a test: after a newer, same-named Submission Center submission, resolveSubmissionSpine(programA) must still return A's anchored submission (red: it flips to 4)
  - DispatchReadiness shows 'no submission for this project' when none is anchored, and never shows a name match
  - The filing-target picker lists only the open project's submissions
  - ProjectHome's Submit tab lists the project's submissions
  - A grep gate: no lower(product_name) or lower(title) match against submissions remains in server/ or client/src
- **Owner and windows:**
  - Cold and unclaimed: submission-spine.ts (352840f1).
  - Closed windows; coordinate on the board:
  - DispatchReadiness.tsx: …01FSu2RL, 02:39Z.
  - SubmissionCenter.tsx: …01FSu2RL, 01:15Z.
  - ProjectHome.tsx: …01FSu2RL, 02:28Z.
  - filingTarget.tsx: …015oLV2v, 02:43Z.
  - Hand off to claimed lanes:
  - ind-checklist-view-assembler.ts belongs to the IND eCTD demo lane …01TtwRHm (claimed, D7).
  - ectd-compile.ts belongs to the D7 lanes (last c70bbaa5, …01E8btkB, 09-24).
  - Working agreement: the deletion commit names the replacement read and the test proving it is reachable
- **Founder decision:** None.

### PF-07: No project, no record: launch entry points refuse, one audited adopt, one source per program (LX-21)

- **Launch row:** D2
- **Relation to the lineage plan:** LX-21 as the critic proposed. Joins LX-02, where source identity becomes per program (VR-10). Precedes LX-03, LX-06 and LX-10
- **Size:** L
- **Closes:**
  - PF-authoring-1
  - PF-ana-6
  - PF-BCQ-8 (the no-program half)
  - PF-dataroom-1
  - PF-dataroom-2
  - dataroom MISSED (the fail-open anchor answers 200 'ready')
  - PF-creation-4
  - critic P3
- **Files:**
  - server/services/authoring/authoring-documents.ts:458-477 (an absent program on a launch create returns 400 PROJECT_REQUIRED)
  - client/src/concept2cure/v2/surfaces/AuthoringCreateExport.tsx:131-141
  - client/src/concept2cure/v2/surfaces/DocumentAuthoring.tsx:50-74
  - server/routes/chat/upload.ts:403-418, :553-560, :599-630 (a scoped source-write failure returns 503, not 200 'ready')
  - client/src/concept2cure/hooks/useChatUpload.ts:170, :197-198
  - server/services/clinical-regulatory-evidence/evidence-spine.service.ts:312-330 (checksum identity scoped to the program)
  - server/routes/c2c/projects.ts (POST /:id/adopt on the existing router: from none to a program, once, audited as c2c.project.adopt, never reversed)
  - server/services/vault/document-catalog.service.ts:590-596
  - migrations/20260529_phase9_backfill.sql, amended in place with a dated header: stop minting NULL-project documents; add CHECK (project_id IS NOT NULL OR created_at < <cutover>) NOT VALID, guarded
  - The headers of migrations/20260726 and 20260727 (lines :28 and :22-24), amended in place to point at the adopt route
- **Tests first (red at HEAD):**
  - Repair tests/authoring-program-scope.pglite.test.ts first. It is red at HEAD, verified 2026-09-26T02:59Z: 500 instead of 201 at :134, because its harness has no regulatory_programs table since LX-20. Then flip it: a launch create with no program returns 400
  - Probe P1 as a test: the same bytes into A, then into B, gives B its own source with client_program_id B, listed in B's /sources (red: inB [])
  - Probe P2: an unscoped upload, then an adopt, gives one audited row and a source with a program
  - When createSource throws, the upload answers 503 (red: 200 'ready')
  - Replay 20260529 with a new fda_510k_projects row: no NULL-project document appears (red per c2cdoc-repro)
- **Owner and windows:**
  - This session: authoring-documents.ts and evidence-spine.service.ts.
  - Cold, no lane row:
  - AuthoringCreateExport.tsx (dc6f7034, 09-03).
  - DocumentAuthoring.tsx (c402dbb6, 09-21).
  - 20260529 (cold).
  - Closed windows or claimed lanes:
  - upload.ts identity block: unclaimed, window closed. Tell …01DiJJAk, who owns the atom block.
  - useChatUpload.ts: in W1 …01T2wooC's row; last c7297cba by …01DiJJAk on 09-24.
  - projects.ts: window closed.
  - document-catalog.service.ts: …01DiJJAk's lane
- **Founder decision:** (1) May any governed record exist without a project? Proposed: a chat attachment with no project open stays a conversation file, not a Data Room source, until it is adopted; an Authoring document always needs a project. (2) The same file in two projects. Proposed: two source rows that share the bytes, not one row listed in two projects. This is also VR-10's decision.

### PF-08: The project-management anchor stops guessing and cannot be deleted from under its program

- **Launch row:** D2 and D5
- **Relation to the lineage plan:** Precedes LX-07 (AnA drafts reach the program through the anchor) and LX-12 (the package spine keys on projects.id)
- **Size:** M
- **Closes:**
  - PF-creation-3
  - PF-creation-7 and project MISSED-3 (a hard delete of the anchor row cascades away governed artifacts)
  - resolveProgramProjectAnchor uses .limit(1) with no ORDER BY (program-project-anchor.ts:262-272)
- **Files:**
  - migrations/20260814_projects_regulatory_program_anchor.sql:143-170, amended in place with a dated header: the backfill is limited to rows created before the file's date, so a replay decides nothing new, and it writes an audit_logs row per link instead of only RAISE NOTICE at :173
  - A guarded unique index on projects(regulatory_program_id), created only when no program has two anchor rows; otherwise a NOTICE names them, because an unguarded unique index would fail every deploy (Rule 1)
  - server/services/c2c/program-project-anchor.ts:252-272
  - server/routes/projects-management.ts:336-393 (refuse deleting an anchor row; role gate; audit against the program)
  - server/routes/device-projects.ts:360-377
- **Tests first (red at HEAD):**
  - anchor-repro as a PGlite test: an org with two unmarked workspaces, intake skips the anchor, and a same-named legacy row exists. After replaying 20260814 that row must stay NULL (red at HEAD: it gains the program's UUID)
  - DELETE /api/projects/:id on an anchor row returns 409, and concept2cure_artifacts rows survive (red: cascade at 0000_sweet_joseph.sql:6488)
  - A second anchor row for the same program is refused
- **Owner and windows:**
  - Cold: 20260814, program-project-anchor.ts (…01GJidg5, 09-23) and projects-management.ts. device-projects.ts's window closed at 02:29Z (…01E8btkB); tell the D2/D6 launch-scope lane
- **Founder decision:** Should a legacy project that shares a new program's name ever be linked automatically? Proposed: never; offer an explicit, audited 'link legacy project' action instead.

### PF-09: One creator of projects: the integer-space creators create through intake or are refused

- **Launch row:** D2
- **Relation to the lineage plan:** Precedes LX-19 (containment). Enforces Zero duplication for project creation
- **Size:** M
- **Closes:**
  - PF-creation-8
  - PF-creation-9
  - PF-ana-17
  - PF-creation-5 (Tasks and CollabLauncher list programs)
- **Files:**
  - server/routes/projects-management.ts:150 and atomicQuotaService.js:110, :177-209
  - server/routes/concept2cure.ts:1005-1030, :2226-2260
  - server/routes/device-projects.ts:124-168
  - server/routes/project-hierarchy.ts:256-278
  - server/services/rules-engine/actions/index.ts:588-604
  - server/services/ana-platform-controller.ts:348-357
  - server/services/ana-ri/command-executor.ts:270-317 (create_project becomes a proposal that opens the Projects wizard)
  - client/src/concept2cure/v2/surfaces/TaskBoard.tsx:290, :1425, :1464, :1613
  - client/src/concept2cure/v2/surfaces/CollabLauncher.tsx:171
- **Tests first (red at HEAD):**
  - Each creator either writes the program and its anchor in one transaction through intake, or refuses. Red at HEAD: projects rows with NULL regulatory_program_id
  - AnA create_project returns a proposal. Red: the ana-create probe hits 42703 on submission_type
  - A wizard-created project appears in the Tasks picker (red when the anchor was skipped)
- **Owner and windows:**
  - This session: command-executor.ts.
  - Cold:
  - concept2cure.ts (…015w92gc, 09-23)
  - projects-management.ts
  - project-hierarchy.ts (…01E2moDu, 09-10)
  - ana-platform-controller.ts (…01GyGhjg, 09-24)
  - Closed windows:
  - TaskBoard.tsx (…01FSu2RL, 02:39Z)
  - CollabLauncher.tsx (…015oLV2v, 01:28Z)
  - Route containment is the D2/D6 lane …01E8btkB (claimed). Its launch-scope-api.ts is open until 2026-09-26T23:56Z; hand off. Working agreement: each removal names POST /api/c2c/projects (Projects.tsx:319) as the reachable replacement
- **Founder decision:** Retire the integer-space creators (proposed), or keep them as subordinate creators that must name a program. The Tasks board's key follows PF-01.

### PF-10: An AnA conversation belongs to one project (LX-24)

- **Launch row:** D2 and D5
- **Relation to the lineage plan:** LX-24. Precedes LX-04 and LX-06: LX-06 records the conversation on the canvas document, which needs a thread with exactly one program
- **Size:** L
- **Closes:**
  - PF-ana-1
  - PF-ana-7 (the program half)
  - PF-ana-11
  - PF-ana-12
  - PF-ana-15
  - PF-vault-1
  - PF-ana-8
  - vault MISSED-2
  - ana MISSED-2 (submission-chat takes a raw threadId)
  - ana MISSED-5 (working memory has no program)
- **Files:**
  - A new additive migration: chat_threads.program_id with a same-org key, backfilled from metadata->>'programId' only where the program is in the same org (migrations/20260728_chat_thread_store.sql:70-79 has an unused integer project_id)
  - server/services/chat-thread-helpers.ts:172-196 (on resume, compare with the open program)
  - server/routes/ana-ri/stream.ts:503-504, :740-748, :1736-1748 (the tool context carries threadId, turnId and model; projectId comes from the anchor, not Number(uuid))
  - client/src/concept2cure/components/ana/useAnaChat.ts:444-450
  - client/src/concept2cure/v2/V2App.tsx:593-595 (reset the rail when the project changes)
  - server/services/ana/document-catalog-tools.ts:130-133, :563-567 (default to ctx.projectRef; refuse a program_id other than the open project's)
  - server/routes/ana-features.ts:2070-2074, :4922, :4977
  - server/routes/cortex-unified.ts:1332-1344
  - server/routes/chat/send-message.ts:126-131, :163-170
  - server/routes/ana-ri/post-processing.ts:486
- **Tests first (red at HEAD):**
  - Extend server/services/__tests__/chat-thread-program-key.test.ts:52-60, which keeps 'does not re-home': a turn in thread T(A) with project B open is refused or forked. Red at HEAD
  - A client test: a shell project change resets the rail thread
  - draft_authoring_document records provenance.conversationId (red: it is never set)
  - file_chat_upload_to_vault with projectRef A and program_id B is refused (red: vault-anchor probe case 3)
  - submission-chat with a foreign threadId is refused
- **Owner and windows:**
  - Still open, so hand off: stream.ts is in …0194UQPx's window (94036a27) until 2026-09-27T02:26Z.
  - Cold: chat-thread-helpers.ts (…01KiDof7) and cortex-unified.ts.
  - Claimed lanes:
  - useAnaChat.ts: W1 …01T2wooC.
  - document-catalog-tools.ts: …01DiJJAk.
  - Closed windows:
  - V2App.tsx (…01FSu2RL, 09-24)
  - send-message.ts and ana-features.ts (…01W5zW66, 01:00Z)
- **Founder decision:** When the user switches project mid-conversation: refuse the turn, or fork the thread into the new project. Proposed: fork, with a visible 'new conversation in <project>' marker.

### PF-11: Placement, citation, pin and binding stay inside one project (LX-23)

- **Launch row:** D2 (for D7)
- **Relation to the lineage plan:** LX-23. Make it the same upsertLeaf edit as LX-11, so submission-service.ts is edited once. Amends LX-04 so that its isolation test covers pins
- **Size:** L
- **Closes:**
  - PF-vault-5
  - PF-SUB-5
  - PF-SUB-6 (the program half)
  - PF-authoring-3
  - PF-authoring-4
  - PF-authoring-7
  - PF-BCQ-11 (latent)
  - producers MISSED-4 (a protocol can bind another project's design)
  - critic P4
- **Files:**
  - server/services/submission-service/submission-service.ts:1560-1748 (verifyLeafSource returns the document's program) and :1842-2072 (upsertLeaf compares it with sequence → submission.program_id; 409 CROSS_PROJECT; the audit names the document and the program)
  - server/services/coauthor/coauthor-snapshot.ts:423-508
  - server/services/clinical-regulatory-evidence/source-usage.service.ts:172-227, :421-425
  - server/routes/ana-ri/stream.ts:885-893 and evidence-spine.service.ts:274-289 (pins resolve inside the open program)
  - server/routes/authoring.router.ts:2254-2296
  - server/services/protocol-development/protocol-development-service.ts:166-180
  - server/services/cmc/place-module3-into-submission.ts:295-321
  - client/src/concept2cure/v2/surfaces/filingTarget.tsx:106
- **Tests first (red at HEAD):**
  - Probe P4 as a test: a Vault document of program ZX-9 placed into C2C-101's sequence returns 409 (red: 200 with the pin taken)
  - citation-anchor probe: a project-A section citing a project-B source returns 409 (red: 201). listChangedSourceUsages(A) lists A's document (red: [])
  - A comment whose doc_id is another document returns 400 (red: 201)
  - Re-pointing a leaf to another program's document returns 409, and the audit names the old and new document
- **Owner and windows:**
  - submission-service.ts: window closed (…015oLV2v, 02:43Z; no lane row). This is where LX-11 lands, so coordinate.
  - Cold: coauthor-snapshot.ts (…01PwLFr8), source-usage.service.ts (unclaimed), protocol-development-service.ts (…01P6GWSv).
  - This session: authoring.router.ts (eb1073a6).
  - Still open, so hand off: stream.ts, in …0194UQPx's window until 2026-09-27T02:26Z
- **Founder decision:** Is a cross-project reference ever legitimate, for example one Investigator's Brochure cited by two INDs? If yes, it becomes a recorded cross-program reference that names both programs and a reason. Proposed: refuse by default.

### PF-12: A transmittal names its sequence and its project, and the server derives both

- **Launch row:** D7
- **Relation to the lineage plan:** Joins LX-12, as amended by critic E3: the transmitted manifest is recorded on the transmittal row, with sequence_id and program_id, not in ectd_compilations. It depends on PF-05 and on the founder's LX-13 spine decision
- **Size:** M
- **Closes:**
  - PF-SUB-7
  - PF-SUB-8 (with PF-02)
  - PF-SUB-9 (the package half)
  - submission missed (program and package never reconciled; three more gateway INSERTs; no FK on install-fresh)
  - PF-SUB-13 (applier)
- **Files:**
  - A new additive migration on the set: submission_transmittals.sequence_id plus the same-org program key (20260509 is not in C2C_MIGRATION_FILES)
  - shared/schema.ts:19319-19326
  - server/services/submission-service/submission-service.ts:1389-1397 (programId from submission.program_id; sequence_id)
  - server/services/submission-gateways/governed-transmit.ts:228-234, :308, :602 (the program comes from the package's anchored program; a body value that differs is refused)
  - server/routes/mdx-submission-gateway.ts:164, :232
  - server/services/submission-gateways/fda-esg.ts:264-281, rest-gateway-helpers.ts:92-100, ema-cesp.ts:214-221, pmda-gateway.ts:157-164, health-canada-gateway.ts:162-169
  - client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx:251-282
- **Tests first (red at HEAD):**
  - LX-00 transmit/transmittal-names-sequence goes green (baselined red: {sequenceIdColumn:false, programId:null})
  - Probe P5 as a test: a transmittal naming org B's program is refused (red)
  - A body programId X with a package of project Y is refused
  - An install-fresh (drizzle push) database has the key (red today)
- **Owner and windows:**
  - The package-spine lane …01LjrcEe (claimed, D7) owns governed-transmit's filed-sequence record.
  - Closed windows: submission-service.ts (…015oLV2v) and GatewayTransmittals.tsx (…01FSu2RL, 02:39Z).
  - Cold: the gateway files (…015weqdG, 09-23) and mdx-submission-gateway.ts
- **Founder decision:** The one transmit spine, sequence or package, is LX-13's decision. It must be taken before this fix and before LX-12.

### PF-13: A project that holds sealed, filed or transmitted records cannot be deleted, and the chain reads through archive (LX-25)

- **Launch row:** D5
- **Relation to the lineage plan:** LX-25. Precedes LX-14
- **Size:** S
- **Closes:**
  - critic H4 (the soft-delete has only a 'not already deleted' precondition)
  - The Vault leaves of a deleted project stop resolving
- **Files:**
  - server/routes/c2c/projects.ts:1703-1710 (precondition at :1706)
  - server/services/submission-service/submission-service.ts:1692-1716
  - vault.legal_holds (migrations/20260906b_vault_legal_holds.sql:94, :107)
- **Tests first (red at HEAD):**
  - Deleting a program with a transmitted sequence returns 409 and names the records (red: 200, after which the leaf no longer resolves)
  - Archiving keeps the LX-00 walk green
- **Owner and windows:**
  - projects.ts: window closed (…01FSu2RL, 01:31Z). Unclaimed; …01KnUGoX can propose it on the board
- **Founder decision:** Retention: may a project that holds only drafts be deleted (proposed: yes, audited)? May a filed project ever be deleted (proposed: only after its retention period expires)?

### PF-14: Study designs and statistical outputs carry the program

- **Launch row:** D4 (for D2)
- **Relation to the lineage plan:** Precedes LX-15, which per critic E1 must refuse a design with no program. LX-16 is already closed
- **Size:** M
- **Closes:**
  - PF-BCQ-1
  - PF-BCQ-2
  - PF-BCQ-3
  - PF-BCQ-4 (with PF-04)
  - PF-BCQ-6
  - PF-BCQ-16
  - producers MISSED-5 (generate_sap reports success for a SAP that was never stored)
- **Files:**
  - server/services/study-design/study-design-repository.ts:162-166, :236-243 (tenant predicate on conflict; program_id changes only from none to a program)
  - server/routes/study-design.ts:480-506 (programInOrganization; the governed-action payload names the program)
  - server/services/biostatistics-bridge/bridge-service.ts:145-163, :394-411
  - server/services/ana-ri/command-executor.ts:3083-3104
  - server/services/study-design/__tests__/persistence.test.ts:111-120
- **Tests first (red at HEAD):**
  - Flip persistence.test.ts:111-120, which pins NULL acceptance: persisting with no program returns 400, and a foreign program returns 404
  - The prm-conflict probe: re-persisting without a program keeps program_id (red: it went to null)
  - A cross-tenant study_id conflict is refused, not overwritten
  - generate_sap with a failed insert reports failure
- **Owner and windows:**
  - This session: bridge-service.ts (5882a1b6) and command-executor.ts, the BS/LX-16 lane.
  - Cold: study-design.ts (…01U2hGiy, 09-22) and study-design-repository.ts (352840f1)
- **Founder decision:** Whether protocol_documents, which today have only organization_id, become keyed to a program.

### PF-15: CMC Module 3 and device filings key on the program (the LX-17 amendment and LX-26)

- **Launch row:** D7 (for D2)
- **Relation to the lineage plan:** Amends LX-17 (cmc_projects.regulatory_program_id; refuse a placement whose program differs from the submission's). Proposes LX-26, the device filing path
- **Size:** L
- **Closes:**
  - PF-BCQ-9
  - PF-BCQ-10
  - PF-BCQ-12 and PF-BCQ-13 (latent)
  - producers MISSED-1 (POST /api/cmc-changes is served in production and writes unchecked keys)
  - producers MISSED-2 (the interview commit)
  - submission missed (estar_submissions and the eSTAR export)
  - PF-SUB-11 (the device half)
  - critic H2 and E4
- **Files:**
  - server/routes/cmc-changes.routes.ts:80-138 and server/services/cmc-write-through.ts:1454-1490
  - server/services/cmc/interview-commit.ts:557-558, :704-731
  - server/services/ana-ri/module3-command-handlers.ts:35-62, :128-148
  - db/migrations/20260730_cmc_projects_reconstruction.sql (program link through an additive file on the set)
  - migrations/20260730_estar_submission_project_link.sql:15-16 (a program column through an additive file)
  - server/routes/510k-estar-routes.ts:223-230, :654-657, :1211-1214, :1907-1975
  - server/services/pathway-engines/estar/estar-submission-service.ts:85-111
  - client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx:1130-1132
- **Tests first (red at HEAD):**
  - POST /api/cmc-changes with a foreign cmcProjectId returns 404 and writes no cmc_source_objects row (red)
  - An interview session started with a foreign projectRef is refused
  - An estar submission naming another org's project returns 404
  - A device filing shows its project in Submission Center (red: 'programme not resolved')
- **Owner and windows:**
  - Cold, no lane row: the CMC files (…01GJidg5) and module3-command-handlers.ts (…01E2moDu). estar-submission-service.ts is cold (…01P6GWSv).
  - Still open, so hand off: 510k-estar-routes.ts, in …0194UQPx's window until 2026-09-26T23:00Z
- **Founder decision:** LX-26: the device filing path (package type per application, gateway per region), and whether device, CER and MDR programs get a submissions row at intake.

### PF-16: QMS controlled documents: organization scope or project, decided and enforced

- **Launch row:** D2 and D5
- **Relation to the lineage plan:** Precedes LX-18
- **Size:** S
- **Closes:**
  - PF-BCQ-14
  - PF-ana-14
  - producers MISSED-3 (qms_change_controls)
  - critic P5
- **Files:**
  - migrations/20260511_qms_and_labeling.sql:23-43 (install-fresh only; any column goes in an additive file on the set)
  - server/routes/mdx-qms.ts:164, :356-375 (org check on artifact_id)
  - server/services/qms/qms.service.ts:31-41
  - server/services/ana/AnaToolExecutor.ts:13544-13575
  - server/routes/quality-management-api.ts:629-690
- **Tests first (red at HEAD):**
  - qms_documents.artifact_id pointing at another org's artifact is refused (red: accepted)
  - If a product-specific type is chosen: creating a spec or protocol without a program returns 400
- **Owner and windows:**
  - mdx-qms.ts: window closed (…01Wcyqbq, 02:47Z). Hand to that lane, which is claimed for QMS approval. AnaToolExecutor.ts: window closed
- **Founder decision:** Are SOPs, work instructions, forms and QMPs organization-level records, exempt from the principle and listed by name (proposed)? Do product-specific types (spec, protocol, product change controls) carry a program? Or should there be an organization 'quality' project instead?

### PF-17: From the project, every anchored record is listed

- **Launch row:** D2
- **Relation to the lineage plan:** Joins LX-14, the one lineage view, and LX-04, which makes the program tag or key searchable
- **Size:** M
- **Closes:**
  - PF-creation-13
  - PF-ana-2
  - PF-ana-9
  - PF-BCQ-15
  - PF-SUB-11 (the remainder)
  - PF-dataroom-5
  - PF-dataroom-7 (with LX-04)
  - PF-vault-4 (with LX-03 and LX-10)
- **Files:**
  - server/routes/c2c/projects.ts:1281-1310 (activity feed)
  - server/routes/c2c/actions.ts:373-397 (governed actions write new_values.project_id)
  - client/src/concept2cure/v2/surfaces/ProjectHome.tsx
  - client/src/concept2cure/v2/surfaces/ConversationThread.tsx:436-446
  - server/routes/c2c/artifacts.ts:2514-2546, :2638-2641 (authorize the artifact's own project)
  - server/routes/c2c/project-access.ts:96-107
- **Tests first (red at HEAD):**
  - The project activity feed shows the scaffold's governed-action row (red)
  - ArtifactCard 'Route to review' with a program UUID returns 200 (red: 404)
  - A status PUT through another project's URL returns 404 (red: it authorizes on the URL's project)
- **Owner and windows:**
  - Closed windows:
  - projects.ts (…01FSu2RL)
  - ProjectHome.tsx (…01FSu2RL, 02:28Z)
  - ConversationThread.tsx (…015oLV2v, 01:28Z)
  - artifacts.ts (…01FSu2RL, 02:13Z)
  - Still open, so hand off: actions.ts, in …0194UQPx's window until 2026-09-26T23:00Z
- **Founder decision:** None.

## 5. Amendments to the lineage plan

Rechecked at HEAD b8cd6c2c, 2026-09-26T02:55Z. The critic read HEAD 5882a1b6; the plan itself was traced at 3b93629d.

1. NUMBERING. Two of the critic's proposed numbers have since been used by commits, and only in part. The rest map to the PF list, which carries the project-first work; LX numbers stay for lineage.
- LX-20 landed only for POST /api/authoring/docs and the canvas tool (8eaccfa6, bfbf0ee8). Its own README lists about a dozen hand-written copies still to move; PF-02 and PF-03 complete them.
- LX-22 part 1 landed as 041976f2: the column, the same-org key and the one-to-one backfill. Part 2 is PF-05 and PF-06. Every window it waited on has now closed (projects.ts 01:31Z, SubmissionCenter.tsx 01:15Z, submission-service.ts 02:43Z, routes/submissions.ts 02:54Z), so it is unblocked.
- LX-21 → PF-07. LX-23 → PF-11. LX-24 → PF-10. LX-25 → PF-13. LX-26 → PF-15.

2. ADOPT THE CRITIC'S AMENDMENTS.
- E1: LX-03 and LX-15 must add their source types to SOURCE_TYPES and widen listClientDocuments. Its source_type='client_document' filter is at evidence-spine.service.ts:228.
- E2: LX-19 needs a launch-scope check for each tool and command. 94036a27 made execute_platform_command writes propose-only. But approve_import, save_document_to_vault, create_qms_document, create_labeling_document, create_per_document and edit_spreadsheet are plain tools outside that gate. The /api/ana-ri platform prefix is now at launch-scope-api.ts:58.
- E3: LX-12 records the transmitted manifest on the transmittal row, with sequence_id and program_id (PF-12), not in ectd_compilations.
- E4: LX-17 needs cmc_projects.regulatory_program_id (PF-15).
- D1: the founder's choice of spine (LX-13) must come before LX-12 and PF-12.
- D3: LX-15's listing test stays red until listClientDocuments changes.

3. CORRECTIONS TO THE CRITIC.
- S1 holds and goes further. LX-16's closes list should read BS8 64a1d5c7, BS-M1 5882a1b6, BS4 14607f90, 456083d9 and 8cc98672. The plan summary's 'two engine defects write wrong power figures' is stale.
- S2 holds: /api/cmc is refused 403 (5b109b51). Two production paths still write CMC keys: POST /api/cmc-changes, which is unmapped and so served (producers MISSED-1), and the AnA interview commit (producers MISSED-2). LX-17 must name both.
- The critic's 'signup creates no workspace' (P1) is superseded. Since 20260923, signup, setup and the boot seed create a marked default workspace, so anchor skips are narrow (PF-creation-3 correction). The anchor's name-match backfill still needs PF-08.

4. LX-00 NEEDS PROJECT HOPS (PF-00).
- None of the walk's 18 baselined entries is a project hop.
- Its sequence-to-project check reads c2c.project.create JSON (tests/lineage/founder-path-lineage.hops-filing.ts:243-249). It passed in my run at 02:59Z, but its world creates one program per product, so it cannot see two programs sharing one submission (project-intake.ts:124-137).
- After PF-05 it must read submissions.program_id. It also needs a two-program world, cross-organization negatives and no-project negatives.

5. A RED TEST LEFT BY LX-20.
- tests/authoring-program-scope.pglite.test.ts fails at HEAD: 500 at :134, verified by running it.
- Its harness has no regulatory_programs table, so programInOrganization throws.
- LX-20's '30 dependent suites green' did not include it. Repair it within LX-20's own lane before PF-07 relies on it.

6. ORDER. The project anchor is the first hop of every chain.
- Start with PF-00, then PF-01 (founder), then PF-02 and PF-03, then PF-04.
- Then PF-05 and PF-06, which precede LX-11, LX-12 and LX-13.
- PF-07 goes with LX-02 (VR-10) and before LX-03 and LX-10.
- PF-10 comes before LX-04 and LX-06.
- PF-11 is the same upsertLeaf edit as LX-11.
- PF-12 goes with LX-12, after the spine decision.
- PF-13 comes before LX-14, and PF-17 goes with LX-14.
- PF-08 comes before LX-07 and LX-12. PF-09 comes before LX-19.
- PF-14 comes before LX-15, PF-15 before LX-17, PF-16 before LX-18.
- LX-07's 'save to the Vault means the Vault' must key on the program, not the integer ctx.projectId (AnaToolExecutor.ts:19627-19636); that is PF-03 and PF-10.
- LX-02's source identity per program is a founder decision shared with VR-10 (PF-07).

7. WINDOWS, re-measured at 02:55Z. Most windows the audit cited have closed. These are still open:
- stream.ts, ana-ri/utility.ts, command-rbac.ts and governed-tool-gate.ts: …0194UQPx, until 2026-09-27T02:26Z.
- c2c/actions.ts, signature-persistence.ts and 510k-estar-routes.ts: …0194UQPx, until 2026-09-26T23:00Z.
- knowledge-sources.ts, ind-forms.routes.ts and client-intelligence.ts: …0194UQPx, until about 23:41–23:58Z.
- authoring-from-draft.ts: …01FSu2RL, until 03:06Z.
- authoring-file-to-vault.ts: …01FSu2RL, until 07:35Z.
- launch-scope-api.ts: …01E8btkB, until 23:56Z.
- moduleEntitlementGate.ts: …01E8btkB, until 07:00Z.
- orchestrator.ts and persona.ts: …01471vSK, until 05:59Z.
- migration-set.mjs: shared with …01J935DZ until 23:53Z; insert only.

8. LINE REFERENCES. The plan's references in LX-02, LX-11, LX-12, LX-13 and LX-18 must be re-read at HEAD before any edit. Examples: stream.ts tool context is now :1740-1741, the recordGovernedAction insert is actions.ts:375-397, and the ind-forms call site is :1153.

## 6. Status

- **LX-22 part 1** landed as `041976f2`: `submissions.program_id`, the same-organization key (`ON DELETE SET NULL (program_id)`, so a tenant purge is not blocked) and the one-to-one backfill.
- **The LX-20 red test (§5 item 5)** is fixed in `c0a95ede`, with a second suite the same sweep found.
- **PF-05 and PF-06 (LX-22 part 2)** are next, in this session.