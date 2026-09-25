# End-to-end lineage plan — project → Data Room → AnA → canvas → editor → Vault → Submission Center → agency

**Date:** 2026-09-25 · **Status:** plan, verified findings · **Rows:** D2, D4, D5, D7 (each fix names its own)
**Source:** workflow `wf_dbeffd2b-a8b`. A model of the canonical stores, one tracer per pipeline, adversarial verification of every claimed break, and a synthesis.
The completeness critic did not run in that workflow. It runs with the project-anchoring audit (`wf_9dedbf38-bee`), and its amendments land in §0 and §4.

## 0. The principle: every chain starts at a project

A client's work begins with a project. Every governed record the work produces must be reachable from that one project of the client's organization, by recorded keys and never by inference. That covers:

- the Data Room source;
- the Vault document and each of its versions;
- the AnA draft;
- the canvas and editor document, its revisions, citations and spans;
- the seal and signature;
- the filing copy, submission, sequence, leaf and transmittal;
- a Biostatistics computation and a CMC Module 3 section.

A record created without a project is refused on every reachable path. A record can never be attached to another organization's project. The lineage walk in §2 starts at the project, and so does its test (LX-00).
The project-anchoring audit fills this section with the exact key, the stores that carry it, and the PF fixes. They come before the LX fixes they anchor.

## 1. Where lineage stands today

No. At HEAD 3b93629d, lineage does not hold end to end on any of the three paths you named, and it breaks within the first few hops. Capture is the one sound identity: a Data Room upload gets a sha256 source record. But its bytes are written best-effort to one server's local disk (server/routes/chat/upload.ts:166-184), and a Vault upload never gets that identity at all. The first complete loss on your path is AnA itself. The product stream cannot search the Data Room on any turn, pinned sources reach the model only as file names, and the canvas tool that creates the document takes no sources and records no model. So every canvas → editor → vault document starts with zero Data Room lineage and says 'model not recorded' (authoring-draft-tool.ts:133-136). Where AnA drafting tools do cite sources, the 'verified quote' is checked against text the model typed, so a sentence the source never contained can be recorded as a quote of it. That is fabrication, the worst class. From the editor onward four records are real: the per-revision hash chain, the seal hash, the Vault content hash and the leaf's source pin. But the sentence-level lineage is overwritten in place, is not bound to the sealed or filed version, and does not travel to the filing copy or the Vault PDF. The filing end is not reachable from the product: Submission Center can freeze and dispatch but has no transmit, the only transmit button in the UI ships a different store, and the API-only sequence transmit deletes the bytes it sent. Biostatistics never publishes to the Data Room. Its numbers enter documents as the clicking user's assertion or as 'AI generated', and two engine defects write wrong power figures into the study design. CMC files the live Module 3 text, not the approved version, with no link back to its signature or register sources. CI stays green through all of this because the three lineage gates check wiring and file-level patterns, not recorded lineage. The plan has 20 fixes (LX-00 to LX-19). It starts with a failing end-to-end walk test, then closes your path hop by hop, and only then turns to Biostatistics, CMC and the other apps. Each fix extends an existing store (cre_evidence_sources, document_span_lineage, doc_revisions, audit_logs, submission_leaves) rather than adding one. One earlier finding is already closed at HEAD: the span-lineage CHECK replay that would have broken every deploy was amended in place on 2026-09-25 (docs/work-orders/README.md:78).

## 2. Hop by hop (verified)

### A. Founder path: Data Room → AnA → canvas → editor → save → seal → Vault → Submission Center → transmit

| Hop | Verdict | Carries | Evidence |
|---|---|---|---|
| A1 Capture: Data Room drop / AnA paperclip → POST /api/chat/upload → file_uploads + cre_evidence_sources | **partial** | cre_evidence_sources {checksum = sha256(raw bytes), supersede chain, provenance, client_program_id}. The bytes are written best-effort to the serving task's local disk; a failed write is non-fatal, yet the row still says ingestion_status 'ingested'. Five writes, no transaction. Dedupe on checksum spans the whole org, so a second program never gets the source. The client drops the sourceId. | server/routes/chat/upload.ts:166-184 (fs.writeFile, 'non-fatal'), :425-620 (:434 findSourceByChecksum, :561 'ingested', :591 createSupersedingSource, :600-620 failure only logged); server/services/clinical-regulatory-evidence/evidence-spine.service.ts:76-102,:312-330; client/src/concept2cure/hooks/useChatUpload.ts:185; reachable from ProjectHome.tsx (drop zone) and ConversationThread.tsx:761 |

### A. Founder path

| Hop | Verdict | Carries | Evidence |
|---|---|---|---|
| A2 Vault upload → vault.documents (a second source registry) | **drops** | content_hash and a storage pointer. No cre_evidence_sources row and no key link. A Vault-only file can be cited only when some Data Room source happens to have an equal checksum (a client-side join); otherwise it can only be 'referred to'. | server/services/vault/vault-ingest.service.ts:452-583; server/services/ana/document-catalog-tools.ts:575-592; client/src/concept2cure/v2/editor/ProjectFilesPanel.tsx:142-147 |
| A3 Extraction → lumen_data_atoms (retrieval index) | **partial** | One atom per upload, at most 16,000 characters, with no hash of the extracted text and no extractor version. It resolves to a source id at read time. A superseded revision's atom stays searchable. | server/services/chat-uploads/upload-retrieval-atom.ts:94-109,:145-167; db/migrations/_consolidated/20250918_lumen_cortex.sql:26-40; server/services/clinical-regulatory-evidence/retrieval-source-link.ts:60-139 |
| A4 AnA searches the Data Room in the product stream (project_knowledge_search, search_document_passages) | **absent** | Nothing. The stream's tool ctx has no organizationUuid, so both tools refuse on every turn. projectId is null for a UUID program. Even with a uuid, the project filter excludes every 'chat_upload' atom. | server/routes/ana-ri/stream.ts:1732-1744 (ctx; no organizationUuid anywhere in the file); server/services/ana/AnaToolExecutor.ts:489-493,:15161-15169; server/services/enhancedEmbeddingService.ts:550-553; client/src/concept2cure/components/ana/useAnaChat.ts:769 (the only client chat endpoint) |
| A5 Pinned Data Room sources → AnA turn | **drops** | Source ids are mapped to file_upload ids, and the model sees '[ID: file_…]' and names. Nothing durable records which revision or checksum grounded the turn. context_used is SSE-only, and chat_messages.model is NULL. | server/routes/ana-ri/stream.ts:885-944,:1003-1012; server/services/clinical-regulatory-evidence/evidence-spine.service.ts:274-298; server/routes/ana-ri/post-processing.ts:388-414 |
| A6 AnA drafting tools with sources[] (protocol, consent, Q-Sub, kit, DMS, biosketch) → document_span_lineage | **fabricates** | A 'quoted' cre_evidence_source span carrying the real source's checksum, verified only against the excerpt the model typed. read_vault_document even tells the model to pass its own quoted passage. source_locator is NULL. | server/services/ana/drafting-source-lineage.ts:76-103; server/services/clinical-regulatory-evidence/lineage-gate.ts:266,:288-299; server/services/clinical-regulatory-evidence/span-lineage.service.ts:269-281; server/services/ana/AnaToolExecutor.ts:19406 |
| A7 Document creation engine: draft_authoring_document → createDocumentFromDraft / insertDocumentTx | **drops** | One transaction writes authoring_documents.provenance = {source:'ana'}, the sections, machine_draft spans (machine_author_id 'ana'), a genesis doc_revisions row and an audit row. It records no model, conversation or turn: the tool reads ctx.model/threadId/turnId, and no dispatch sets them. The tool has no sources input, so zero Data Room spans are written. The one test pins the drop. | server/services/authoring/authoring-draft-tool.ts:133-136; server/services/ana/AnaToolExecutor.ts:228-236; server/services/ana/document-surface-tool-defs.ts:140-166; server/services/authoring/authoring-documents.ts:355-372; server/services/authoring/authoring-from-draft.ts:239-242; server/services/ana/__tests__/draft-authoring-document-tool.pglite.integration.test.ts:115 |
| A8 Canvas in the thread → full editor (DocumentCanvas → DocumentWorkbench) | **preserves** | The same authoring document id, in one store; nothing is written. The canvas honestly prints 'model not recorded'. | client/src/concept2cure/v2/surfaces/ConversationThread.tsx:23,:78-130,:217; client/src/concept2cure/v2/editor/DocumentCanvas.tsx:19-29,:232,:243-256; scripts/ci/check-canvas-path.mjs (wiring only) |
| A9 Save a section (PATCH /api/authoring/sections/:id) | **partial** | One transaction writes a doc_revisions row (content_sha256, hash chain, inputs = current citations + machine contributors), enforceAuthorLineage, commitSectionToFiling and an audit row. But span rows are UPDATEd in place with no version key. A verified quote retires once an edit shifts its offsets and becomes the saver's author_assertion. Citations are re-resolved or hard-deleted on the pool outside the transaction. The c2c_document_sections copy gets no spans, and stale mdx-era spans stay live over different words. | server/routes/authoring.router.ts:1860-1986 (:1870 createRevision, :1889 enforceAuthorLineage, :1904 commitSectionToFiling); server/services/clinical-regulatory-evidence/span-lineage.service.ts:283-320 (in-place UPDATE), :813-856 (retire by offset); server/services/clinical-regulatory-evidence/source-usage.service.ts:172-258; server/services/c2c/commit-section-to-filing.ts:241-252; server/services/authoring/authoring-evidence.ts:278-322 |
| A10 Regenerate in the editor (ai/draft → ai/draft/accept) | **partial** | Quotes are verified against chunks parked on the server, the one honest grounding path. But the doc_revisions row and the only surviving record of the model (audit {generator}) are written after COMMIT, on the pool, with a warn-only catch. Retrieval is org-wide rather than program-scoped. | server/routes/authoring.router.ts:3170-3370 (:3255 enforceSourceAndAuthorLineage, :3312 COMMIT, :3338 createRevision, :3342-3370 audit with generator); server/services/clinical-regulatory-evidence/draft-candidate-store.ts:13-27 |
| A11 Freeze / e-sign (seal) | **partial** | frozen_documents {frozen_content, content_hash, frozen_by, version} and authoring_signatures.content_hash, both over text only. Revision heads and span lineage are not bound. AI text no person accepted can be sealed. 'Re-read all' rewrites the cite-time checksums of a sealed document without an audit row. | server/routes/authoring.router.ts:3700-3860 (:3843 INSERT frozen_documents), :4623-4657 (refresh-all, no status check); server/services/clinical-regulatory-evidence/machine-attribution.ts:175-248 |
| A12 File to Vault (POST /api/authoring/docs/:docId/file-to-vault) | **partial** | Rendered bytes are content-addressed in vault.documents, plus a chained audit row {vaultDocumentId, artifactSha256} and export_history.doc_sha256. The version identity is only the string document_code 'authoring-<docId>': no seal, revision or lineage, no alias, no supersedes link, no source identity. doc_sha256 comes from a second read rather than the rendered rows. | server/routes/authoring.router.ts:5145; server/services/authoring/authoring-file-to-vault.ts:112-121,:222-264 (:236 second read),:284-299,:351-366; server/services/c2c/document-alias-map.ts:36-43 |
| A13 Place into filing: AuthoringPlaceIntoFiling → coauthor_documents snapshot → submission_leaves | **partial** | An alias from the authoring document plus the seal hash in metadata; the leaf pins sha256 of the snapshot text. But there is one copy per source, overwritten on re-take. The first take is unaudited. LEAF_CREATED/LEAF_UPDATED carry sectionCode, lifecycleOp and reason, and not the document pointer or the pin. | server/services/coauthor/coauthor-snapshot.ts:384-395,:454-478,:499-514; server/services/submission-service/submission-service.ts:1554-1562,:2021-2032,:2060-2071 |
| A14 Place a Vault file as a leaf (VaultPlaceIntoSubmission) | **partial** | The pin is the exact Vault bytes. There is no approval check, so a 'WORKING DRAFT' PDF can be placed, frozen and dispatched. | server/services/submission-service/submission-service.ts:1682-1709; server/services/ectd/leaf-source-resolver.ts:551-657 (noteUnfinalized is called only at :452, :468, :753) |
| A15 Freeze / dispatch the sequence | **preserves** | electronic_signatures.bound_payload_digest over the ordered leaves, including document_content_sha256, re-derived under the row lock. Gate 2 compares each pin with its store. | server/services/part11/signature-persistence.ts:390-480; server/services/submission-service/submission-service.ts:874-1007; client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx:1141-1290 |
| A16 Assemble the eCTD package | **drops** | Live sources are re-read after the pin check, and the pin is not passed. PDF/A conversion is non-deterministic. No per-leaf shipped hash is persisted. The governance manifest, the only leaf → authoring link, is written to a temp directory and deleted. | server/services/ectd/leaf-source-resolver.ts:91-106,:251-270,:413-455; server/services/ectd/assemble-from-core.ts:234-238,:312-359,:381-392; server/services/submission-gateways/regional-packager.ts:238-247 |
| A17 Transmit to FDA ESG / EMA CESP (sequence spine) | **unreachable** | No UI control, and the AnA tool refuses. If the API is called directly, the zip is re-assembled from live sources, sent, then deleted in the finally block; submission_transmittals.bundle_path names a deleted file. The transmit signature binds the leaf manifest, not the bundle. | server/routes/submissions.ts:1707 (no client/src caller); client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx (freeze and dispatch only); server/services/ana/AnaToolExecutor.ts:8606-8656; server/services/submission-service/submission-service.ts:1217-1473 (:1415-1419 cleanup) |
| A18 The only UI transmit: Gateway transmittals (package spine) | **partial** | The bundle sha256 and per-leaf md5 are kept, but the leaf's artifact version is not. The spine reads only concept2cure_artifacts, which the canvas path never writes by design, so a canvas/editor/Vault document cannot reach it. | client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx:282,:460; server/routes/submission-ops.ts:2276-2307,:2779-2849; server/routes/ana-ri/post-processing.ts:147; server/services/submission-gateways/governed-transmit.ts:13-17 |
| A19 What the next sequence treats as 'on file' | **fabricates** | ectd_compilations.leaf_manifest, written only by eCTD Compile, is treated as filed once dispatch_status is sent. A compile run after transmit replaces it. | server/services/ectd/prior-sequence-loader.ts:139-207; server/routes/ectd-compile.ts:976-1028,:1126-1148 |
| A20 Walk back and forward, and what the user sees | **absent** | Nothing reads submission_leaves by document. The source-changes report can never fire, because it compares checksums and a checksum is never rewritten. Data Origins marks a superseded source 'current'. 'Used in' ignores spans. Source Tracer serves sections only. | server/services/clinical-regulatory-evidence/source-usage.service.ts:362-400,:440-452; server/services/clinical-regulatory-evidence/span-lineage.service.ts:1049 (listSpansCitingSource, no caller), :1150-1172; server/routes/source-tracer-routes.ts:66; client/src/concept2cure/v2/surfaces/ProjectHome.tsx:350,:578 |
| A21 Deploy replay of the span-lineage kinds (Rule 1) | **preserves** | Closed at HEAD. 20260907's DROP/ADD is now guarded on pg_get_constraintdef, so a machine_draft row no longer breaks the next deploy. | migrations/20260907_span_lineage_accepted_machine_draft.sql:85,:98; docs/work-orders/README.md:78 |

### B. Biostatistics → Data Room → Protocol Designer / Study Design / IND

| Hop | Verdict | Carries | Evidence |
|---|---|---|---|
| B1 Biostatistics surface computes in the browser | **fabricates** | Nothing is persisted. A second, in-browser engine whose judgment is not a port of the server's is labelled 'Deterministic engine — v1.0.0'. It matches the server's N on 4/4 presets and differs in verdict or fragility on 4/4. | client/src/concept2cure/v2/surfaces/Biostatistics.tsx:28-31,:198-201,:611-617,:636-647,:968; server/services/ana-biostats/document-generator.ts:31; client/src/concept2cure/v2/registryModel.ts:659 (surface not in launch scope) |

### B. Biostatistics

| Hop | Verdict | Carries | Evidence |
|---|---|---|---|
| B2 Surface / Workbench → authoring ('Open in editor', 'Insert into document') | **fabricates** | Every clause, numbers included, becomes the clicking user's author_assertion. The engine stamp is editable text, and the inputs behind the stamped inputsSha256 are stored nowhere. | client/src/concept2cure/v2/authoringHandoff.ts:73-127; server/services/authoring/authoring-documents.ts:587-614; client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:240-259; client/src/concept2cure/v2/engineResultHtml.ts:38-66 |
| B3 Workbench → server stats engine | **partial** | StatsProvenance {engine, engineVersion (a literal), method, seed, inputsSha256} is returned in the HTTP response and persisted nowhere. | server/routes/biostat-design-stats.ts:1-10,:122-853; server/services/stats/computation-provenance.ts:14-55 |
| B4 Biostatistics → Data Room (cre_evidence_sources) / Vault | **absent** | Nothing. No biostatistics, bridge or study-design code calls createSource or ingestVaultDocument, so a computation has no identity a sentence can cite. | grep 'createSource(' in server/ → evidence-spine.service.ts, crl-ingestion.service.ts, csr-adapter.service.ts, routes/chat/upload.ts only; client/src/concept2cure/v2/surfaces/ProjectHome.tsx (Data Room = cre_evidence_sources) |
| B5 Design bridge apply-sample-size → study design | **partial** | One transaction writes N and power plus a chained, HMAC-sealed audit row with inputsSha256. The full inputs are not stored, and the design is overwritten in place. The stamp names c2c-stats rather than the ana-biostats engine that computed the number. Achieved power is written as the target, so each re-apply compounds. The approval is not bound to the N shown. | server/services/biostatistics-bridge/bridge-service.ts:30-33,:292-345; server/services/biostatistics-bridge/design-adapter.ts:260-261,:448-481; server/services/study-design/study-design-repository.ts:235-300; client/src/concept2cure/v2/surfaces/biostatBridge.tsx:397-424 |
| B6 Study design → Protocol development projections and Statistics tab (launch app) | **partial** | A read-only render of the current design. The SAP projection drops the sha256 ref, and a signed protocol version does not snapshot the design. | client/src/concept2cure/v2/surfaces/ProtocolDevProjections.tsx:9-20; server/services/study-design/sap-projection.ts:153-168; migrations/20260922c_amendment_design_snapshot.sql:3-12 |
| B7 Engine number → protocol_sections via AnA update_protocol_section | **fabricates** | Text the model re-typed, numbers included, is recorded as the user's author_assertion, because updateSectionTx takes no machineDraft. | server/services/ana/AnaToolExecutor.ts:11422-11440; server/services/protocol-development/protocol-development-service.ts:203-243 |
| B8 generate_statistical_document / generate_sap → concept2cure_artifacts | **fabricates** | Engine output is stored as machine_draft by 'ana' with eventAction 'ai_generate'. generate_sap silently fills effectSize 0.5 and writes three non-transactional inserts. | server/routes/ana-ri/post-processing.ts:196-210; server/services/ana/artifactVersionStore.ts:100-117,:186-200; server/services/ana-ri/command-executor.ts:3008-3031; server/services/ana-biostats/workflow-integrator.ts:121-219 |
| B9 Statistical document → IND / eCTD | **partial** | The authoring route reaches a coauthor snapshot and a leaf pin at document grain, carrying the user's assertions. The artifact route's section map pins no version. No IND service consumes the engine. | server/services/ana-biostats/workflow-integrator.ts:93-101,:317-374; migrations/0002_phase15_submission_ops.sql:41-52 |
| B10 Engine correctness: non-inferiority power | **fabricates** | Achieved power for a non-inferiority design is computed from δ alone, so N=452 sized for 90% power is reported as 4.4% and escalated. apply-sample-size writes that figure onto the design. | server/services/ana-biostats/computation-engine.ts:163-166,:174; server/services/biostatistics-bridge/design-adapter.ts:458-465 |

### C. CMC → Module 3 → Submission Center (reachable in production through /api/cmc/* and AnA module3_* only; the 'cmc' surface is not a launch app)

| Hop | Verdict | Carries | Evidence |
|---|---|---|---|
| C1 Source document (CoA, stability report, batch record) → register row | **absent** | No register references vault.documents, cre_evidence_sources or a byte hash. A CoA is a free-text column that counts as present. | shared/schema.ts:3707-3740,:3763,:3955; server/services/cmc-write-through.ts:853-885; server/services/module3Composer.ts:166,:191 |

### C. CMC

| Hop | Verdict | Carries | Evidence |
|---|---|---|---|
| C2 Register row → cmc_source_objects (write-through) | **mutable** | version is always 1, and payload and source_hash are overwritten in place. The provenance actor is 'system'. | server/services/cmc-write-through.ts:1479-1510,:1568-1576; server/services/cmc/link-to-module3.ts:183 |
| C3 Compile → cmc_module3_sections + cmc_section_lineage | **partial** | Section-grain lineage with source_hash_at_compile, deleted and re-inserted on every compile. The compile event carries no source ids and no hashes. | server/services/cmc/module3-compile.ts:193-254; server/services/module3Composer.ts:2968-3003 |
| C4 Compile → concept2cure_artifacts bridge | **fabricates** | Content is overwritten in place with no version row. The composer's prose is recorded as the author_assertion of whoever clicked compile. | server/services/module3-convergence-service.ts:650-718 |
| C5 Part 11 section approval | **fabricates** | Approving a stale section clears the stale flag without a recompile. The signed snapshot excludes the narrative and the lineage. | server/api/cmc/module3OperatingSystemRoutes.ts:664-668,:702-720,:797-810 |
| C6 Final-export gate | **partial** | Counts flags and whether lineage rows exist. It never compares source_hash_at_compile with the current hash. | server/services/cmc/final-export-gate.ts:95-277 |
| C7 Placement → coauthor_documents snapshot → leaf | **drops** | Reads the live section rather than approved_version_id. Metadata is {placedFrom, cmcProjectId, sectionKey}, with no alias. Snapshot, leaf and event are three separate commits. | server/services/cmc/place-module3-into-submission.ts:194-268,:356-364; server/services/c2c/document-alias-map.ts:36-43 |
| C8 Leaf → package → dispatch | **partial** | The byte pin holds. The manifest's lineage is canonicalId null for every Module 3 leaf, and a later invalidation never reaches the leaf. | server/services/ectd/leaf-source-resolver.ts:251-270; server/services/ectd/assemble-from-core.ts:330-353; server/services/ectd/dispatch-readiness.ts:262-271 |
| C9 Parallel compositions (orchestrator m3.compose; the M2.3 QOS tool) | **fabricates** | Both compose from live or caller-supplied sources with no approval. The QOS tool takes model-supplied cmcSources and labels the result 'deterministic'. | server/services/submission-package-orchestrator.ts:1380-1470; server/services/ana/bla-biologics-tool-defs.ts:738-763; server/services/ana/AnaToolExecutor.ts:5160-5187 |

### D. Every other content producer

| Hop | Verdict | Carries | Evidence |
|---|---|---|---|
| D1 QMS controlled documents (launch app) → approval signature | **fabricates** | The §11.70 digest binds the row, including the artifact_id pointer, and not the procedure text. Revise UPDATEs the effective row in place. | server/services/qms/document-approval-signature.ts:103-121; server/routes/mdx-qms.ts:628-676; server/services/ana/AnaToolExecutor.ts:13542-13553 |
| D2 Template library (launch app) | **drops** | Records the source form's file name with no hash. Render takes the body from the request and records nothing. | server/routes/c2c/templates.ts:121-155,:236-270 |
| D3 eSTAR device sections → official export (CDRH) | **partial** | The best-connected producer: sections are GUARDED, and the official PDF is retained through ingestVaultDocument with a sha256 per attachment. Each attachment names a sectionCode, not the section id or version. | server/services/pathway-engines/estar/estar-artifact-retention.ts:147-215; server/services/pathway-engines/estar/estar-attachment-plan.ts:150-165,:546-600; server/routes/510k-estar-routes.ts:1161-1240 |
| D4 IND safety / annual report → rendered_leaf_files → leaf | **drops** | The bytes can be verified, but their inputs are a request body typed a second time. No adverse_event id is recorded. | server/routes/ind-lifecycle/filing.routes.ts:165-290; server/services/ectd/rendered-leaf-files.ts:79-128 |
| D5 Deep research → 'save to the Vault' (save_document_to_vault) | **drops** | The model re-types the synthesis into concept2cure_artifacts, not vault.documents. The job id and the connector sources are lost. | client/src/concept2cure/v2/surfaces/DeepResearch.tsx:776-779; server/services/ana/document-surface-tool-defs.ts:123-138; server/services/ana/AnaToolExecutor.ts:19580-19651 |
| D6 Report OS seal and PDF (Insights) | **fabricates** | The seal sits in mutable JSONB with no signer. The exported PDF contains run metadata, not the sealed report. | server/routes/report-os.ts:441-500,:1405-1463,:1584-1648 |
| D7 HAQ Manager | **fabricates** | Shows a 'Traced to the locked dossier' label with no trace behind it. The ai-draft prompt sends the question as '{}'. Approve records no approver. | client/src/concept2cure/v2/surfaces/HaqManager.tsx:607-614; server/routes/haq-manager.ts:399-412,:603-656 |
| D8 USPI/SPL, SmPC, SAE narrative, CSR, nonclinical M2.6 | **mutable** | Content is overwritten in place with no version. FDA's words are re-attributed to the user who accepted them, and the SPL is never retained. The CSR model is recorded as null. M2.6 goes into coauthor_documents through a Drizzle insert the gate cannot see. | server/services/labeling/labeling-pi-service.ts:171-203,:286-302; server/routes/labeling-pi.routes.ts:338-383; server/routes/safety-narrative.ts:156-215; server/services/csr-builder.ts:465-527; server/routes/nonclinical-summary.routes.ts:94-150 |
| D9 The three lineage gates in CI | **absent** | All three are static and file-granular. canvas-path proves wiring. lineage-save-gate and artifact-provenance have no selftest, miss Drizzle inserts, aliased updates and schema-qualified symbols, and together discovered 0 of 16 producer files. All three are green. | scripts/ci/check-lineage-save-gate.mjs:164-280,:369-431,:498-530; scripts/ci/check-artifact-provenance.mjs:42-46; scripts/ci/check-canvas-path.mjs:13-31; package.json:147-148,:174-175 |

## 3. What a user sees when it is done

One lineage view, built by extending surfaces that are already reachable. No new surface (Rule 2).

1. Source Tracer becomes the two-way walk. It is surface 'source-tracer', reached from ProjectHome's 'Trace a claim to its source' (client/src/concept2cure/v2/surfaces/ProjectHome.tsx:578) and from the 'Author & assemble' modules. Today it serves sections only (server/routes/source-tracer-routes.ts:66).
- Walking back from a Submission Center leaf or a selected sentence, it shows each recorded step in turn:
  - the leaf, its sequence and its transmittal: the retained bundle's sha256 and each leaf's shipped hash;
  - the filing copy or Vault version;
  - the seal: frozen version, signer and content hash;
  - the section revision (the doc_revisions chain);
  - the spans at that revision;
  - each Data Room source, with its checksum at cite time, whether it has since been superseded, and the extracted-text hash the quote was verified against.
- For an engine number, it shows the computation source: engine, version, inputs and inputs hash.
- Walking forward from a Data Room source, it lists every section, revision, sealed version, Vault copy, leaf and transmitted sequence that used it.
- Every step is a recorded key. Where a hop has no recorded key, the view says 'not recorded' and never infers one.

2. Data Origins stays the sentence-level lens (select text, then right-click, plus the DocumentAttributionBar and the PDF).
- It is mounted in every catalog editor host: DocumentWorkbench as today, plus EctdCoauthor.tsx:945 and ProtocolDevSection.tsx:163, which mount the same editor without it.
- A version selector reads the spans recorded for a given revision.
- A span citing a superseded source reads 'superseded by vN', never 'current'.

3. The Data Room on ProjectHome:
- 'Used in' counts span uses as well as section citations.
- 'Changed since cited' fires when a cited source is superseded. Today it never can (source-usage.service.ts:448-452).
- 'Write from these sources' carries the selection into Authoring.
- A computation published by an engine appears as a source with its engine and version.

4. Vault document History (VR-01) gains two lists per version: 'Cited by' (spans and citations) and 'Placed in' (VR-14's placements).

5. Submission Center:
- The Builder's pin chip (SubmissionSeqWorkspaces.tsx:236-280) opens the backward walk.
- The sequence workspace gets a Transmit control, on the same e-sign ceremony as freeze and dispatch.
- A transmitted sequence shows its retained bundle hash and can be downloaded exactly as sent.

6. The canvas and editor header show the real model id, conversation and turn. DocumentCanvas.tsx:232 prints 'model not recorded' today. The editor also gets an 'Accept AnA text' action, which records a person's acceptance of each machine-drafted clause before a seal.

These are not the lineage view and should not be wired as one:
- Decision lineage covers unified_documents only.
- The AnA lineage dossier is API-only, and it duplicates.
- Sentence traceability infers links at 0.3 confidence and is API-only.

## 4. The fixes, in order

Each fix extends an existing canonical store. None adds a lineage store. Tests come first, and each is shown red before its fix.

| Id | Size | Row | Fix | Depends on | Founder decision |
|---|---|---|---|---|---|
| LX-00 | M | D4 (tests generate the OQ and traceability evidence) serving D7/D10: it proves the path a pilot user files through | A failing end-to-end walk test for the founder's path; ci:canvas-path extended from wiring to recorded lineage | — | — |
| LX-01 | M | D4 (CI evidence) with D5 | The save and provenance gates see every content write, judge each write rather than each file, and are shown failing | — | — |
| LX-02 | M | D2 (Projects: the Data Room), with D1 (two API tasks and no sticky sessions) | Data Room capture stores the exact bytes durably, in one transaction with the source record, scoped to the program | — | — |
| LX-03 | M | D2 (Vault and Projects) with D5 | One source identity: every Vault version is a Data Room source, so a Vault file can be cited and walked | LX-02 | One source registry or two. Recommended: cre_evidence_sources is the one identity for anything a sentence can rest on, and vault.documents stays the byte and filing store. |
| LX-04 | M | D4 (URS for AnA grounding in the launch shell) with D2 | AnA's product stream can search the project's Data Room, and every passage it returns names its source, revision and checksum | LX-02 | none. ANA_ENABLE_PDF_INTAKE remains the founder's own switch. |
| LX-05 | M | D5 (§11.10(e): accurate and complete records) with D4 | A 'quoted' span is verified against the source's own checksum-verified text, never against text the model supplied | LX-02, LX-03 | — |
| LX-06 | M | D4 (only approved, PQ-passed models draft regulated text, evidenced per document) with D5 | The canvas document records the approved model, conversation, turn and its verified Data Room sources | LX-04, LX-05 | — |
| LX-07 | M | D2 (one document store in the launch catalog, the canvas design's decision 1) with D5 | One AnA document engine: every document AnA builds goes through the canvas engine, and 'save to the Vault' means the Vault | LX-06, LX-10 | Confirm retiring generate_document and author_docx_native (a DOCX at a server path) in favour of canvas plus file-to-vault. The canvas design's decision 1 already covers save_document_to_vault. |
| LX-08 | L | D5 (§11.10(e): changes must not obscure previously recorded information; §11.70 linking) with D4 | Span lineage becomes append-only and bound to the revision it describes; a moved quote keeps its source | LX-01 | none. The migration header must record, per Rule 1, that rows already updated in place cannot be recovered: immutable span history begins at deploy. |
| LX-09 | L | D5 (§11.70 signature and record linking; §11.10(e)) | The seal binds each section's revision head and lineage digest; AI text needs a recorded human acceptance; sealed citations cannot be rewritten | LX-08 | Seal policy for AI text no person has accepted: refuse the freeze, or seal and print the unaccepted share in the §11.50 manifest. |
| LX-10 | M | D5 with D2 (Vault) | File to Vault records which sealed version and lineage it rendered, as the next version of one Vault document and one source | LX-03, LX-09, VR-08 (docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md) | FD5 of the Veeva parity plan: whether a sealed Authoring export carries its approval to the Vault copy. |
| LX-11 | M | D7 (one real sequence) with D5 | The filing copy and the leaf keep the version they point at; the governed filing row carries the text's real lineage | LX-08 | — |
| LX-12 | L | D7 (one test sequence accepted by FDA, with its ack chain) and D10 | Transmit holds each leaf to its pin, retains the exact bytes it sent, and records the transmitted manifest as what was filed | LX-11 | Two decisions: how sequence 0000 becomes the filed prior (open in the IND demo lane, docs/work-orders/README.md), and FD5, grandfathering of Vault leaves already in open sequences. |
| LX-13 | L | D7 and D10 (a named user files a governed document into a sequence on production) | Submission Center transmits a dispatched sequence, over one transmit spine | LX-12 | Which spine is the one transmit spine. Recommended: the sequence spine (ectd_sequences + submission_leaves). Only it holds authoring and Vault documents with source pins and a signed leaf manifest; the package spine's filed history migrates onto it. |
| LX-14 | L | D2 (a launch surface that reports honestly) with D4 | One lineage view: Source Tracer walks a source to every filed sequence and back, and every lineage read honours supersession | LX-08, LX-11, LX-12 | — |
| LX-15 | L | D4 (Rule 2: numbers come from deterministic engines, evidenced in Authoring and Protocol development, both launch apps) | An engine's number enters a catalog document as a 'computed' span citing its computation, which is a Data Room source | LX-01, LX-08, LX-14 | Under Rule 2 the Biostatistics and Biostat Workbench surfaces are not launch apps. Recommended scope now: publish only on the existing governed paths that end in catalog stores (apply-sample-size, Workbench insert, protocol sections). A publish control on the Biostatistics surface waits for D1–D10. |
| LX-16 | M | D4 (Protocol development, a launch app, shows the design's N and power) | The statistics engine stops writing wrong figures: non-inferiority power, achieved-vs-target power, silent defaults, a second browser engine | — | Deleting the browser BiostatEngine removes a user-facing computation. Per the Working agreement, the commit must name the replacement (the server engine route) and its parity test. |
| LX-17 | L | D7/D10, for the placement seam into Submission Center only; the CMC module is not a launch app | CMC Module 3 files the approved, signed version with its lineage, and a stale approval cannot reach a sequence | LX-11, LX-12, LX-15 | Whether CMC Module 3 placement is in the pilot's D7/D10 scope. Lineage inside CMC itself waits for D1–D10 under Rule 2: CoA and stability reports as Data Room sources, register versioning, contradiction history (CMC-1, CMC-3, CMC-7, CMC-8, CMC-11, CMC-M2). |
| LX-18 | L | D5 (QMS approval, §11.70) with D2 | QMS controlled documents and the template library record content, not pointers | LX-09 | Whether QMS document bodies move into the authoring store. That is the zero-duplication answer, but it changes how QMS documents are edited. |
| LX-19 | M | D2 (every non-catalog surface behind a flag that is off in production) with D6 | Producers outside the launch catalog cannot put unlineaged content into catalog stores in production (containment until D1–D10) | LX-01 | Two decisions: which of these producers join the catalog after D1–D10; and whether data_lineage_records is retired in favour of span lineage on documents or made canonical for chat answers (today it holds answer-grain rows with no hash, and its append-only trigger is not on the deploy set). |

### LX-00 — A failing end-to-end walk test for the founder's path; ci:canvas-path extended from wiring to recorded lineage

- **Closes:** AC-16, SUB-15, DR-ANA-18
- **Extends:** ci:canvas-path (scripts/ci/check-canvas-path.mjs + .selftest.mjs), the gate docs/design/ANA_DOCUMENT_CANVAS.md pins. The walk reads only the canonical stores: cre_evidence_sources, document_span_lineage, doc_revisions, frozen_documents/authoring_signatures, audit_logs, vault.documents, c2c_document_aliases, submission_leaves, submission_transmittals
- **Files:** `tests/lineage/founder-path-lineage.pglite.test.ts (new test)`, `tests/lineage/founder-path-lineage.baseline.json (shrink-only list of hops still broken, each naming the LX fix that closes it)`, `scripts/ci/check-canvas-path.mjs`, `scripts/ci/check-canvas-path.selftest.mjs`, `package.json`, `.github/workflows/ci.yml`
- **Owner:** unclaimed. The canvas gate is WM …session_01U2hGiy7gxEUhJ8hY4mNbi2's (e0f99d3c), and that session has no active row; claim a new row in docs/work-orders/README.md
- **Tests first:**
  - founder-path-lineage.pglite.test.ts: capture bytes X into program P through the upload service; run draft_authoring_document under the stream's exact ctx (stream.ts:1732-1744) grounded on that source; save an edit; freeze and sign; file-to-vault; place the coauthor copy and the Vault copy as leaves; freeze and transmit with a stub gateway. Then walk BACK from the transmittal to cre_evidence_sources.checksum = sha256(X), and FORWARD from the source to the transmittal, using recorded keys only. Expected red at HEAD at 'canvas draft has a cre_evidence_source span' (0) and 'model recorded' (undefined)
  - Each hop is its own case. A baselined hop that turns green fails the run, which forces the baseline to shrink; a non-baselined hop that fails also fails the run
  - check-canvas-path.selftest.mjs gains a cut: a synthetic tree with the walk test removed or skipped is refused

### LX-01 — The save and provenance gates see every content write, judge each write rather than each file, and are shown failing

- **Closes:** B7, CMC-10, BS6, OP-03, AC/M4-missed (provenance gate blind to the authoring store), AC-11 (gate half), CMC-12 (gate half), OP-15 (gate half)
- **Extends:** scripts/ci/check-lineage-save-gate.mjs (GUARDED / NOT_PROSE / KNOWN_UNGUARDED) and scripts/ci/check-artifact-provenance.mjs (BASELINE): the two existing gates, not a third
- **Files:** `scripts/ci/check-lineage-save-gate.mjs`, `scripts/ci/check-lineage-save-gate.selftest.mjs (new)`, `scripts/ci/check-artifact-provenance.mjs`, `scripts/ci/check-artifact-provenance.selftest.mjs (new)`, `package.json`, `.github/workflows/ci.yml`, `.husky/pre-push`
- **Owner:** unclaimed. lineage-save-gate was last changed by WM …01U2hGiy (e0f99d3c); artifact-provenance by …01W5zW66, whose lane is released; .husky/pre-push is shared
- **Tests first:**
  - lineage-save-gate selftest: build each blind case and show HEAD passing it (red). The cases: a Drizzle .insert(coauthorDocuments).values({content}) (place-module3-into-submission.ts:209-232; nonclinical-summary.routes.ts:124-134); an aliased UPDATE (commit-section-to-filing.ts:241); .set({...spread}); onConflictDoUpdate({set:{content}}); one gated and one ungated write in the same file; authoring_sections missing from GOVERNED_DOC_TABLES; the gate at c2c/documents.ts:617-656 deleted (that file is not in GUARDED)
  - artifact-provenance selftest: .insert(schema.concept2cureArtifacts) (workflow-integrator.ts:140) is seen; a file whose only provenance token is cmc_provenance_events (module3-convergence-service.ts:667/706) fails; recordArtifactProvenanceBestEffort alone does not satisfy the gate
  - Every writer the widened discovery finds goes into KNOWN_UNGUARDED with the LX fix that removes it; the list is shrink-only

### LX-02 — Data Room capture stores the exact bytes durably, in one transaction with the source record, scoped to the program

- **Closes:** DR-ANA-11, DR-ANA-07, DR-ANA-17
- **Extends:** cre_evidence_sources through evidence-spine.service.ts createSource/createSupersedingSource, and the one byte store getStorageProvider()/getStorageProviderFor() that vault ingest and rendered_leaf_files already use (server/services/ectd/rendered-leaf-files.ts:91-117). Program-scoped dedupe is VR-10 of docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md
- **Files:** `server/routes/chat/upload.ts (byte and identity blocks :160-211, :425-620)`, `server/services/clinical-regulatory-evidence/evidence-spine.service.ts`, `server/services/ana/uploaded-file-access.ts`, `client/src/concept2cure/hooks/useChatUpload.ts`, `tests/routes/chat-upload-source-identity.test.ts`
- **Owner:** The upload.ts identity and byte blocks are unclaimed; only its retrieval-atom blocks belong to …session_01DiJJAkasGVrccrxjhYyjxG (tell that lane). The 'files on one task's disk' class is W2 …session_01GSjEDJLuZsEzPa9PnVg1yF (claimed). VR-10 is in …session_01KnUGoX3g4R4FWKWGc2sTbN's Veeva plan. useChatUpload.ts is W1 …session_01T2wooCZu46W7msw4TJuuzr
- **Tests first:**
  - pglite: when the storage put fails, the upload is refused and no cre_evidence_sources row exists (red: 200 'ready' and a row marked 'ingested', upload.ts:172-183,:561)
  - The bytes read back through getStorageProviderFor(stored_artifact_ref) from a second provider instance hash to cre.checksum (red: stored_artifact_ref is a local path, upload.ts:166)
  - When source creation throws, the request fails and no 'upload:<fileId>' atom is written (red: upload.ts:600-620,:649-653)
  - VR-10's case: bytes captured in program A and then in program B appear in B's Data Room (red: evidence-spine.service.ts:319-336)
  - The client keeps sourceId (red: useChatUpload.ts:185 drops it)

### LX-03 — One source identity: every Vault version is a Data Room source, so a Vault file can be cited and walked

- **Closes:** DR-ANA-12, SUB/M4-missed (the two 'vaults' meet by key, not by a hash coincidence)
- **Extends:** cre_evidence_sources (source_type 'vault_document', stored_artifact_ref = vault.documents.id, checksum = content_hash), written by createSource inside ingestVaultDocument's transaction. vault.documents stays the byte and filing store. VR-16 of the Veeva plan makes the capture identity write-once
- **Files:** `server/services/vault/vault-ingest.service.ts`, `server/services/ana/document-catalog-tools.ts (file_chat_upload_to_vault :575-592)`, `server/services/clinical-regulatory-evidence/evidence-spine.service.ts`, `client/src/concept2cure/v2/editor/ProjectFilesPanel.tsx (:142-147)`
- **Owner:** …session_01DiJJAkasGVrccrxjhYyjxG (AnA client files: vault document-*, vault-ingest, document-*-tools*). evidence-spine.service.ts is unclaimed
- **Tests first:**
  - pglite: ingestVaultDocument writes exactly one source with checksum = content_hash in the same transaction; a forced failure after the vault INSERT leaves neither row (red: no source row)
  - Ingesting bytes already captured in the same program links to the existing source and creates no duplicate (red)
  - file_chat_upload_to_vault carries the upload's source id (red: bytes only)
  - ProjectFilesPanel: a Vault file with no prior Data Room capture can be cited (red: 'referred to' only)
- **Founder decision:** One source registry or two. Recommended: cre_evidence_sources is the one identity for anything a sentence can rest on, and vault.documents stays the byte and filing store.

### LX-04 — AnA's product stream can search the project's Data Room, and every passage it returns names its source, revision and checksum

- **Closes:** DR-ANA-02, DR-ANA-03, DR-ANA-04, DR-ANA-08, DR-ANA-10, DR-ANA-18
- **Extends:** retrieval-source-link.ts resolveEvidenceSourceIdsByArtifact (the one atom → source resolver) and AnaToolExecutor's withScopeOrganizationUuid (:15161-15169), applied in the stream's dispatch rather than only in executeAgenticLoop. enhancedEmbeddingService.searchHybrid's project filter keys on cre_evidence_sources.client_program_id and is_current
- **Files:** `server/routes/ana-ri/stream.ts (:1732-1744 dispatch ctx; :885-944 pins)`, `server/services/ana/AnaToolExecutor.ts (project_knowledge_search :487-566)`, `server/services/enhancedEmbeddingService.ts (:548-566)`, `server/services/clinical-regulatory-evidence/retrieval-source-link.ts`, `server/services/clinical-regulatory-evidence/evidence-spine.service.ts (visibleOrgClause :33-35)`, `server/services/ana/__tests__/rag-provenance.test.ts`, `server/routes/ana-ri/__tests__/stream-tool-ctx.test.ts (new)`
- **Owner:** stream.ts is unclaimed (last c6736088 by …01W5zW66, lane released). enhancedEmbeddingService.ts is unclaimed (the D3 …01W5zW66 and D4 …01AiwZKG lanes are released). upload-retrieval-atom.ts belongs to …01DiJJAk. AnaToolExecutor.ts is shared and inside other lanes' 24 h windows, so coordinate
- **Tests first:**
  - stream-tool-ctx.test.ts: under the ctx the stream builds for a UUID program, project_knowledge_search returns the Data Room upload with evidence_source_id and checksum (red: 'No active project is in context')
  - Rebuild rag-provenance.test.ts on the stream's ctx shape instead of the hand-made organizationUuid at :35 (red)
  - A superseded revision is not returned as current (red: enhancedEmbeddingService.ts:555-566)
  - Program B's search does not return program A's project_private upload (red: evidence-spine.service.ts:33-35)
  - Pinned sources reach the model as source id, revision and checksum (red: '[ID: file_…]' only, stream.ts:931-938)
- **Founder decision:** none. ANA_ENABLE_PDF_INTAKE remains the founder's own switch.

### LX-05 — A 'quoted' span is verified against the source's own checksum-verified text, never against text the model supplied

- **Closes:** DR-ANA-01, DR-ANA-09, DR-ANA-05
- **Extends:** source-attribution.ts attributeQuotedSpans and lineage-gate.ts enforceSourceAndAuthorLineage, fed by one source-text reader built on uploaded-file-access.ts loadUploadedFile (already fail-closed on checksum) and readVerifiedVaultBytes. The existing source_locator column carries the char range, the extracted-text sha256 and the extractor version. The model's excerpt is only a hint for locating the quote
- **Files:** `server/services/ana/drafting-source-lineage.ts (:76-103)`, `server/services/clinical-regulatory-evidence/source-attribution.ts`, `server/services/clinical-regulatory-evidence/lineage-gate.ts (:266, :288-299)`, `server/services/ana/uploaded-file-access.ts`, `server/routes/ana-ri/stream.ts (:958-980 PDF intake)`, `server/services/ana/__tests__/drafting-source-lineage.pglite.integration.test.ts`
- **Owner:** drafting-source-lineage.ts, source-attribution.ts and lineage-gate.ts are unclaimed (last d255c6b0 by …01W5zW66, released). uploaded-file-access.ts sits in …01DiJJAk's client-files scope, so coordinate. The write_* handlers in AnaToolExecutor.ts fall outside L49's QMS-only claim
- **Tests first:**
  - drafting-source-lineage pglite, with a source that has real bytes: write_q_sub_section cites it with an excerpt the bytes never contained, and no 'quoted' span is recorded (red: the read-only probe recorded 'quoted' at coverage 100 with the real checksum)
  - A true quote gets a source_locator with a char range and an extracted-text sha256 that recomputes from the stored bytes (red: NULL locator)
  - PDF intake refuses bytes that do not hash to the recorded checksum (red: readLocalUploadBuffer sends them, anthropic-files.ts:157-170)

### LX-06 — The canvas document records the approved model, conversation, turn and its verified Data Room sources

- **Closes:** AC-01, AC-02, DR-ANA-13, AC-08, AC/M1-missed
- **Extends:** The one document creation engine, createDocumentFromDraft/insertDocumentTx (authoring-from-draft.ts; authoring-documents.ts:311-393); authoring_documents.provenance (migrations/20260921_authoring_document_provenance.sql); the genesis doc_revisions contributors (authoring-evidence.ts:309-311); and enforceSourceAndAuthorLineage with machineDraft. This implements rule 4 of docs/design/ANA_DOCUMENT_CANVAS.md
- **Files:** `server/routes/ana-ri/stream.ts (:1732-1744: pass model = the served model id, threadId, turnId)`, `server/services/ana/document-surface-tool-defs.ts (:140-166: sources[])`, `server/services/authoring/authoring-draft-tool.ts (:133-136)`, `server/services/authoring/authoring-from-draft.ts (:52-72 parseProvenance, :239-242)`, `server/services/authoring/authoring-documents.ts (:355-372)`, `server/routes/authoring.router.ts (:1457 from-draft)`, `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx (:4077-4100 AnA-pane suggestion author)`, `server/services/ana/__tests__/draft-authoring-document-tool.pglite.integration.test.ts`
- **Owner:** stream.ts is unclaimed. authoring-draft-tool.ts, authoring-from-draft.ts and authoring-documents.ts are WM …01U2hGiy's (e0f99d3c), with no active row. document-surface-tool-defs.ts was last changed by …01DiJJAk (3c2f78ef). DocumentWorkbench.tsx is inside W1 …01T2wooC's window
- **Tests first:**
  - Flip draft-authoring-document-tool.pglite :115: an approved servingModel yields provenance.model = that model id and genesis inputs.contributors = [{id:'ana', model, turnId}] (red: undefined)
  - The stream dispatch passes threadId, turnId and model (red: AnaToolExecutor.ts:228-236 says 'the stream's dispatch does not pass them yet')
  - A draft with one verified source (via LX-05) records at least one cre_evidence_source span in the insertDocumentTx transaction, and machine_draft spans for the rest (red: 0 source spans)
  - POST /api/authoring/docs/from-draft with body provenance {source:'ana', model:'X'} is refused, or recorded as the caller's own import (red: stored verbatim)
  - An AnA-pane suggestion accepted in the workbench records the served model on its contributor (red: {id:'ana'} only)

### LX-07 — One AnA document engine: every document AnA builds goes through the canvas engine, and 'save to the Vault' means the Vault

- **Closes:** AC-20, OP-10, SUB/M4-missed, BS7 (routing half)
- **Extends:** createDocumentFromDraft (the canvas engine) plus POST /api/authoring/docs/:docId/file-to-vault. concept2cure_artifacts stops receiving documents, as decision 1 of docs/design/ANA_DOCUMENT_CANVAS.md already requires
- **Files:** `server/services/ana/AnaToolExecutor.ts (save_document_to_vault :19580-19651; generate_document / author_docx_native :6379-6447)`, `server/services/ana/document-surface-tool-defs.ts (:123-138)`, `server/routes/ana-ri/post-processing.ts (:147, :196-210)`, `server/services/ana/artifactVersionStore.ts`, `scripts/ci/check-canvas-path.mjs`
- **Owner:** The AnaToolExecutor.ts handlers are unclaimed (L49 covers QMS tools only; the file is inside other lanes' 24 h windows). post-processing.ts was last changed by W1 …01T2wooC. document-surface-tool-defs.ts belongs to …01DiJJAk
- **Tests first:**
  - save_document_to_vault creates an authoring document and a vault.documents version through file-to-vault, with its alias (red: a concept2cure_artifacts row and no vault row)
  - A generate_statistical_document draft persists through the canvas engine rather than as an artifactVersionStore 'regulatory_document' (red: post-processing.ts:196-210)
  - generate_document writes no untracked file at a server outputPath (red: AnaToolExecutor.ts:6379-6447)
  - The commit names the replacement (authoring-draft-tool.ts plus file-to-vault) and the gate that proves it reachable (ci:canvas-path), as the Working agreement requires
- **Founder decision:** Confirm retiring generate_document and author_docx_native (a DOCX at a server path) in favour of canvas plus file-to-vault. The canvas design's decision 1 already covers save_document_to_vault.

### LX-08 — Span lineage becomes append-only and bound to the revision it describes; a moved quote keeps its source

- **Closes:** AC-04, DR/M2-missed, B3, AC-03, AC-09, AC-12, AC-07 (moves within one document)
- **Extends:** document_span_lineage, whose unused document_version column becomes the doc_revisions id, and doc_revisions, whose inputs gain a lineage digest. These are the two existing stores; no new table
- **Files:** `migrations/<date>_document_span_lineage_append_only.sql (new C2C_MIGRATION_FILES entry before the final sweep pair: CREATE OR REPLACE FUNCTION + CREATE TRIGGER only if absent, no DROP, dated header)`, `scripts/db/migration-set.mjs`, `server/services/clinical-regulatory-evidence/span-lineage.service.ts (:283-320, :388-405, :612-632, :813-856)`, `server/services/clinical-regulatory-evidence/lineage-gate.ts`, `server/services/clinical-regulatory-evidence/machine-attribution.ts`, `server/services/authoring/authoring-evidence.ts (:278-322)`, `server/routes/authoring.router.ts (:1860-1986 save, the revert route, :3170-3370 AI accept)`, `tests/db/document-span-lineage-append-only.dbtest.ts (new)`
- **Owner:** span-lineage.service.ts, lineage-gate.ts and machine-attribution.ts are unclaimed (last 9cc91dcb by …01TTTQ1h). authoring.router.ts was last changed today by fde9d704 (…01FSu2RL): it is inside that 24 h window and has no lane row, so coordinate. migration-set.mjs is shared
- **Tests first:**
  - document-span-lineage-append-only.dbtest.ts, as app_service with RLS on: an UPDATE of payload_sha256 or span_text_sha256 succeeds (red) and is refused after; deleted_at NULL → now is allowed; DELETE and TRUNCATE are refused
  - pglite: cite source revision 1, supersede it to revision 2, re-save; the original span still carries revision 1's checksum (red: re-resolved at span-lineage.service.ts:300)
  - Invert source-and-author-lineage.pglite :203-219: a paragraph inserted above a verified quote leaves the quote a cre_evidence_source span (red: retired into the saver's author_assertion)
  - Each save writes spans with document_version = that save's doc_revisions id, and doc_revisions.inputs.lineage.digest recomputes from exactly those rows (red: document_version NULL, no digest)
  - Revert re-inserts the restored revision's spans (red: the reverter's assertion)
  - In AI accept, a failing createRevision rolls the content back (red: content committed, revision warn-only at :3338)
- **Founder decision:** none. The migration header must record, per Rule 1, that rows already updated in place cannot be recovered: immutable span history begins at deploy.

### LX-09 — The seal binds each section's revision head and lineage digest; AI text needs a recorded human acceptance; sealed citations cannot be rewritten

- **Closes:** AC-10, AC/M3-missed, AC/M2-missed, AC-18, AC-05, AC-06, AC-11, AC/M5-missed
- **Extends:** frozen_documents.frozen_content/content_hash and authoring_signatures.content_hash (sectionsDigest, authoring-export.ts:498-520). authoring_citations writes join the audit_logs chain. accepted_machine_draft is recorded through the existing acceptedMachineText channel (machine-attribution.ts:175-248)
- **Files:** `server/routes/authoring.router.ts (:3700-3860 freeze, :4623-4657 refresh-all, POST /docs template create)`, `server/services/authoring/authoring-export.ts (:223-243 reference list, :498-520)`, `server/services/authoring/authoring-documents.ts (:482-495 template seeds)`, `server/services/clinical-regulatory-evidence/source-usage.service.ts (:172-258, :488-532)`, `server/services/clinical-regulatory-evidence/span-lineage-backfill.ts`, `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx ('Accept AnA text')`, `server/routes/__tests__/authoringTemplateStartFrom.test.ts`
- **Owner:** authoring.router.ts is inside …01FSu2RL's window with no lane row. DocumentWorkbench.tsx is inside W1 …01T2wooC's window. authoring-export.ts was last changed in 7087ae5c. source-usage.service.ts is unclaimed. span-lineage-backfill.ts was last changed in f4f837cd
- **Tests first:**
  - Freeze, then alter a span row that feeds the lineage digest: signature verification fails (red: still verifies, because spans are not bound)
  - POST /docs/:id/refresh-all on a frozen or signed document returns 409, and every citation write leaves an audit row (red: payload_sha256 rewritten with no audit, :4623-4657)
  - Export prints a reference only for a data-cite backed by a recorded citation or span with its checksum (red: any tenant-visible source id is printed, authoring-export.ts:223-243)
  - Template create writes spans for every seeded clause, attributed to the template's recorded author (red: 0 spans; authoringTemplateStartFrom.test.ts:129 gains the assertion)
  - The backfill never attributes template-seeded text to the document creator (red: span-lineage-backfill.ts:83-172)
  - A document with unaccepted machine_draft text is sealed only under the founder's policy (red: freezes silently), and 'Accept AnA text' records accepted_machine_draft with the acceptor (red: no such action)
- **Founder decision:** Seal policy for AI text no person has accepted: refuse the freeze, or seal and print the unaccepted share in the §11.50 manifest.

### LX-10 — File to Vault records which sealed version and lineage it rendered, as the next version of one Vault document and one source

- **Closes:** SUB-7, SUB-8, AC-14
- **Extends:** authoring-file-to-vault.ts recordFiling's chained audit_logs row and authoring_export_history; c2c_document_aliases, with vault_documents added to the store vocabulary (identity only); the Vault version family (VR-08 supersedes); and the source identity from LX-03
- **Files:** `server/services/authoring/authoring-file-to-vault.ts (:112-121, :222-264, :284-299, :351-366)`, `server/services/c2c/document-alias-map.ts (:36-43)`, `migrations/20260814d_document_alias_map.sql (store vocabulary; if it is a CHECK, amend in place with a dated header, guarded on pg_get_constraintdef, per Rule 1)`, `server/routes/__tests__/authoringFileToVault.pglite.integration.test.ts`
- **Owner:** authoring-file-to-vault.ts is WM …01U2hGiy's (e0f99d3c); README:42 hands file-to-vault items to …01DiJJAk. document-alias-map.ts is unclaimed
- **Tests first:**
  - authoringFileToVault.pglite: after an edit between render and record, export_history.doc_sha256 equals the digest of the rows rendered (red: second read at :236)
  - The chained row carries {docId, frozen version, seal content_hash, signature ids, revision heads, lineage digest} (red: vaultDocumentId and artifactSha256 only)
  - A second filing of the same document is the next version of the first, with supersedes_id set (red: unlinked rows)
  - c2c_document_aliases resolves the vault uuid to the authoring document (red: vault is not in the vocabulary), and ci:document-alias-attribute-free still passes
- **Founder decision:** FD5 of the Veeva parity plan: whether a sealed Authoring export carries its approval to the Vault copy.

### LX-11 — The filing copy and the leaf keep the version they point at; the governed filing row carries the text's real lineage

- **Closes:** SUB-5, SUB-10, SUB-3 (link half), AC-13, AC/M6-missed
- **Extends:** coauthor_documents plus coauthor_document_versions (the existing coauthor version store); c2c_document_aliases; the submission_leaves pin with its LEAF_CREATED/LEAF_UPDATED chained audit rows; and the one span gate on c2c_document_sections
- **Files:** `server/services/coauthor/coauthor-snapshot.ts (:384-395, :454-478, :499-514)`, `server/services/submission-service/submission-service.ts (:2021-2032, :2060-2071)`, `server/services/c2c/commit-section-to-filing.ts (:241-252)`, `server/routes/authoring.router.ts (commitSectionToFiling callers :1904, :2195, :3295)`, `scripts/ci/check-lineage-save-gate.mjs (GUARDED entry)`
- **Owner:** coauthor-snapshot.ts is unclaimed (last 3371a96c by …01PwLFr8). submission-service.ts was last changed today by fc29f2d1 (…015oLV2v; inside the 24 h window, no lane row). commit-section-to-filing.ts is unclaimed
- **Tests first:**
  - Re-take after a re-seal: sequence 0000's leaf pin still resolves to a version row holding 0000's text and seal version (red: overwritten in place at :384-395)
  - The first take writes an audit event with the seal version and hash (red: alias only, :499-514)
  - LEAF_CREATED/LEAF_UPDATED details carry documentTable, documentId or documentUuid, and documentContentSha256 (red: sectionCode, lifecycleOp and reason only)
  - After an authoring save, c2c_document_sections has live spans that match the committed text and no stale mdx-era spans (red)

### LX-12 — Transmit holds each leaf to its pin, retains the exact bytes it sent, and records the transmitted manifest as what was filed

- **Closes:** SUB-2, SUB-9, SUB-6, SUB/M2-missed, SUB-4, SUB/M3-missed, SUB-3 (persisted manifest)
- **Extends:** The submission_leaves.document_content_sha256 pins (verifyLeafSource); the one finalization rule in leaf-source-resolver (noteUnfinalized, VR-14); the storage-provider seam rendered_leaf_files already uses; submission_transmittals.bundle_sha256; and ectd_compilations.leaf_manifest as the one filed-prior record. submission-bundle-storage.ts's separate S3 path moves onto the provider in the same change (zero duplication)
- **Files:** `server/services/ectd/leaf-source-resolver.ts (:91-106, :183-194, :497-714)`, `server/services/ectd/assemble-from-core.ts (:312-359, :381-392)`, `server/services/submission-service/submission-service.ts (:1217-1473)`, `server/services/ectd/prior-sequence-loader.ts (:139-207)`, `server/routes/ectd-compile.ts (:976-1028, :1126-1148)`, `server/services/submission-bundle-storage.ts`, `migrations/<date>_submission_transmittals_sequence_id.sql (additive nullable column, before the final pair)`
- **Owner:** The D7 lanes: …session_01LjrcEe8y3zUQxwX91zzTaM (package spine, claimed) and …session_01TtwRHmBMya3QTFCbFsBjoj (IND eCTD, claimed; holds the filed-prior decision). Sequence-spine transmit in submission-service.ts is otherwise unclaimed (…015oLV2v is inside today's window). leaf-source-resolver.ts was last changed in 7fd5d6af (…01AiwZKG)
- **Tests first:**
  - A coauthor leaf edited after Gate 2 makes transmit refuse and name that leaf (red: materializeLeafSources re-reads without the pin)
  - A WORKING DRAFT vault leaf, a ctd_onboarding upload and a rendered_leaf_files leaf each count as unfinalized (red: never passed to noteUnfinalized; VR-14's leaf-source-resolver-vault-finalized.test.ts)
  - After transmit, the bundle and its governance manifest can be retrieved by transmittal id through getStorageProviderFor and hash to bundle_sha256, and each leaf's shipped sha256/md5 is recorded (red: cleanup at :1415-1419)
  - ECTD_TRANSMITTED carries bundleSha256 and the storage reference (red)
  - An eCTD Compile after transmit leaves loadLatestPriorManifestBySubmission unchanged, and compile refuses a sent sequence (red: replaced)
- **Founder decision:** Two decisions: how sequence 0000 becomes the filed prior (open in the IND demo lane, docs/work-orders/README.md), and FD5, grandfathering of Vault leaves already in open sequences.

### LX-13 — Submission Center transmits a dispatched sequence, over one transmit spine

- **Closes:** SUB-1, SUB-13, SUB-11, SUB/M1-missed
- **Extends:** The existing POST /api/submissions/sequences/:seqId/transmit (server/routes/submissions.ts:1707), behind the same e-sign ceremony as freeze and dispatch. The package spine's filed history (package-content-change.ts) converges onto ectd_sequences/submission_leaves
- **Files:** `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx (:1141-1296)`, `server/services/ana/AnaToolExecutor.ts (:8606-8656 transmit_submission)`, `server/services/ana/submission-center-tool-defs.ts (:867)`, `server/services/submission-gateways/governed-transmit.ts`, `server/services/ectd/package-content-change.ts`, `server/routes/submission-ops.ts (:2276-2307, :2486-2489)`
- **Owner:** SubmissionSeqWorkspaces.tsx was last changed in fc29f2d1 (…015oLV2v; 24 h window). The package spine is …01LjrcEe's (claimed). submission-center-tool-defs.ts was last changed by …015weqdG. The founder decides the spine first
- **Tests first:**
  - client: a dispatched sequence shows Transmit, runs the e-sign ceremony and calls the sequence route (red: no control; a grep of client/src for the sequence transmit finds 0)
  - AnA's transmit_submission stops sending the user to a spine that cannot hold the document (red: :8606-8656), and the place-leaf tool text stops saying Vault leaves cannot be materialized (red: :867)
  - After convergence, every sequence filed with FDA is one query over ectd_sequences, with each leaf's version and hash (red: two ledgers, and package leaves carry an artifact id with no version)
- **Founder decision:** Which spine is the one transmit spine. Recommended: the sequence spine (ectd_sequences + submission_leaves). Only it holds authoring and Vault documents with source pins and a signed leaf manifest; the package spine's filed history migrates onto it.

### LX-14 — One lineage view: Source Tracer walks a source to every filed sequence and back, and every lineage read honours supersession

- **Closes:** SUB-14, DR/M1-missed, B1, B2, DR-ANA-14, DR-ANA-16, B11
- **Extends:** The reachable Source Tracer (server/routes/source-tracer-routes.ts; client/src/concept2cure/v2/surfaces/SourceTracer.tsx) and Data Origins (server/routes/data-origins.routes.ts; the RichSectionEditor lineage prop). span-lineage.service.ts listSpansCitingSource (:1049) exists and has no caller
- **Files:** `server/routes/source-tracer-routes.ts (:66, sections only today)`, `client/src/concept2cure/v2/surfaces/SourceTracer.tsx`, `server/services/clinical-regulatory-evidence/source-usage.service.ts (:362-400, :416-453)`, `server/services/clinical-regulatory-evidence/span-lineage.service.ts (:1049, :1150-1172)`, `client/src/concept2cure/v2/surfaces/ProjectHome.tsx (:350, :578-591)`, `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx (:945)`, `client/src/concept2cure/v2/surfaces/ProtocolDevSection.tsx (:163)`, `server/services/clinical-regulatory-evidence/__tests__/source-usage.pglite.integration.test.ts`
- **Owner:** source-usage.service.ts and span-lineage.service.ts are unclaimed. source-tracer-routes.ts was last changed in 352840f1 (…01GJidg5). ProjectHome.tsx was last changed by …01FSu2RL and …01KnUGoX. EctdCoauthor.tsx and ProtocolDevSection.tsx are unclaimed
- **Tests first:**
  - source-usage pglite: supersede a cited source through createSupersedingSource (not the direct SQL checksum rewrite at :195, :220, :247, :276), and the source-changes report lists the citation (red: always empty, :448-452)
  - The state of a span citing a superseded source reads 'superseded' (red: 'current')
  - 'Used in' counts a source used only by spans (red: 'Not cited yet')
  - Walk route: from a transmittal leaf to the source checksum, and from the source to the transmittal, reading recorded keys only (red: no route; LX-00's last hops turn green here)
  - EctdCoauthor and ProtocolDevSection mount Data Origins (red: no lineage prop)
  - 'Write from these sources' opens Authoring with the selection (red: ProjectHome.tsx:581)

### LX-15 — An engine's number enters a catalog document as a 'computed' span citing its computation, which is a Data Room source

- **Closes:** BS1, BS2, BS13, BS9, BS14, BS15, BS-M2-missed, BS5 (inputs persisted), CMC-9
- **Extends:** cre_evidence_sources through createSource, with source_type 'engine_computation'. That column has no CHECK (db/migrations/20260724_clinical_regulatory_evidence_spine.sql:37). checksum = sha256 of the canonical {engine, engineVersion, method, inputs, outputs}; provenance = the StatsProvenance shape (server/services/stats/computation-provenance.ts) plus the full inputs. Spans use document_span_lineage kind cre_evidence_source with usage 'computed', which the CHECK already allows (db/migrations/20260803_document_span_lineage.sql:136) and nothing writes today
- **Files:** `server/services/biostatistics-bridge/bridge-service.ts (:30-33, :292-345)`, `server/services/biostatistics-bridge/design-adapter.ts`, `server/routes/biostat-design-stats.ts`, `server/services/stats/computation-provenance.ts`, `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx (:240-259)`, `client/src/concept2cure/v2/authoringHandoff.ts (:73-127)`, `server/services/authoring/authoring-documents.ts (:587-614 createSection)`, `server/services/protocol-development/protocol-development-service.ts (:203-243)`, `client/src/concept2cure/v2/surfaces/biostatBridge.tsx (:397-424)`, `scripts/ci/check-lineage-save-gate.mjs`
- **Owner:** The biostatistics files are unclaimed: no lane in docs/work-orders/README.md covers them. authoring-documents.ts is WM …01U2hGiy's. protocol-development-service.ts is unclaimed
- **Tests first:**
  - pglite: apply-sample-size creates one engine_computation source whose provenance recomputes inputsSha256 and names the ana-biostats engine with a version derived from code (red: no source, and a 'c2c-stats 1.0.0' stamp)
  - Workbench 'Insert into document' records the N clause as a cre_evidence_source span with usage 'computed' citing that source (red: the user's author_assertion, authoring-documents.ts:593)
  - apply with an expected inputsSha256 and N that no longer match the design returns 409 (red: recomputed silently)
  - Gate selftest: a 'computed' span whose source is not an engine_computation is refused
  - The Data Room lists the computation, and 'Used in' names the protocol section (red: nothing)
- **Founder decision:** Under Rule 2 the Biostatistics and Biostat Workbench surfaces are not launch apps. Recommended scope now: publish only on the existing governed paths that end in catalog stores (apply-sample-size, Workbench insert, protocol sections). A publish control on the Biostatistics surface waits for D1–D10.

### LX-16 — The statistics engine stops writing wrong figures: non-inferiority power, achieved-vs-target power, silent defaults, a second browser engine

- **Closes:** BS8, BS-M1-missed, BS4, BS3, BS12, BS18
- **Extends:** server/services/ana-biostats/computation-engine.ts as the one engine (input-normalizer.ts keeps its effect-size refusal), and design-adapter.ts's statisticalPlan mapping
- **Files:** `server/services/ana-biostats/computation-engine.ts (:163-174)`, `server/services/biostatistics-bridge/design-adapter.ts (:260-261, :458-465)`, `server/services/biostatistics-bridge/__tests__/design-adapter.test.ts (:205-227)`, `server/services/ana-ri/command-executor.ts (:3008-3095)`, `client/src/concept2cure/v2/surfaces/Biostatistics.tsx`, `server/services/ana-biostats/document-generator.ts (:780-783)`, `server/services/statistical-defensibility-service.ts`
- **Owner:** Unclaimed. computation-engine.ts was last changed in 352840f1, design-adapter.ts in 55df6eae, Biostatistics.tsx in 1b9e24a2. command-executor.ts's L48 claim is released
- **Tests first:**
  - Non-inferiority with effectSize 0.05, margin -0.3, alpha 0.025, power 0.9 reports power ≥ 0.9 (red: 0.0442, 'inadequate')
  - design-adapter.test.ts re-derived from the patched design: applying twice leaves N unchanged (red: NI 384→12→6; superiority 390→392→394)
  - generate_sap or compute_sample_size without an effect size is refused (red: 0.5 filled in at command-executor.ts:3020)
  - The Biostatistics surface's verdicts equal the server's on the four presets, by calling the server (red: 4/4 differ)
  - The CSR §9.7 generator asserts ITT, the testing hierarchy or 'followed the SAP' only from inputs (red: asserted unconditionally)
- **Founder decision:** Deleting the browser BiostatEngine removes a user-facing computation. Per the Working agreement, the commit must name the replacement (the server engine route) and its parity test.

### LX-17 — CMC Module 3 files the approved, signed version with its lineage, and a stale approval cannot reach a sequence

- **Closes:** CMC-2, CMC-4, CMC-5, CMC-13, CMC-14, CMC-M1-missed, CMC-M3-missed, CMC-M4-missed, CMC-6 (filed half), CMC-12
- **Extends:** The coauthor_documents filing copy, c2c_document_aliases and the submission_leaves pin (the path LX-11 fixes); the electronic_signatures binding digest; and LX-15's engine_computation source for the compiled record (source ids with source_hash_at_compile)
- **Files:** `server/api/cmc/module3OperatingSystemRoutes.ts (:593-841 approve)`, `server/services/cmc/place-module3-into-submission.ts (:162-426)`, `server/services/cmc/final-export-gate.ts (:95-277)`, `server/services/cmc/module3-compile.ts (:193-254)`, `server/services/module3-convergence-service.ts (:574-725)`, `server/services/submission-package-orchestrator.ts (:1380-1470)`, `server/services/ectd/dispatch-readiness.ts`, `server/api/cmc/__tests__/module3OperatingSystemRoutes.test.ts`
- **Owner:** Unclaimed. Every CMC file was last written by …session_01GJidg5q1KFNfFT2VZyjcqw, which has no lane row. dispatch-readiness sits with the D7 lanes
- **Tests first:**
  - Approving a stale section is refused (red: stale is cleared at :716-720; the approve tests at :136-260 never use a stale row)
  - Approve, recompile, then place: the approved version's snapshot is filed, or placement refuses (red: the live row is filed, :356-364)
  - The §11.70 digest covers narrative_text (red: deterministic_json only, :702-714)
  - A placed CMC leaf's manifest lineage names the section, the approved version and the signature (red: canonicalId null)
  - A register edit after placement flags the leaf in dispatch readiness (red: nothing in ectd or submission-service reads cmc_module3)
  - The orchestrator's m3.compose refuses without section approval and the export gate (red)
- **Founder decision:** Whether CMC Module 3 placement is in the pilot's D7/D10 scope. Lineage inside CMC itself waits for D1–D10 under Rule 2: CoA and stability reports as Data Room sources, register versioning, contradiction history (CMC-1, CMC-3, CMC-7, CMC-8, CMC-11, CMC-M2).

### LX-18 — QMS controlled documents and the template library record content, not pointers

- **Closes:** OP-01, OP-02, OP/M-05-missed, OP-17 (template half)
- **Extends:** The authoring store as the one document store (decision 1 of the canvas design); frozen_documents/sectionsDigest as the content the approval digest binds (server/services/qms/document-approval-signature.ts); electronic_signatures
- **Files:** `server/services/qms/document-approval-signature.ts (:103-121)`, `server/routes/mdx-qms.ts (:356-397, :443-470, :628-676)`, `server/services/ana/AnaToolExecutor.ts (:13525-13575; revise :13665-13670)`, `server/routes/c2c/templates.ts (:121-155)`, `client/src/concept2cure/quality/SopRegister.tsx`
- **Owner:** QMS approval through the signature ceremony is claimed by …session_01WcyqbqWn6LszBqUWUSNnqA (P1-28/DP-31, bf5f3fec); hand this there. mdx-qms.ts was last changed in 6582e3a3 (…01FSu2RL). templates.ts was last changed by …01E8btkB (WO-16C)
- **Tests first:**
  - Approve a QMS document, then change its body: signature verification fails (red: the digest binds only the artifact_id pointer, :117)
  - Revise an effective document: the prior effective version and its content can still be retrieved (red: UPDATE in place)
  - Revise clears the prior approval block from the draft (red: kept)
  - A template upload records the sha256 of the source form (red: file name only)
- **Founder decision:** Whether QMS document bodies move into the authoring store. That is the zero-duplication answer, but it changes how QMS documents are edited.

### LX-19 — Producers outside the launch catalog cannot put unlineaged content into catalog stores in production (containment until D1–D10)

- **Closes:** OP-04, OP-05, OP-06, OP-07, OP-08, OP-09, OP-11, OP-12, OP-13, OP-14, OP-16, OP-18, OP/M-01..M-07-missed, SUB-12, AC-15, AC-19, BS11 (store half), BS17, DR-ANA-06, DR-ANA-15
- **Extends:** The launch-scope entitlement (shared/constants/launch-scope.ts; server/services/entitlements/launch-scope.ts), enforced at the API by the claimed D2/D6 lane, plus LX-01's widened gate baseline. Together they stop any API-only generator writing coauthor_documents, concept2cure_artifacts, rendered_leaf_files or submission_leaves in production
- **Files:** `server/middleware/moduleEntitlementGate.ts`, `server/services/entitlements/launch-scope.ts`, `scripts/ci/check-lineage-save-gate.mjs (baseline reasons)`, `server/routes/ind-lifecycle/filing.routes.ts (:165-243)`, `server/services/ectd/rendered-leaf-files.ts`
- **Owner:** 'Launch scope enforced at the API' (D2/D6) is claimed by …session_01E8btkB8mcLirW4rNvsMNxK (README:27). IND lifecycle filing is unclaimed
- **Tests first:**
  - With LAUNCH_SCOPE_ENFORCE on, these are refused: POST /api/nonclinical-summary/document, /api/ectd-documents, knowledge-base generate-*, /api/submission-orchestrator/runs (Mode B), /api/ind-generation, /api/biostat/continuum/* (red: mounted and answering)
  - If IND lifecycle is in the pilot, IND safety-report filing stores the adverse_event id and an inputs digest with rendered_leaf_files (red: the event comes from the request body only)
  - Each contained producer stays in LX-01's baseline, with its reason, until it writes through the gate
- **Founder decision:** Two decisions: which of these producers join the catalog after D1–D10; and whether data_lineage_records is retired in favour of span lineage on documents or made canonical for chat answers (today it holds answer-grain rows with no hash, and its append-only trigger is not on the deploy set).

## 5. Rule 2: what is launch-catalog work

Launch-catalog work (Rule 2 allows it). Everything on the founder's path is catalog work:
- Projects: Data Room capture and ProjectHome (LX-02, LX-03, LX-14).
- Vault: ingest identity, file-to-vault, History (LX-03, LX-10).
- Authoring: document-authoring, template-library, review, and protocol-dev, which joined the catalog on 2026-09-21 (shared/constants/launch-scope.ts:57-79). Fixes LX-06, LX-08, LX-09, LX-18, and the Protocol half of LX-15.
- Submission Center: ectd-coauthor, gateway-transmittals and the sequence workspace (LX-11, LX-12, LX-13).
- Submission Readiness: dispatch-readiness (LX-12, and LX-17's readiness flag).
- QMS controlled documents (LX-18).

The AnA conversation is a shell surface that can never be switched off (launch-scope.ts:131). So the stream and the canvas tool are catalog work too (LX-04 to LX-07). Every fix names D2, D4, D5 or D7/D10, and must file its red→green evidence under docs/evidence/<row>/.

Outside the catalog, and given no sessions of their own:
- the Biostatistics and Biostat Workbench surfaces;
- CMC ('cmc' is absent from launch-scope.ts, and LAUNCH_SCOPE_ENFORCE defaults to on in production: server/services/entitlements/launch-scope.ts:4-43);
- IND lifecycle, Report OS/Insights, HAQ Manager, labeling (USPI/SmPC), safety narrative, deep research, nonclinical, the CSR builder, the statistical continuum and the submission orchestrator.

How the fixes stay inside catalog paths:
1. Fix only two kinds of place. First, the seam where a side app's output enters a catalog store: an engine number entering an authoring or protocol section (LX-15), or a Module 3 section entering a sequence (LX-17). Second, a deterministic engine whose figure a catalog surface displays: protocol-dev shows the design's N and power (LX-16). Rule 2 already requires that engine figure to be right and traceable.
2. Add no surface, table or store. Engine outputs become cre_evidence_sources rows and 'computed' spans; both already exist in the schema, and no writer uses 'computed' today. 'Biostatistics publishes to the Data Room' is therefore a server write on its existing governed paths, not a new Biostatistics UI. Its UI waits for D1–D10, which is a founder decision in LX-15.
3. Contain what cannot be fixed yet. LX-19 relies on the claimed D2/D6 lane that enforces launch scope at the API, so API-only generators cannot put unlineaged content into coauthor_documents, concept2cure_artifacts, rendered_leaf_files or submission_leaves in production. LX-01's baseline lists each one with its reason.

The model clauses of Rule 2:
- LX-06 makes 'only approved, PQ-passed models serve high-risk drafting' checkable per document. Today the gate checks the served model, and the document then forgets it (authoring-draft-tool.ts:133-136).
- LX-05 removes a path where the model supplies its own evidence.
- LX-16 removes a model-produced defensibility score shown beside a deterministic judgment engine (BS18). It also removes silent default inputs, where a tool fills a figure no person chose (BS4).

Rule 1 (migrations):
- LX-08 (the append-only trigger on document_span_lineage) and LX-12 (a nullable sequence_id on submission_transmittals) are additive new files: guarded, inserted before the final sweep pair, with no DROP.
- LX-10 widens the alias store vocabulary. If that vocabulary is a CHECK, the creating migration is amended in place, with a dated header and a pg_get_constraintdef guard, per the NARROWED-replay corollary.
- The span-lineage CHECK replay break found earlier is already closed at HEAD (docs/work-orders/README.md:78).

Working agreement:
- LX-07 retires generate_document/author_docx_native and save_document_to_vault's artifact write.
- LX-16 deletes the browser BiostatEngine.
- Each commit must name the replacement file and the gate that proves it reachable.

Coordination. Several files sit in other sessions' 24-hour windows. Claim a row in docs/work-orders/README.md and hand over hunks rather than racing:
- authoring.router.ts: …01FSu2RL (fde9d704);
- submission-service.ts and SubmissionSeqWorkspaces.tsx: …015oLV2v (fc29f2d1);
- DocumentWorkbench.tsx: …01T2wooC.

The Veeva parity slices VR-08, VR-10, VR-14 and VR-16 already cover part of this ground. The fixes above depend on them rather than duplicate them.

## 6. Already closed

- **Replay safety of the span-lineage kinds.** Also the c2c doc-type and orchestrator run-status CHECKs: `ab237cdf`, `docs/evidence/D1-MIGRATION-CHECK-REPLAY/2026-09-25/`.
- **Governed lifecycle record** (`canonical_documents`, VR-03): append-only, write-once signatures, recomputing verifier, serialized transitions. `f9adda6a`, `docs/evidence/D5-LIFECYCLE-APPEND-ONLY/2026-09-25/`.
- **BS8, the first item of LX-16.** Non-inferiority and equivalence power are now the power of the sized test: `64a1d5c7`, `docs/evidence/D7-BIOSTAT-NI-POWER/2026-09-25/`.
