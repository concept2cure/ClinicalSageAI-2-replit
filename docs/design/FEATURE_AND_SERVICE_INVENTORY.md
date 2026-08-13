# Feature & Service Inventory — Concept2Cure / ClinicalSageAI

**Audience:** Claude Design — a build-from catalog of every module, feature, sub-feature, and backing service.
**Source:** Code-derived inventory (parallel swarm across the codebase), synthesized here. Not based on any current UI.
**Companion:** `docs/design/UI_CODEBASE_STUDY.md` (the advisory/UX study). This document is the exhaustive inventory.
**Date:** 2026-06-20

## How to read this
Organized **by domain → module → feature → sub-feature**. Each leaf carries:
- **path** — code location(s)
- **maturity** — ✅ Built (wired end-to-end) · 🟡 Partial (incomplete / UI-only / backend-only / legacy) · ⚪ Stub (placeholder/scaffold)
- **purpose** — one line
- **data** — backing tables / key fields / status enums (verbatim)
- **ops** — key endpoints/operations (route paths verbatim)
- **UI** — what the interface must show/let users do

Domains:
1. Submission modules (510k/PMA/IVDR/eCTD/Submission Center/transmission)
2. Biopharma (IND→NDA/BLA, CMC/Module 3, nonclinical, CER, pediatric)
3. Document authoring & lifecycle engine *(appended on completion)*
4. AnA AI layer (chat, commands, tools, proactive intelligence, governance)
5. Evidence, knowledge & integrations (Vault, RAG, connectors)
6. Specialist & quality (biostatistics/CSR/CDISC, device, QMS/CAPA, PV/post-market, correspondence, design-risk)
7. Platform, Global RI & cross-functional *(appended on completion)*

> Maturity reflects what the code shows; items the swarm could not fully confirm are marked 🟡/⚪ and gaps are listed per domain.

---

# DOMAIN 1 — SUBMISSION MODULES

## 1.1 Submission Center (core)
- **Submissions CRUD** — `server/routes/submissions.ts`, `server/services/submission-service/submission-service.ts` · ✅ · Lifecycle-aware submission records across regions/application types · data: `submissions`(id, title, productName, applicationType, clientType, primaryRegion, status `planning|active|submitted|archived`, lifecycleStage `planning|original|amendment|response|variation|annual|withdrawal`) · ops: `GET/POST /api/submissions`, `GET /api/submissions/:id` · UI: portfolio table (type/region/status filters), submission detail with region projections + lifecycle pill.
- **Submission regions** — `shared/schema/submissions.ts` · ✅ · Multi-region targeting + pathway · data: `submissionRegions`(region `fda|eu|jp`, pathway `ectd_v322|ectd_v40|estar|mdr|ivdr|ctis`, moduleProfileVersion, validationProfileVersion) · UI: region pills + pathway/version.
- **eCTD sequences (lifecycle ledger)** — `submission-service.ts` · ✅ · Versioned sequences (0000, 0001…) · data: `ectdSequences`(sequenceNumber, type `original|amendment|response|variation|annual|withdrawal`, status `draft|assembling|validated|frozen|dispatched`, validationStatus, dispatchStatus, frozenAt) · ops: `POST /api/submissions/:id/sequences`, `POST /api/submissions/sequences/:seqId/transition` (governed freeze/dispatch via `/api/c2c/actions/sign`) · UI: sequence list, status timeline, frozen/lock badge.
- **Submission leaves (CTD slot mapper)** — `submission-service.ts` · ✅ · Document→CTD-slot mapping (polymorphic source tables) · data: `submissionLeaves`(sectionCode e.g. "3.2.S.4.2", title, granularity, lifecycleOp `new|replace|append|delete`, documentTable, documentId, leafGuid, parentLeafId, checksum) · ops: `GET/PUT /api/submissions/sequences/:seqId/leaves` · UI: CTD tree (indented section codes, lifecycle-op color badges, source doc links); leaf mutations disabled when sequence frozen.

## 1.2 510(k) / De Novo
- **510(k) project & workflow** — `server/routes/510k-workflow-routes.ts`, `510k-estar-routes.ts`, `server/services/510kComplianceTracker.ts` · ✅ · Stage-gated device submission with 21 CFR Part 11 audit · data: `fda510kProjects`, `fda510kStageProgress`(workflowData JSON), `fda_510k_compliance_tracker` · ops: `GET/POST /api/510k-workflow/:projectId` · UI: stage stepper, completion %, validation checkpoints, audit trail (actor/action/timestamp).
- **FDA forms (3514/3601/3881/3654)** — `server/routes/fda-forms.routes.ts`, `server/services/FDAFormGenerator.ts` · ✅ · Auto-generate premarket forms · data: `fda510kDocuments`(documentType, htmlContent, formData, complianceScore, status) · ops: `GET /api/fda-forms/registry`, `GET /api/fda-forms/project/:projectId/forms`, `POST /api/fda-forms/project/:projectId/generate/:formType` · UI: forms list (status/completeness), per-form editors.
- **eSTAR submission** — `510k-estar-routes.ts` · 🟡 · eSTAR-format pathway · UI: eSTAR format selector in pathway chooser.

## 1.3 PMA
- **PMA project & phases** — `server/routes/pma-workflow-routes.ts`, `submissionCenter.routes.ts` · ✅ · Class III multi-phase task workflow · data: `project_charters.pma_config`(JSON phases/tasks), `submission_tasks`(status `pending|in-progress|completed|blocked`, priority `low|medium|high|critical`, module_type, completion_percentage) · ops: `GET/POST /api/pma-workflow/:projectId`, `GET/POST/PUT /api/submissionCenter/tasks` · UI: phase dashboard, task kanban/table, save state.

## 1.4 IVDR / IVD
- **IVDR classification (Annex VIII)** — `server/routes/ivdr-routes.ts`, `server/services/regulatory/ivdr-classification.ts` · ✅ · A/B/C/D risk classification engine · data: inputs (intendedPurpose, isSelfTest, isCompanionDiagnostic, detectsTransmissibleAgent, riskToPatient `low|medium|high`, analytes[]) → category + rule trace · ops: `POST /api/ivdr/classify` · UI: class badge, applied rule IDs, regulatory consequence.
- **Analytical validation / clinical evidence / CDx** — `ivdr-routes.ts` · ✅ · Performance + evidence + companion-diagnostic records · ops: `POST /api/ivdr/validation`, `/api/ivdr/clinical-evidence`, `/api/ivdr/cdx-workflow` · UI: validation matrix (LoD/LoQ, precision), 2×2 (sens/spec/PPV/NPV), CDx linkage.
- **Technical file (IVDR/MDR)** — `ivdr-binder-routes.ts`, `mdx-ivdr.ts` · ✅ (IVDR) / 🟡 (MDR) · Annex-based TOC + ZIP assembly · ops: `GET /api/submissions/sequences/:seqId/technical-file?regulation=ivdr`, `POST …/technical-file/assemble` · UI: TOC (path/label/annex/status), assemble card (file count, size, sha256, skipped items).
- **UDI / GUDID** — `udi-ivdr.ts` (stub), `mdx-ivdr.ts` · 🟡 · UDI-DI/UDI-PI lifecycle · UI: UDI input fields where required.

## 1.5 eCTD assembly & export
- **Module compilation** — `server/routes/ectd-compile.ts`, `server/src/services/ectd.ts` · ✅ · Assemble ICH M8 backbone + leaves · data: reads `project_sections`; `CompilationResult`(status `pending|compiling|validating|completed|failed`, modules[], xmlBackbone, validationResults, submissionReady) · ops: `GET /api/ectd-compile/:projectId/status`, `POST /api/ectd-compile/:projectId/compile` · UI: per-module progress, validation report (error/warning severity colors), XML preview.
- **Pre-compile validation** — same · ✅ · Section presence/status/required-field checks · data: `ValidationResult`(rule, severity `error|warning|info`, message, sectionCode, fix) · UI: validation table with fix suggestions.
- **XML backbone + MD5** — `ectd.ts` `buildECTDZip()` · ✅ · eCTD v3.2.2 index.xml (xlink:href, operation, md5) + index-md5.txt · UI: checksum manifest (technical view).
- **eCTD export & download** — `server/routes/ectd-export.ts` · ✅ · Governed ZIP generation · data: `generateEctdPackage()`; env `CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW` · ops: `POST /api/ectd/export/:submissionId` (governance affidavit { aiGenerated, humanReviewApproved, reviewerName/Role }) · UI: export modal (governance affidavit + validate checkbox), download link, audit log.
- **Document ingestion / classification** — `server/routes/ectd-documents.ts`, `server/services/ingestion/ingestion-service.ts` · ✅ · AI classify + structure extract into CTD slots · ops: `POST /api/ectd-documents/:id/classify`, `…/extract` (rate-limited) · UI: classification badge + confidence, extracted outline, claims with locators.

## 1.6 Submission AI & planning
- **Submission planner** — `submissions.ts`, `server/services/submission-ai/submission-ai-service.ts` · ✅ · AI gap analysis + module/form/timeline plan · ops: `POST /api/submissions/:id/plan` · UI: module map, forms checklist, timeline, gaps, dependencies.
- **Validation co-pilot** — same · ✅ · Explain validation findings · ops: `POST /api/submissions/:id/validation/explain` · UI: findings with AI cause+fix, blocking indicator.
- **Cross-region gap analysis** — same · ✅ · Regional deltas + bridging/translation scope · ops: `POST /api/submissions/:id/cross-region` · UI: per-region delta cards.
- **Dispatch QC (advisory)** — same · ✅ · Pre-dispatch readiness advisory · ops: `POST /api/submissions/:id/dispatch-qc` · UI: cleared/blocked + blocker/warning/checklist.

## 1.7 Truth engine, shadow review, dispatch
- **Provenance & consistency** — `submissions.ts`, `server/services/truth-engine/truth-engine-service.ts` · ✅ · Claim→evidence tracing; cross-ref audits · ops: `GET /api/submissions/:id/provenance`, `POST /api/submissions/:id/consistency-check` · UI: evidence tree, consistency findings (match/conflict).
- **Shadow review** — `submissions.ts`, `server/services/shadow-review/shadow-review-service.ts` · ✅ · Simulate reviewer (lenses `fda_filing|ema_d120|pmda|nb_mdr|nb_ivdr`) · data: findings(dimension `rtf|crl|format|nb`, severity `critical|major|minor|info`, status `open|accepted|fixed|waived`), rtf/crl risk scores · ops: `POST/GET /api/submissions/sequences/:seqId/shadow-review`, `GET /api/submissions/shadow-review/:runId/findings` · UI: lens selector, risk scores, findings with status toggles.
- **Dispatch gate (deterministic)** — `submissions.ts` · ✅ · Server-computed gate (validation errors=0, unacked shadow criticals=0, shadow run required) · ops: `GET /api/submissions/sequences/:seqId/dispatch-readiness` · UI: cleared/blocked banner, findings table.
- **Governed freeze & dispatch** — `submission-service.ts` · ✅ · Irreversible transitions behind e-signature · ops: freeze/dispatch require `signatureActionId` from `POST /api/c2c/actions/sign` (target `ectd-sequence:<seqId>`) · UI: re-auth modal (password+TOTP) → frozen/dispatch confirmation.

## 1.8 Transmission (gateways)
- **Gateway transmit** — `server/routes/mdx-submission-gateway.ts`, `server/services/submission-gateways/index.ts` · ✅ · Wire to agency gateways · ops: `GET /api/mdx/gateways`, `POST /api/mdx/gateways/:region/:gateway/transmit` (bundle{path,sha256,sizeBytes,format}, reason≥8, reauth), `GET /api/mdx/gateways/transmittals[/:id/status|/ack]` · UI: gateway selector + config status, transmit modal (bundle integrity, reason, re-auth), transmittal table, ACK viewer.
- **FDA ESG** — `submission-gateways/fda-esg.ts` · ✅ (AS2) / 🟡 (SFTP) · AS2 over HTTPS mTLS + SFTP fallback; ack1/ack2/ack3 · data: env `FDA_ESG_*` · UI: transmission log, MDN status, ack progress.
- **EMA CESP / EUDAMED** — `submission-gateways/ema-cesp.ts` · ✅ (CESP) / 🟡 (EUDAMED) · OAuth2 multipart upload + basket polling; EUDAMED device/cert/vigilance/CAPA · UI: basket status; EUDAMED registration panels.
- **PMDA gateway** — `submission-gateways/pmda-gateway.ts` · ✅ · mTLS + HMAC, eCTD-JP multi-byte (UTF-8 BOM), receipt/pre-check/review-accepted · UI: ack-type badges.
- **ICSR/E2B(R3)** — `server/services/ind-lifecycle/icsr-gateway-transport.ts` · 🟡 · Adverse-event report transmission · UI: ICSR transmission panel.

## 1.9 Readiness, rules, profiles, templates
- **Validation rules corpus** — `submissions.ts` · ✅ · Named/sourced eCTD rules · data: `ValidationRule`(category `structure|backbone|lifecycle|integrity|format|naming|content`, regions, severity, enforcement) · ops: `GET /api/submissions/validation-rules?region=` · UI: rules library (filter/search).
- **Market specs & formatting** — `submissions.ts` · ✅ · Per-market file naming/PDF/encryption/checksums · data: `MarketSubmissionSpec`(family `ectd|estar|eu_mdr|eu_ivdr|ctis`, formatting{fileNaming, pdfVersions, maxFileSizeMb, checksumAlgorithm}) · ops: `GET /api/submissions/market-specs`, `POST /api/submissions/market-specs/:specId/validate` · UI: spec browser, formatting validation report.
- **Requirements & designations** — `submissions.ts` · ✅ · Required docs/forms; expedited-pathway eligibility · ops: `GET/POST /api/submissions/requirements[/assess]`, `GET/POST /api/submissions/designations[/assess]` · UI: requirements checklist, designation questionnaire + eligibility results.
- **Change classification** — `submissions.ts` · ✅ · Categorize amendments by impact · data: `ChangeCategory`(sequenceType `variation|amendment|annual|response`) · ops: `GET/POST /api/submissions/change-categories[/classify]` · UI: recommendation cards.
- **Region profiles** — `submissions.ts` · ✅ · Agency metadata (language, pathways, Module 1, forms) · ops: `GET /api/region-profiles[/:region]` · UI: profile card with Module 1 section tree.
- **Pathway readiness & manifest** — `submissions.ts`, `server/services/pathway-engines/index.ts` · ✅ · Non-eCTD pathway readiness + TOC (CTIS/MDR/IVDR/eSTAR/PMDA) · ops: `GET /api/submissions/sequences/:seqId/pathway-readiness|pathway-manifest` · UI: readiness card, manifest TOC (present/missing/optional-absent).
- **Document templates & section gen** — `submissions.ts` · ✅ · Section skeletons + AI authoring with citations · ops: `GET /api/submissions/document-templates[/:id]`, `POST /api/submissions/:id/sections/generate` (SSE) · UI: template browser, generation panel (evidence list, streaming, inline citations, ungrounded warning).
- **Capabilities discovery** — `submissions.ts` · ✅ · Runtime feature flags · ops: `GET /api/submissions/capabilities` · UI: admin feature/gateway status.
- **Dossier persistence/readiness** — `server/routes/dossier_routes.ts`, `dossier-readiness.ts` · ✅ / 🟡 · Intelligence-report dossiers · ops: `POST /api/dossier/save-intelligence-report`, `GET /api/dossier[/:id]` · UI: dossier browser/detail.

**Domain 1 gaps:** EUDAMED device/vigilance flows partial; ICSR/E2B(R3) form generation not exposed; IND Form 1571/1572 routes not found; post-approval variation workflows partial; client workspace surfaces (K510/PMA) not in this layer.

---

# DOMAIN 2 — BIOPHARMA (IND→NDA/BLA, CMC, NONCLINICAL, CER, PEDIATRIC)

## 2.1 IND → eCTD lifecycle
- **IND submission assembly** — `server/routes/ind*.ts`, `server/services/ind-lifecycle/` · ✅ · Build/track IND submissions and sequences · data: IND submission + sequence records; safety-report obligation enum `SEVEN_DAY|FIFTEEN_DAY|NOT_REPORTABLE` · ops: IND submission/sequence/section endpoints (`/api/ind*`) · UI: IND project home, sequence ledger, section status.
- **Master data** — `server/services/ind-master-data/` · ✅ · Sponsors / agents / investigators registry · UI: master-data manager.
- **Safety reports (7/15-day)** — `ind-lifecycle/` · ✅ · Expedited IND safety reporting · data: obligation enum above · UI: safety-report queue with deadline clocks.
- **Annual reports / amendments** — `ind*.ts` · ✅ · IND annual report + amendment sequences · UI: report builder, amendment tracker.
- **AutoDraft / forms / PDF** — `ind-autodraft*`, `ind-forms`, `ind-pdf` · 🟡 · AI section drafting + form/PDF rendering · UI: autodraft panel, form/PDF preview.
- **KPI / portfolio** — `ind-kpi` · 🟡 · IND program KPIs · UI: portfolio dashboard.

## 2.2 CMC / Module 3
- **CMC projects & specifications** — `server/routes/cmc*.ts`, `server/services/cmc/` · ✅ · Drug substance/product, specs, analytical methods, impurities · data: CMC project + specification/method/impurity tables · ops: `/api/cmc/*` · UI: CMC module map, spec/method/impurity editors.
- **Manufacturing & stability** — `server/services/cmc/` · ✅ · Process steps + stability studies/batches · UI: process flow, stability matrix, batch records.
- **Control strategy & blueprint** — `server/services/cmc/control-strategy-generator.ts`, `auto-draft-composer.ts` · ✅ / 🟡 · ICH Q14 control strategy + AI blueprint · UI: control-strategy editor.
- **Module 3 build/readiness (AnA)** — `module3-*` commands (see Domain 4) · ✅ · build-all/section, missing-inputs, stale detection/refresh, readiness, contradictions, lineage, classify-source · UI: per-section status/staleness, readiness gate, contradiction list, evidence lineage.
- **ICH compliance & variations** — `cmc` · 🟡 · ICH matrix + post-market change classification · UI: compliance matrix, variation classifier.

## 2.3 Nonclinical / preclinical
- **Study registry** — `server/routes/nonclinical.ts`, `preclinical.ts` · ✅ · GLP-compliant tox/pharm studies, IACUC-linked · data: study + finding tables · UI: study registry, finding classification.
- **SEND packaging & validation** — `server/services/nonclinical/` · ✅ · SEND dataset packaging + conformance; Module 4 deliverables · UI: SEND validation report.
- **Module 2.4/2.6 summaries** — AnA tools `draft_nonclinical_overview_m2_4`, `draft_nonclinical_summaries_m2_6` · ✅ · CTD nonclinical summaries · UI: summary editors.

## 2.4 PDEV → IND readiness
- **Activity registry & state** — `server/routes/pdev*.ts`, `server/services/pdev/` · ✅ · Closed-enum activities (4 workstreams × 5 stages) with per-program state · data: activity state enum `not_started|drafting|ai_draft_generated|evidence_linked|human_review_required|in_review|changes_requested|approved|locked|submission_ready|submitted|agency_feedback_received|revision_required|superseded` · ops: `POST /api/pdev/programs/:programId/readiness/snapshot` · UI: workstream board, readiness snapshot.
- **Workstream intelligence (CMC/nonclinical/clinical/regulatory)** — `pdev/` · ✅ · Per-workstream readiness intelligence · UI: workstream cards.
- **AI drafting / evidence attach / eCTD compile / contradictions** — `pdev-ai-drafting.ts` · 🟡 · Section drafting, evidence linking, compile, contradiction bridge · UI: drafting + evidence + contradictions panels.
- **FDA interactions & IND assembly gate** — `pdev/` · ✅ / 🟡 · Type A/B/C interactions; IND assembly gate · UI: interaction log, assembly gate.

## 2.5 CER (EU MDR Annex XIV)
- **CER generation & conformance** — `server/routes/cer-routes.ts`, `cerv2-*.ts`, `server/services/cer/` · ✅ · CER drafting + conformance validation · UI: CER builder, conformance report.
- **Clinical evidence & GSPR** — `cer/`, `gspr-postmarket` · ✅ / 🟡 · Evidence management + GSPR catalog/mappings · UI: evidence panels, GSPR checklist.
- **Post-market docs (PMS/PMCF/PSUR)** — see Domain 6 GSPR · ✅ · PMS/PMCF plans, PSUR, SSCP · UI: post-market document editors.

## 2.6 Pediatric & programs
- **Pediatric (PREA/PIP)** — `pdev`/pediatric · ⚪ · PIP lifecycle (framework only) · UI: PIP tracker (TBD).
- **Programs & submissions** — `server/routes/biopharma*.ts`, `biologics*.ts` · ✅ · Multi-region submission planning; program registry; BLA biologics workbench (analytical similarity, comparability, immunogenicity) · ops: `GET /api/biopharma/ctd/structure?region=&module=`, `POST /api/biopharma/bla/analytical-similarity` · UI: program registry, BLA workbench, CTD structure browser.
- **Evidence objects & linkage** — see Domain 5 · ✅ · cross-cutting evidence registry.

**Domain 2 gaps:** pediatric waiver tracking, manufacturing process validation, post-IND amendment automation, AE intake dedup, portfolio rollup all partial/stub; eCTD validation refinement pending.

---

# DOMAIN 3 — DOCUMENT AUTHORING & LIFECYCLE ENGINE

## 3.1 Editor & section workspace
- **Editor core** — `client/src/concept2cure/components/editor/`, `authoring/workbench/Workbench.tsx` · ✅ · TipTap/Prosemirror rich-text bound to artifact content · data: editor state ↔ `concept2cureArtifacts.content` (TipTap JSON), section context from `AuthoringContextPack` · ops: formatting, markdown↔JSON, filler-text detection · UI: formatted text + inline citations, outline tree with readiness badges, contradiction/evidence-gap warnings, comment sidebar.
- **Section workspace layout** — `authoring/shell/OutlineTree.tsx`, `shell/TopBar.tsx` · ✅ · Section-scoped context + cross-section nav · data: CTD section paths (e.g. "2.5.1","m3.2.P.1"), `IND_SECTIONS` registry · UI: outline tree w/ status, breadcrumb, floating readiness badge, linked-sections grid.
- **Artifact editor panel** — `authoring/artifact/Artifact.tsx` · ✅ · View/edit artifact w/ versioning + provenance · data: `concept2cureArtifacts`, `concept2cureArtifactVersions`, `concept2cureProvenanceEvents` · UI: title+CTD+status badge, version dropdown/diff, readiness+blockers, citations w/ confidence.
- **Editor extensions** — `components/editor/extensions/IndentExtension.ts` · ✅ · Hierarchical lists/indentation/block formatting · UI: formatting toolbar.

## 3.2 Generators (machine-authored drafts)
- **AnA-RI artifact generator** — `server/services/ana-ri/artifact-generator.ts`, `ana/authoring-plan-generator.ts` · ✅ · Intent→governed artifacts (memos, section drafts) · data: `ArtifactGenerationRequest/Result`(qualityGrade, persistenceStatus) · UI: action buttons, draft preview, quality grade + warnings.
- **Authoring plan generator** — `ana/authoring-plan-generator.ts` · ✅ · Pre-authoring guidance (sources/cross-refs/risks/contradictions) · data: `AuthoringPlan`(status draft→pending_approval→approved→executed→rejected) · UI: Sources/Cross-refs/Risk-factors/Readiness tabs.
- **Statistical artifact gen** — `biostatistics-judgment/statistical-artifact-generator.ts` · 🟡 · Stat summaries/tables from CDISC · UI: stat table editor, p-value/CI badges.
- **Ana-biostats doc gen** — `ana-biostats/document-generator.ts` · 🟡 · Clinical/stat narratives · UI: template style picker, confidence scores.
- **Biotech artifact gen** — `biotech-artifact-generator.ts` · 🟡 · CMC/nonclinical scaffolds · UI: template picker, auto-filled fields.
- **CMC control-strategy gen** — `cmc/control-strategy-generator.ts` · ✅ · Control strategy narrative · UI: parameter table (criticality/limits/method) + evidence links.
- **IND autodraft renderer** — `ind-lifecycle/ind-document-renderer.ts` · 🟡 · Render IND module sections → HTML/PDF · UI: section preview + edit.
- **Report generator** — `report-generator-service.ts` · 🟡 · Readiness/compliance/snapshot reports · UI: report download, CSV export.
- **SOP generator** — `sop-generator.ts` · ⚪ · SOPs from procedures · UI: procedure editor→generate.
- **DEFINE-XML gen (CDISC)** — `cdisc/define-xml-generator.ts` · ✅ · DEFINE.xml 2.1 from ADaM/SDTM metadata · UI: variable map tree, completeness check.
- **STF gen (eCTD)** — `ectd/stf-generator.ts` · ✅ · Sequence Transmittal Form XML · UI: STF preview, edit app/sequence/type.
- **PDF bookmark gen (eCTD)** — `ectd/pdf-bookmark-generator.ts` · ✅ · TOC bookmarks in eCTD PDFs · UI: PDF preview w/ bookmarks.

## 3.3 Templates & scaffolding
- **Template catalog** — `templateService.ts`, `regulatory/templateCatalog.ts` · ✅ · Registry of regulatory templates · data: `documentTemplates`(category, contentType, wordCountRange) · ops: list by category/program, clone→artifact · UI: template gallery, "Use template".
- **eCTD fallback / nonclinical / clinical CSR / regional CTD templates** — `templates/ectd-fallback-templates.ts`, `nonclinical-templates.ts`, `clinical-csr-templates.ts`, `regional-ctd-templates.ts` · ✅ · Module skeletons + region-specific (FDA/EMA/PMDA/HC) · UI: region selector, section-requirements checklist.
- **Template validator/seeds/registry** — `intelligence/template-validator.ts`, `template-seeds.ts`, `template-registry.ts` · ✅ · Validate completeness + recommend per project · UI: validation report (R/A/G), recommended templates.
- **Industry context / outcome-based learning** — `industry-context-templates.ts`, `innovation/outcome-based-template-learning-service.ts` · 🟡 · TA-specific guidance + success-rate learning · UI: TA context panel, success-rate badge.

## 3.4 Autosave & versioning
- **Document versioning core** — `shared/schema.ts`(documentVersions, concept2cureArtifactVersions), `documentAuthoring.routes.ts` · ✅ · Immutable version history (SHA-256 checksum) · ops: `POST /documents/:id/version`, `GET /documents/:id/versions[/:versionNumber]` · UI: version drawer, diff viewer, "revert to version" (creates new version).
- **Autosave/checkpointing** — conversation-os, artifact proposal · 🟡 · Interval/blur save, non-blocking, dedup · ops: `POST /api/autosave` · UI: "Saving…/Saved at HH:MM" indicator, offline queue.
- **Artifact proposal service** — `conversation-os/artifactProposalService.ts` · ✅ · Propose→accept→apply artifact mutations · UI: preview→accept flow.
- **Artifact writeback** — `compute/artifactWriteback.ts` · ✅ · Persist artifact + immutable version + provenance · (backend).

## 3.5 Collaboration & track changes
- **Comments & annotations** — `shared/schema.ts`(documentComments, concept2cureReviewComments/Threads) · ✅ · Block/inline comments + resolution · data: status `open→resolved|rejected|incorporated` · ops: `POST/PATCH /comments`, `GET /artifacts/:id/comments` · UI: margin bubbles, thread panel, resolve w/ note, filter.
- **Document locks** — `shared/schema.ts`(documentLocks), `documentOrchestrationRoutes.ts` · ✅ · Exclusive/shared/section locks, auto-release 15min · ops: `POST/DELETE /lock` + heartbeat · UI: "locked by X until HH:MM", request/take-over, lock badge.
- **E-signatures (see 3.9)** · ✅.
- **Review workflow & approval gating** — `shared/schema.ts`(concept2cureReviewAssignments/Decisions, workflowApprovals), `authoring-actions.ts` · ✅ · Route artifacts through review/approval · data: approvalPath `single_reviewer|regulated_dual_review|qa_lock|signoff_required` · ops: `POST /promote-to-review`, `PATCH /review/:id/decision`, `GET /review-queue` · UI: assignment form, decision radios, review history, approval badges.
- **Track changes / diff** — implicit in version changeDescription · ⚪ · Visual diff highlighting (UI rendering incomplete) · UI: compare-versions modal (insert green/delete red).
- **Document sessions/presence** — `shared/schema.ts`(documentSessions), `document-routes.ts` · 🟡 · Who's editing now (real-time sync incomplete) · UI: "currently editing: …" avatars, cursor hints.

## 3.6 Export & render
- **DOCX export** — `export/docx-ledger-export.ts`, `cerv2-export-routes.ts`, `tenant-export.ts` · ✅ · Artifact→.docx w/ styles/footnotes/audit metadata, SHA-256 hash · ops: `POST /cerv2/export`,`/ectd/export` · UI: "Export as DOCX", governance checkbox, progress, toast.
- **DOCX ledger XML builder** — `export/docx-ledger-xml.ts`, `-embedder.ts`, `-collector.ts` · ✅ · OOXML (document/styles/numbering) + audit footer · (backend).
- **PDF export** — `authoring-pdf.routes.ts`, `ectd/pdf-bookmark-generator.ts` · ✅ · Artifact→PDF w/ bookmarks + audit, hash · ops: `POST /api/authoring/pdf/:artifactId` · UI: "Export as PDF", preview modal.
- **eCTD export (ZIP)** — `ectd-export.ts`, `ectd/assemble-from-core.ts` (canonical; drives `submission-gateways/regional-packager.ts`) · ✅ · ICH eCTD v3.2.2 structure over the submission spine (rendered PDF leaves, MD5 index) · ops: `POST /api/ectd/export/:submissionId` (submissions.id) · UI: region/type dialog, validation report, download.
- **eCTD validation & publishing** — `ectd-export.ts`(/validate), `document-understanding.ts` · ✅ · Completeness + cross-module consistency · ops: `POST /api/ectd/export/:submissionId/validate` · UI: ✓/⚠/✗ per section, "proceed to submission" gate.
- **Release hash generator** — `export/ReleaseHashGenerator.ts` · ✅ · SHA-256 for integrity · data: stored in `concept2cureSubmissionSnapshots.contentHash` · UI: copyable hash, print.
- **CERV2 device export** — `cerv2-export-routes.ts`, `cerv2-document-routes.ts` · ✅ · 510(k)/PMA device exports (predicate comparison, biocompat) · UI: export device summary, predicate picker.
- **Governed export consequence** — `export/governedExportConsequence.ts` · 🟡 · Downstream effects of export · (background notifications).

## 3.7 QC / readiness / preflight / contradiction
- **Section preflight (Pass 5)** — `shared/types/authoring-context.ts`(SectionPreflightResult), `authoring-actions.ts` · ✅ · 5-point QC (bodyExpectations, contradictions, crossSectionConsistency, approvedBaselineCompare, readiness) → `ready|blocked|provisional|needs-review|needs-reapproval` · UI: 5-part checklist (R/A/G) + recommended-action buttons.
- **Module preflight (Pass 6)** — same(ModulePreflightResult) · 🟡 · Aggregate sections (counts + major blockers) · UI: module dashboard, section grid, "promote module".
- **Dossier preflight (Pass 7)** — same(DossierPreflightResult) · ⚪ · Aggregate modules · UI: dossier dashboard, module grid.
- **Contradiction detection & resolution** — `intelligence/cross-artifact-consistency[-scanner].ts`, ContradictionEntry · ✅ (engine) / 🟡 (Wave-3 bridge) · Detect/resolve inter-artifact conflicts · data: ContradictionEntry(severity `critical|major|minor`, relatedObjectIds) · UI: contradictions panel, detail, "resolve" → Wave-3.
- **Governed readiness evaluation** — `control-plane/readiness-gates.ts`, `regulatory/readinessEvaluator.ts` · ✅ · LifecycleReadinessLevel + score + blockers · UI: readiness badge, score, blocker list.
- **Medical-writing QC** — `ana/medical-writing-qc.ts`, `documentQuality/rules/concept2cureMedicalWritingRules.ts` · ✅ · Terminology/evidence-discipline/citation rules · UI: inline underlines + tooltips, QC issues panel, ignore-w/-reason.
- **Quality lint / PDF validation / standardization QC** — `documentQuality/qualityLintService.ts`, `pdfValidationAttachment.ts`, `ivd-knowledge/scientific/standardization-qc.ts` · 🟡 · Completeness/structure; PDF watermark; CDISC standards · UI: lint report, CDISC compliance report.

## 3.8 Governed document evaluation fabric
- **Governed document evaluator** — `server/src/control-plane/governed-document-evaluator.ts` · ✅ · Single entry for evaluating mutations (readiness+gates+consequences) · data: `GovernedDocumentEvaluation`(decision `allow|block|review|degraded`) · (backend).
- **Document context resolver** — `control-plane/document-context-resolver.ts` · ✅ · Resolve regulatory/placement context · (backend).
- **Readiness gates/engine** — `control-plane/readiness-gates.ts`, `orchestration/readiness-engine.ts` · ✅ · draft→…→publish_ready; blocker categories · UI: readiness badge + blockers.
- **Placement authority** — `control-plane/placement-authority.ts` · 🟡 · Canonical CTD placement (rules + ML suggestion) · data: `PlacementAuthorityDecision`(canonicalDestination, allowedDestinations) · UI: suggested placement + picker.
- **Export gate / publish gate** — `control-plane/export-publish-gates.ts` · ✅ · Eligibility gates (export + stricter publish/dispatch) · data: gateChecks, blockingReasons, remediationSteps · UI: gate results in export/publish dialogs.
- **Downstream consequences** — `control-plane/document-consequence-engine.ts`, governed-document-fabric.ts(ConsequenceType) · ✅ · open_blocker/create_review_requirement/mark_section_stale/notify_stakeholder/… · UI: consequences panel, manual-action checkboxes.
- **Governed decision repository** — `governed-decision-repository.ts` · 🟡 · Persist/audit decisions · (backend audit).
- **RIM learning emitter** — `governed-document-evaluator.ts`(registerFabricDecisionEmitter) · 🟡 · Emit decisions to RIM learning · (background).

## 3.9 Part 11 / e-signature / freeze / lock / audit
- **Part 11 engine** — `part11-compliance.ts`, `part11ComplianceService.ts`, `ana-ri/part11-governance.ts` · ✅ · §11.50 meaning, §11.100 manifest, §11.10(e) audit, §11.200 auth · data: signature meaning enum, auth (password+MFA) · ops: createElectronicSignature, verifyUserCredentials, verifyMfaToken, buildSignatureManifest · UI: e-sign dialog (password+MFA+meaning), manifest display, history.
- **E-signature route** — `esignature.ts` · ✅ · verify-password/verify-mfa/sign · ops: `POST /api/esignature/verify-password|verify-mfa|sign` (re-verify both factors at signing) · UI: signature verification.
- **Signature meaning capture (§11.50)** — `part11-compliance.ts` · ✅ · meaning enum `authorship|review|approval|rejection|verification|authorization|acknowledgment|witnessing|responsibility|custom` · UI: meaning dropdown + custom text + signature block.
- **Manifest & hash (§11.100)** — `part11-compliance.ts` · ✅ · printed name/title/org/time/meaning + SHA-256 · UI: signature-block preview.
- **Immutable audit trail (§11.10(e))** — `shared/schema.ts`(documentAuditTrail, deviceAuditTrail), `auditService.ts` · ✅ · append-only access/modify/sign log + integrity hash · ops: `auditService.logAction(...)` · UI: audit viewer (filters), tamper alert.
- **Locks/freeze, revocation, MFA, integrity** — documentLocks, electronicSignatures(revoked*), `mfaService.ts`, part11 data-integrity tests · ✅ · Lock for submission, revoke w/ reason, TOTP 2nd factor, tamper detection · UI: lock-for-submission, revoke dialog, MFA field, integrity badge.
- **Part 11 governance gates (AnA)** — `ana-ri/part11-governance.ts` · 🟡 · Gate AnA artifact export on approval · UI: export-gate validation.

## 3.10 Authoring actions (Wave 1/2/3)
- **Wave 1 (core)** — authoring-context.ts(AuthoringActionId), `authoring-actions.ts` · ✅ · resume_last_section, draft_section_from_context, explain_promotion_blockers, compare_against_approved, promote_to_review · ops: `POST /api/authoring/actions/:actionId` · UI: action buttons, nav hints, draft preview.
- **Wave 2 (section intelligence)** — AuthoringActionWave2Id · ✅ · correction_draft, harmonize_sections, section_contradictions, resolution_changelog, module_readiness · UI: correction/harmonize buttons, contradiction modal.
- **Wave 3 (contradiction resolution)** — AuthoringActionWave3Id · 🟡 · plan/execute/explain_contradiction_resolution, project_resolution_status · UI: resolution options, decision-record link, changelog.

## 3.11 Conversation OS & knowledge assembly
- **Conversation threads** — `shared/schema.ts`(concept2cureConversations/Messages), `conversation-os/` · ✅ · user+AnA messages + artifact proposals · UI: chat transcript, accept/refine, proposal preview.
- **Governed AnA execution** — `governed-ana-execution.ts` · ✅ · Generate→validate (quality gates)→persist→audit · UI: quality-gate results, low-confidence badge.
- **AI action handlers** — `ai-actions/handlers/`(promote-artifact, export-document) · 🟡 · Backend handlers for AI doc actions · UI: action buttons + progress.
- **Body-aware authoring / content assembly** — `body-aware-authoring.ts`, contentAssembly, `ana-biostats/document-generator.ts` · 🟡 · Section body expectations; assemble from sources · UI: expectations panel, generate-section w/ source attribution.
- **RAG router** — `ragRouter.ts` · ✅ · Route retrieval to project/regulatory/evidence indices · (internal).
- **Citation engine & export** — `ana/citation-engine.ts`, `citation-export.ts` · ✅ / 🟡 · Sentence-level citations + provenance; BibTeX/RIS/CDISC export · UI: citation badges, "view sources", export citations.
- **Document search** — `ana/document-search-core.ts` · ✅ · Full-text + semantic over artifacts · UI: search box, ranked results.

## 3.12 Lifecycle readiness & submission
- **Submission readiness engine** — `regulatory/submission-readiness.ts`, `readinessEvaluator.ts` · ✅ · Aggregate readiness across modules · UI: submission dashboard, module grid, blockers.
- **IND / CMC readiness** — `ind-lifecycle/ind-readiness-service.ts`, `cmc/readiness.ts` · ✅ · Section-level readiness · UI: checklists.
- **Specialized generators** — `sap-generator-service.ts`, `gspr-postmarket/pmcf-plan-generator.ts`, `academic-document-processor.ts` · 🟡 · SAP, PMCF plan, academic-lit ingestion · UI: generate buttons, extracted-metadata editor.

**Domain 3 status enums:** ArtifactStatus `draft|review|approved|locked|archived`; LifecycleReadinessLevel `draft|evidence_gap|review_ready|approval_ready|export_ready|publish_ready|blocked|degraded`; GovernedMutationIntent `create|update|place|relocate|promote|approve|lock|export|publish|dispatch|archive|rollback|compile|refresh`; SignatureMeaning (10 values); BlockingCategory (12 values); ArtifactSourceSystem `ana_ri|cerv2_510k|cerv2_pma|cerv2_cer|authoring_actions|document_builder|report_engine|safety_narrative|ectd_compiler|cmc_builder|ind_autodraft`.

**Domain 3 gaps:** autosave persistence path unclear; template-validator not wired to a route; Wave-3 routes partial; module/dossier preflight services missing; placement ML undefined; real-time collab (presence/cursors) stubbed; track-changes diff UI incomplete; dual versioning models (documentVersions vs concept2cureArtifactVersions) — system-of-record ambiguous; 6 QC tables defined but unused.

---

# DOMAIN 4 — AnA AI LAYER

## 4.1 Streaming chat & message lifecycle
- **SSE event stream** — `server/routes/ana-ri/stream.ts`, `post-processing.ts` · ✅ · 14 event types: `status · thread_id · orchestration · thinking · step · tool_use · tool_result · text · artifact_draft · done · grounding_strip · post_done · error · warning` · UI: streaming answer, collapsible thinking, tool-call rows, evidence chip, action chips, latency/fallback badges.
- **Client chat** — `client/src/concept2cure/components/ana/`(Ana, ChatView, Message, Composer, Sidebar, TopBar, ToolPicker, EmptyState, GovernedActionSignoff) + hooks `useAnaChat`, `useGovernedAction`, `useRecents` · ✅ · Message lifecycle, attachments, edit-and-regenerate · UI: chat surface, recents, governed-action modal.
- **post_done payload** — carries executedActions, executedCommands, enrichmentSources, evidence + evidenceDiscipline, structure score, grounding counts, reliability.

## 4.2 Command executor (governed mutations + ops)
- **Command map** — `server/services/ana-ri/command-executor.ts` · ✅ · ~66 core + ~32 MDX + PDEV commands. Groups: project (create/list/update_project); artifact (create/update/update_artifact_status*, list, compare_versions, review_version_impact, revert_to_version*‡, export_artifact); dossier (place_in_dossier*‡, check_dossier_readiness); task; milestone (create_milestone*, update/list); document governance (draft_section, freeze_document*‡, sign_document*‡, submit_document*‡, export_document, generate_checklist); submission (create_submission_package*‡, create_review_thread, add_review_comment); search (search_artifacts, search_precedents); biostatistics (generate_sap, compute_sample_size, compute_dose_escalation, assess_defensibility); intelligence (run_submission_assessment, detect_drift, predict_next_artifact, compute_readiness, scan_contradictions, run_rim_scan); analysis (analyze_cross_document, analyze_jurisdictions, analyze_cms_strategy, assess_diagnostic_validation, recommend/evaluate_endpoints, generate_report, generate_clinical_insights); Module-3 (module3_build_all/build_section/missing_inputs/stale_sections/refresh_stale/readiness/contradictions/lineage/classify_source; cmc_status, ich_compliance, control_strategy, variations_classify); MDX 510k/Q-Sub (q_sub.*, section.approve/update, k510_workflow.preflight/transmit*‡); PDEV→IND (ind_project/study.*, ind_*.draft, ind_submit_package.create, ind_transmit_to_fda); user (load_user_context, load_conversation_history, export/erase_personal_data); team (list_team_members); audit (audit.explain, k510_workflow.document_preview). `*`=reason-for-change; `‡`=e-signature. · UI: action chips → workspace reflection; governed-action sign-off where flagged.

## 4.3 Tools (~195, grouped)
- **Tool definitions** — `server/services/ana/AnaToolDefinitions.ts` · ✅ · Groups: evidence/literature (ClinicalTrials.gov, PubMed, FDA searches, ChEMBL, CMS coverage, preprints), guidance/design (study design, estimand E9R1, RWE, risk management, regulatory pathway, special designations, CTD, ICH/FDA lookups, deficiency taxonomy), statistical, clinical/safety, device/diagnostics (~20), CMC/manufacturing, nonclinical, labeling/documentation, medical-writing/QC, regulatory intelligence, compliance/quality, evidence/provenance, regulatory submissions, study management, post-approval/lifecycle, template/generation, publication/format, team/governance, export/reporting, AI-directed meta-tools, grants/finance, research-compliance. · UI: tool-narration rows (name + human label + running/success/error, expandable output).

## 4.4 Proactive intelligence
- **Deadline radar** — `server/services/ana/deadline-radar.ts` · ✅ · Obligations bucketed overdue/due_soon(≤30d)/upcoming · UI: deadline chips, radar list.
- **Risk watch** — `ana/risk-watch.ts` · ✅ · Open blockers severity-ranked (critical→low) w/ owner+next-action · UI: blocker list.
- **Contradiction watch** — `ana/contradiction-watch.ts` · ✅ · Unresolved findings, blocksPromotion flag · UI: contradiction list.
- **Since-last-visit** — `ana/since-last-visit.ts` · ✅ · Delta (newly overdue / new blockers / new contradictions) · ops: `GET /api/ana-ri/since-last-visit?since=` · UI: "since you were last here" panel.
- **MDX proactive signals** — `ana-ri/mdx-proactive-signals.ts` · ✅ · 6 alert kinds (q_sub.target_date_approaching, q_sub.commitment_blocker_open, estar.section_stale, correspondence.no_response, evidence_sufficiency.low_near_target, program.target_submission_approaching), severity `info|warn|critical` + suggested tool/surface · UI: alerts center, ambient badges, fatigue controls (severity floor/mute/quiet-hours).
- **Deficiency taxonomy** — `ana-ri/deficiency-taxonomy.ts` · ✅ · 100+ patterns (CLIN/STAT/CMC/Device/Nonclinical/Labeling/Post-market) w/ reviewer language + mitigations · UI: deficiency preemption list.

## 4.5 Context enrichment & memory
- **Enrichment & slash commands** — `ana-ri/context-enrichment.ts` · ✅ · ~20 sources (industry wisdom, playbooks, challenge library, decision frameworks, agency tactics, ICH corpus, pathways, role/lens, readiness, recommendations, evidence chain) + ~58 slash commands (`/risk /readiness /precedent /draft /preflight /sap /cmc /ectd /redteam /strategy …`) · data: `EnrichmentResult`(block, sources[], enrichmentMeta) · UI: slash-command autocomplete, enrichment-source attribution.
- **Working/project/account memory** — `working-memory.ts`, conversationWorkingMemory · 🟡 · 3-layer memory; threshold-gated summary write-back · UI: context indicator, memory atoms accept/reject.

## 4.6 Part 11 governed-action gate (client + server)
- **Gate** — `ana-ri/part11-governance.ts`, command-executor gate, `routes/ana-ri/utility.ts` governed-action route, client `GovernedActionSignoff.tsx`/`useGovernedAction.ts` · ✅ · Tiered: 9 governed commands need reason (≥10 chars); 6 high-impact also need e-signature; per-tenant `anaPart11Enforce` (default off); fail-closed + audit · UI: reason-for-change always; password/MFA for high-impact; accessible (labels, error live-region, Escape).

**Domain 4 gaps:** tool-result capping algorithm; RIM interceptor internals; confidence model; memory summarization model/schema; enrichment drop-priority; fallback-provider definition; tool-policy precedence.

---

# DOMAIN 5 — EVIDENCE, KNOWLEDGE & INTEGRATIONS

## 5.1 Vault / document management
- **Core S3 vault** — `shared/schema/vault.ts`, `mdx-vault.ts` · ✅ · S3-backed storage + versioning + classification · data: `vault.documents`(documentCode, s3Bucket/Key/VersionId, storageClass `STANDARD|INTELLIGENT|ARCHIVE|DEEP_ARCHIVE`, classification `CONFIDENTIAL|INTERNAL|CONTROLLED|PUBLIC`, processingStatus `PENDING|EXTRACTING|VECTORIZING|INDEXED|FAILED|ARCHIVED`, parentDocumentId, supersedesId) · ops: `GET /api/mdx/vault[?program_id=]`, `/:artifactId[/versions]` · UI: document title/type/CTD/status/version, retention, processing stage.
- **Classification & retention** — vault.ts, `server/jobs/retentionCron.ts` · ✅ · Policy-based archive/expire · data: `vault.retention_policies`(retentionDays, archiveBeforeDelete, hardDelete), `vault.document_archives`(snapshot JSON, archiveReason) · UI: classification label, retention/expiry, archive audit.
- **Processing pipeline** — `evidence-management.routes.ts` · 🟡 · Extract→classify→vectorize→index · data: `vaultDocumentChunks`(chunkText, pageNumber, sectionHierarchy, embedding vector(1536)) · ops: `POST /api/evidence-management/upload` · UI: upload progress, extraction status, section hierarchy.

## 5.2 Evidence fabric / objects
- **Evidence objects** — `evidence.ts`, `shared/schema/programs.ts` · ✅ · Unified evidence schema · data: evidenceType `literature|test_report|clinical_data|standard|cer_section|approval_letter|guidance|expert_opinion`, evidenceLevel `I–V`, qualityScore/relevanceScore, status `pending|approved|rejected|superseded` · ops: `GET/POST/PATCH/DELETE /api/evidence`, `/search`, `/:id/verify` · UI: type/category/level badges, scores, citation, excerpt, tags.
- **Evidence-to-claim linking** — `shared/schema/evidence.ts`(submissionEvidenceLinks) · ✅ · Bidirectional provenance · data: direction `derives_from|cited_by|supports|contradicts`, confidence · ops: `POST /api/evidence/links`, `GET /api/evidence/:id/links` · UI: link direction badges, confidence.
- **Evidence sufficiency** — `shared/schema/evidence-sufficiency.ts` · ✅ · Verdict engine (PMA/De Novo/510k) · data: verdict `sufficient|borderline|insufficient`, overallScore 0–100, pillarScores, blocksApproval · ops: `GET /api/evidence-sufficiency/:programId`, `POST /assess` · UI: verdict badge, score gauge, pillar breakdown, recommendations.

## 5.3 RAG pipeline & search
- **Advanced RAG** — `advancedRAGPipeline.ts`, `ragRouter.ts` · ✅ · Hybrid retrieval, LLM rerank, HyDE, multi-query, step-back, decompose, MMR, context expansion, corrective loop · data: RetrievalOptions(strategy, corpus `vault|rag_chunks|client_memory|project_memory`) · UI: retrieved docs/chunks, answer w/ [SRC-n], grounded flag.
- **Hybrid + semantic search** — `rag-fusion.ts`, `rag-filters.ts`, `enhancedEmbeddingService.ts` · ✅ · RRF (dense+sparse), pgvector cosine, ada-002/local, batching/caching · UI: relevance score, match-type badge.
- **Query transforms / rerank / MMR** — `rag-query-transforms.ts`, `rag-retrieval-strategies.ts`, `rag-reranker.ts` · ✅ · HyDE/multi-query/step-back/decompose; LLM-judge or cross-encoder; MMR diversity · (internal).
- **Evidence-Ask** — `evidence-ask.ts` · ✅ · Single-shot grounded Q&A (topK 8, threshold 0.6, [SRC-n] citations) · ops: `POST /api/evidence/ask` · UI: answer + numbered sources + confidence.
- **Full-text/OpenSearch** — `evidence-search.ts`, `search/opensearchClient.ts` · ✅ · multi_match + Postgres FTS fallback · ops: `GET /api/evidence-search/search`, `/gather/:productId` · UI: results (title/snippet/score).

## 5.4 Knowledge graph (GraphRAG)
- **Graph retrieval** — `graphrag.ts`, `shared/schema/regulatory-graph.ts`, `lumen_cortex/enterprise/neo4j_connector.py` · 🟡 · Entity/relationship extraction + multi-hop + citation trace · data: EntityType (drug/disease/gene/endpoint/study/regulation/…), RelationshipType (TREATS/TARGETS/CITES/REGULATES/…), communities (Leiden) · ops: `POST /api/graphrag/query|ingest`, `GET /api/graphrag/entities/:id/neighborhood|communities|citation-trace/:docId|health` · UI: graph viz, entity cards, citation chains, community bubbles.

## 5.5 Literature & external intelligence
- **Grobid / Tika extraction** — `literature/grobidClient.ts`, `ingestion/tikaClient.ts` · ✅ · Scholarly TEI + general text extraction · UI: extracted sections/authors/refs.
- **External intelligence sweep** — `server/jobs/externalIntelligenceSweep.ts`, `external-intelligence/` · ✅ · Nightly regulatory (FDA/EMA/MHRA/TGA) + academic (PubMed/medRxiv/SCDM) feeds · data: ExternalIntelligenceFinding(sourceType, market, regulatoryBody, topics) · ops: `GET /api/external-intelligence/digest|findings|sources`, `POST /run` · UI: digest by agency, finding cards, source status.

## 5.6 Connectors (16) & deep research
- **Connector registry** — `connectors/connector-interface.ts`, `connector-registry.ts` · ✅ · Unified interface + per-org AES-256-GCM credentials + SSRF guards · data: ConnectorCatalogEntry(type `api|scraper|mcp`, category, requiredTier `free|standard|professional`) · ops: `getConnectorCatalog`, `storeCredentials`, `searchConnectors` · UI: connector cards, credential forms, health status.
- **Connectors** — clinical (ClinicalTrials.gov ✅ free, Medidata Rave ✅ pro); literature (PubMed ✅ free); regulatory (FDA Drugs ✅, EMA EPAR ✅, PMDA ✅, NMPA ✅, CMS Coverage ⚪ MCP); DMS (Veeva ✅, SharePoint ✅, OneDrive ✅, Google Drive ✅, Box ✅); EHR (FHIR R4 ✅, Ellucian Banner ✅); funding/compliance (Grants.gov ✅ free, SAM Exclusions ✅ free). · UI: per-connector setup guide, auth (None/API key/OAuth2/HTTP Basic/SMART-on-FHIR).
- **Deep research** — `deep-research.ts`, `deep-research-orchestrator.ts` · ✅ · Fan-out connector queries + LLM synthesis + quota · ops: `POST/GET /api/deep-research/jobs[/:id][/cancel|/events]`, `/connectors[/:id/configure]`, `/usage` · UI: job launch form, progress, aggregated results, synthesis, save/export.
- **Knowledge base** — `knowledge-base.ts` · ✅ · Upload + project context + IND package/section generation · ops: `POST /api/knowledge-base/upload|generate-docx|generate-ind-package|generate-ind-section`, `GET /context/:projectId` · UI: upload, context dashboard, generate.

**Domain 5 gaps:** vault chunking/RAG ingestion pipeline stubbed (chunks table unused); GraphRAG Neo4j in Python (integration unclear); evidence-sufficiency scoring rubric in JSONB (not enumerated); cross-connector ranking logic; connector_credentials schema/rotation; document lineage viz; consistencyFindings table unused; standardsApplicability unpopulated; tier enforcement on connectors.

---

# DOMAIN 6 — SPECIALIST & QUALITY

## 6.1 Biostatistics / study design / SAP / CSR / CDISC
- **AnA biostats orchestration** — `ana-biostats.ts`, `ana-biostats/orchestrator.ts` · ✅ · End-to-end workflows (sample size, risk review, scenario compare, track-aware drafting) · data: `biostat_workflows`, `computation_results`, `judgment_records`; workflowType enum · ops: `POST /api/ana-biostats/workflow|compute|compare|validate|document|judge|compute-enhanced|multiplicity|missing-data-impact|sme-route`, `GET /sme-agents` · UI: workflow selector, computation results, judgment flags, document preview, SME routing.
- **Design-statistics** — `biostat-design-stats.ts` · ✅ · Group-sequential, assurance, multiplicity, diagnostic sizing, MMRM, external-control, region rules, enrollment forecast, MRMC, Bayesian device, event projection, win-ratio, BOIN, RMST · ops: `POST /api/biostat/adaptive/oc-exact|assurance|multiplicity/test|diagnostic/sizing|mmrm/sample-size|external-control/sensitivity|region-rules/evaluate|enrollment/forecast|diagnostic/mrmc|diagnostic/bayesian-device|adaptive/event-projection|win-ratio|dose-finding/boin|survival/rmst` · UI: per-analysis forms, OC tables, spending-function plots, region findings, enrollment timelines.
- **Statistical continuum** — `biostatPlatform.ts` · ✅ · Thread design→specs→TLF→CSR · data: `statisticalContinuumThreads` · ops: `POST /continuum/initialize`, `PUT /:threadId/sap|analysis-specs|tlf-shells`, `POST /:threadId/results`, `GET /:threadId/csr-sections` · UI: stage timeline, editable sections, CSR preview.
- **Design optimizer / estimand-multiplicity / collaborative SAP / external control / adaptive ops / knowledge graph / judgment** — `biostatPlatform.ts` · ✅ · Design recommendations; ICH E9(R1) estimands; version-controlled SAP w/ track-changes+e-sign; external-control synthesis; interim/SSR/IDMC; method landscape graph; judgment layer (power adequacy, fragility, defensibility, role interpretations) · ops: many under `/api/biostat/*` · UI: precedent tables, estimand cards, SAP track-changes, balance tables, interim boundary plots, judgment dashboard.
- **CSR builder & analytics** — `csr-builder-routes.ts`, `csr-analytics.ts`, `csr-intelligence-routes.ts` · ✅ · ICH E3 drafting, cross-study compare, safety signals, narratives, benefit-risk · data: `csr_reports`, 14 ICH E3 sections · ops: `GET /api/csr-builder/structure`, `POST /build|draft-section|compare|safety-signals|generate-narrative|analyze-benefit-risk`; `GET /api/csr-intelligence/search|analytics|stats` · UI: E3 tree (completion %), section editor, comparison matrix, safety heatmap, benefit-risk chart.
- **CDISC validation** — `cdisc-validation.routes.ts` · ✅ · SDTM/ADaM/Define-XML/SEND conformance · ops: `POST /api/cdisc-validation/sdtm-domain/conformance|define-xml|adam-adsl/conformance|adam-bds/conformance|send-domain/conformance|package-readiness` · UI: conformance report, Define-XML preview, codelist validator.

## 6.2 Device / IVD / SaMD
- **Device classification** — `device-classification.ts` · ✅ · IMDRF SaMD + IEC 62304 class · ops: `POST /api/device-classification/samd-risk|iec62304-class` · UI: risk matrix, class card.
- **Device projects / cockpit** — `device-projects.ts`, `device-cockpit.ts` · ✅ / ⚪ · Device portfolio CRUD; readiness (stub) · data: `projects`(deviceClass `I|II|IIa|IIb|III`) · UI: project cards, detail.
- **Diagnostics performance** — `biostat-design-stats.ts` (diagnostic/mrmc/bayesian-device) · ✅ · IVD/CDx performance sizing · UI: performance inputs, power curves.

## 6.3 QMS / CAPA / inspections
- **QMS core** — `qms.ts` · ✅ · Document control, training, suppliers, audits, management review, nonconformance · data: docType, status `draft|approved|effective|superseded|withdrawn`, supplier status, NCM dispositions · ops: `GET/POST /api/qms/documents[/:id/transition]|training|suppliers|audits|management-reviews|nonconformances`, `GET /summary` · UI: document library + state machine, training heatmap, supplier scorecard, NCM triage, QMS dashboard.
- **CAPA / MDR / complaints** — `capa-mdr.ts`, `shared/schema/capa-mdr.ts` · ✅ · Complaint intake (21 CFR 820.198), MDR (803 / EU 87), CAPA (820.100), vigilance timeline · data: complaint status, MDR fdaReportType/euSeverity + reportingDeadline, CAPA status, action status (COMPLAINT_STATES/MDR_STATES/CAPA_STATES/ACTION_STATES) · ops: `GET/POST /api/capa-mdr/triage|complaints|mdr-events|capa[/:id/transition]|capa/:id/actions|vigilance` · UI: triage dashboard, complaint card (harm/clocks), MDR form (computed deadline), CAPA tree, vigilance timeline.
- **Inspections** — `inspections.ts` · ✅ · BIMO/PAI readiness, Form 483, 15-day responses, per-area scoring · data: inspectionType, outcome `nai|vai|oai`, finding classification `critical|major|minor|observation` · ops: `GET/POST /api/inspections[/:id/findings[/:findingId/response]|/readiness]` · UI: schedule, 483 tracker, response form (15-day clock), readiness gauge.

## 6.4 Pharmacovigilance / post-market / safety
- **Pharmacovigilance** — `pharmacovigilance-routes.ts` · ✅ · AE/ICSR/periodic reports/signals/RMP per ICH E2A/E2B(R3)/E2C/E2D/E2F · data: AE(eventType `AE|SAE|SUSAR|AESI`, causality, seriousness), periodic `DSUR|PSUR|PBRER|PADER`, RMP · ops: `GET /overview|periodic-reports/upcoming|signals/pending|overdue`, `POST /adverse-events[/:id/submit]|icsr/generate|periodic-reports|signals/report|signals/screen|rmp/create|reporting-deadline` · UI: AE intake, ICSR preview, periodic deadlines, signal dashboard, RMP editor.
- **Post-market surveillance** — `postmarket-surveillance.ts` · ✅ · openFDA MAUDE/recalls aggregation + signals · ops: `POST /maude/aggregate|recalls/summarize`, `GET /maude|recalls` · UI: signal heatmap, recall table, trend chart.
- **GSPR + post-market docs** — `gspr-postmarket.ts`, `shared/schema/gspr-postmarket.ts` · ✅ · EU MDR/IVDR Annex I requirements + mappings + post-market docs (PMS/PMCF/PSUR/SSCP) · data: gsprRequirements, program mappings (applicability/conformanceStatus), document type/status · ops: `GET /api/gspr/catalog|programs/:id/mappings|coverage`, `POST /mappings`; `GET/POST/PATCH /api/post-market/...documents[/validate|approve|supersede]`, `POST /pmcf-plan` · UI: requirements tree, mapping checklist, coverage heatmap, document editor, validation.

## 6.5 Correspondence, design-risk, human factors, CDx
- **Regulatory correspondence** — `regulatory-correspondence.ts` · ✅ · Submission/correspondence tracking + issue extraction + response packages · data: submissionState, correspondence(direction, communicationType, urgency), issues(issueType, confidenceScore, isVerifiedByUser), response packages · ops: `GET/POST/PATCH /api/regulatory-correspondence/submissions|correspondence|issues|response-packages` · UI: submission tracker, correspondence log, issue extraction dashboard, response editor.
- **Design risk (FMEA/ISO 14971)** — `design-risk.ts` · ✅ · DHF (inputs/outputs/verifications/validations/reviews/changes) + RMF (hazards, severity×probability, RPN, controls, residual) · ops: `GET/POST /api/design-risk/design-inputs|outputs|verifications|validations|reviews|changes|rmf[/:id/items|summary]`, `risk-items/:id/controls`, `GET /dhf/assessment` · UI: traceability matrix, design-review tracker, change control, FMEA table, benefit-risk summary.
- **Human factors (IEC 62366-1)** — `human-factors.ts` · ✅ · HFE/UE completeness + use-related risk · ops: `POST /api/human-factors/hfe-completeness|use-related-risk` · UI: HFE checklist, completeness bar, use-error risk grid.
- **Companion diagnostics** — `companion-diagnostics.ts` · ✅ · CDx co-development readiness · ops: `POST /api/companion-diagnostics/readiness` · UI: readiness checklist.

**Domain 6 gaps:** dedicated study-design routes (via continuum); standalone TLF generation; Sentinel/active surveillance; device cockpit (stub); env monitoring; lot/serial traceability.

---

# DOMAIN 7 — PLATFORM, GLOBAL RI & CROSS-FUNCTIONAL

## 7.1 Central services
- **Auth & identity** — `auth.ts`, `sso.ts`, `auth-security-service.ts`, `mfaService.ts`, `emailOtpService.ts` · ✅ · JWT login, SAML 2.0 SSO + JIT, MFA (TOTP+backup codes), account lockout (5/30min), password policy (12+ chars, history 5, 90-day expiry) · data: `users`(mfaEnabled, mfaSecret, failedLoginAttempts, lockedUntil, passwordHistory) · ops: `POST /api/auth/signup|login|refresh|logout|password-reset|mfa/setup|mfa/verify|mfa/backup-codes`, `GET /api/auth/sso/saml/metadata|login|callback` · UI: login, MFA enrollment/TOTP, backup codes, password form w/ policy feedback, SSO initiator.
- **Multi-tenancy & RLS** — `tenants*.ts`, `tenant-config.ts`, `tenant-users.ts`, `middleware/tenantContext.ts` · ✅ / 🟡 · Org provisioning, RBAC, workspace sub-tenancy, Postgres RLS · data: `organizations`(slug, clientType `pharma|medtech|biotech`, tier `free|standard|professional|enterprise`, status, maxUsers/Projects/Storage, billing fields), `organizationUsers`(role `admin|manager|member|viewer`, permissions) · ops: `GET/POST/PUT/DELETE /api/tenants[/:id]`, `/api/tenant-users[/:id/role]` · UI: org selector, members + role assignment, tier/billing, invite, settings.
- **Audit & observability** — `auditService.ts`, `lib/tamper-proof-audit.ts`, `audit/chain.ts`, `observability/langfuseService.ts`, `redaction.ts` · ✅ / 🟡 · Immutable hash-chained audit; LLM trace + PII redaction · data: `auditLogs`(tenantId, action, oldValues/newValues, ip, ua) · ops: `auditService.logAction`, `computeAuditChainSealed` · UI: audit viewer (filters, export, chain badge), trace search.
- **AI gateway & governance** — `ai-gateway/`, `ai-governance/` · ✅ / 🟡 · Central LLM routing (Anthropic/OpenAI/Moonshot), rate limit, policy, audit; risk tiers 1–4, human-review gates, approved-models, model cards, groundedness · ops: `AIGateway.execute`, `getRiskTier`, `shouldTriggerHumanReview`, `isModelApproved` · UI: LLM usage dashboard, model approval panel, review queue.
- **Billing & entitlements** — `billing.ts`, `services/billing.ts` · ✅ / 🟡 · Stripe checkout/portal/webhooks, DTC + industry pricing, usage metering · data: `organizations.stripe*`, paymentStatus, billingCycle; `usageRecords`(featureId, creditsUsed); `stripeEvents`(idempotency) · ops: `POST /api/billing/checkout|portal|webhooks/stripe`, `GET /status|pricing` · UI: pricing calculator, checkout, invoices, usage dashboard, trial countdown, upgrade prompts.
- **Feature flags & quota** — `featureToggleService.ts`, usageRecords · ✅ · Per-tenant flags + usage metering · data: `featureToggles`(featureKey, enabled, enabledForOrganizationIds[]) · ops: `isFeatureEnabled`, `enable/disableFeatureForTenant` · UI: flag admin panel, usage charts, overage warnings.
- **Notifications** — `notifications/notification-service.ts`, `notification_routes.ts` · ✅ · In-app (+email/push subscriptions) · data: `mdx_notifications`(category[12], severity `info|warning|critical`, read_at, archived_at, action_url) · ops: createNotification, listNotifications, markRead/markAllRead, archiveNotification · UI: inbox badge, notification list, read/archive, action links.
- **Storage** — `s3-storage.ts`, SharePoint-compatible schema (sharepoint_files/versions/audit_log/shares/comments/locks) · ✅ / 🟡 · S3 immutable vault + enterprise file versioning/sharing/locking/comments · ops: upload/download/delete/getSignedUrl; file CRUD + versions + shares · UI: file browser, version timeline, lock badge, share dialog, comment thread, audit viewer.
- **Scheduled jobs** — `server/jobs/`(scheduleOfEventsSweep, regulatoryHorizonScan, auditChainIntegritySweep, corpusIngestionSweep, externalIntelligenceSweep, driftSentinelSweep, retentionCron) · ✅ · Periodic ingestion/validation/cleanup · UI: job status dashboard.

## 7.2 Global Regulatory Intelligence (39 jurisdiction route groups under `/api/global-ri/*`)
All ✅ unless noted; shared infra: rate limiter + `AUTHOR` role. Each: `GET` reference/checklist + `POST` assess. *Screens:* per-domain checklist/assessment + guidance cross-refs.
- **CMC** (`cmc.routes.ts`) — ICH Q6A/Q6B specs by product/dosage form · `GET /universal-tests/:productType`, `/specifications/:productType`.
- **CTA/IND** (`cta.routes.ts`) — CTA checklist + readiness by market.
- **Pediatric** (`pediatric.routes.ts`) — PREA iPSP / EMA PIP obligations + waiver/deferral.
- **Exclusivity** (`exclusivity.routes.ts`) — exclusivity regimes + LOE projection.
- **Inspection** (`inspection.routes.ts`) — GMP/PAI/BIMO readiness domains.
- **Device / companion-diagnostics** (`device.routes.ts`, `companion-diagnostics.routes.ts`) — classification + predicate; CDx co-development.
- **Pharmacovigilance / safety-reporting** (`pharmacovigilance.routes.ts`, `safety-reporting.routes.ts`) — AE/SAE timelines, ICSR, REMS/AESP.
- **Labeling / promotional-compliance** (`labeling.routes.ts`, `promotional-compliance.routes.ts`) — PI/SmPC templates + validation; claims/fair-balance audit.
- **Stability / process-validation** (`stability.routes.ts`, `process-validation.routes.ts`) — ICH Q1A/B/C protocols; 3-batch validation, CPP/CQA.
- **Expanded-access / advanced-therapies** (`expanded-access.routes.ts`, `advanced-therapies.routes.ts`) — compassionate use; ATMP + breakthrough/PRIME designations.
- **Controlled-substances** (`controlled-substances.routes.ts`) — DEA scheduling + quota.
- **Bioequivalence** (`bioequivalence.routes.ts`) — ANDA/BE study design + waivers.
- **Submission-format / module1** (`submission-format.routes.ts`, `module1.routes.ts`) — CTD/eCTD module structure + regional Module 1.
- **Timeline / programs** (`timeline.routes.ts`, `programs.routes.ts`) — PDUFA/review cycles; expedited programs eligibility.
- **Reliance / import-export / establishment-registration** — foreign-approval reliance; licensing + tariffs; establishment registration.
- **Clinical-evidence-standards / dossier / nonclinical** — endpoints; dossier outline; tox/pharm/ADME battery.
- **Impurities / combination / changes** — ICH M7 thresholds; combination products; change classification (SUPAC).
- **Disclosure / GDP** (🟡) — financial disclosure; Good Distribution Practices.
- **GCP / guidance / catalog** — GCP requirements; guidance library; endpoint catalog (`GET /api/global-ri/catalog`).

## 7.3 Cross-functional
- **Unified tasks** — `taskManagement.routes.ts`; unifiedTasks/taskTemplates/taskDependencies/taskAutomation/crossModuleTaskLinks · ✅ · Cross-module tasks + templates + dependency graph + automation · data: status `todo|in_progress|review|blocked|done`, priority, dependencyType, automation ruleType · ops: `POST/GET/PUT /api/tasks[/:id][/dependencies|automate]`, `/bulk-create`, `calculateCriticalPath`, `/api/task-templates`, `/api/task-automation` · UI: kanban, Gantt (critical path), task detail, template picker, automation editor.
- **Collaboration** — `collaboration.ts`, `coauthor.ts`, comments schema · ✅ / 🟡 · Activity feed + presence; threaded comments; co-authoring (real-time sync TBD) · ops: `GET /api/collaboration/activities|team`, `POST /api/comments`, `POST /api/coauthor/session/:docId` · UI: team roster, presence, activity feed, comment sidebar, co-edit cursors.
- **Regulatory precedent intelligence** — `regulatory-precedent-intelligence.ts`, `corpus/precedent-benchmark*.ts` · ✅ · Precedent search + benchmarking · ops: `GET /api/intelligence/precedents`, `POST /api/intelligence/benchmark`, `GET /precedent/:id` · UI: precedent table, benchmark radar, side-by-side.
- **Regulatory intelligence dashboard** — `regulatory-intelligence.ts`, `external-intelligence-routes.ts`, `intelligence.ts`, `ana-intelligence.ts` · 🟡 · Competitive intel, horizon scan, feeds · ops: `GET /api/intelligence/horizon|competitors|feeds` · UI: news feed, guidance alerts, competitor timeline.
- **Report-OS & analytics** — `report-os.ts`, `report-os-insights.ts`, `reports/generate-report.ts`, `intelligent-reports.ts`, `csr-analytics.ts`, `analytics-routes.ts`, `mdx-analytics.ts` · ✅ / 🟡 · Report generation engine + AI-augmented insights + KPI dashboards · ops: `POST /api/reports/generate`, `GET /:reportId[/insights]`, `/available-templates`; `GET /api/analytics/dashboard/:projectId|enrollment-forecast|safety-metrics` · UI: template selector, filter builder, preview/export, KPI dashboard, AI insights panel.
- **Client intelligence / cluster** — `client-intelligence.ts`, `intelligence-cluster.ts` · 🟡 · Org capability profile; fact graph · UI: org profile/capability radar, knowledge graph.
- **Communication center** — `concept2cure-communication-center.ts` · 🟡 · Authority profiles + agency events + PublishOps service states + submission-center item states · data: authority profiles(channelType `portal|gateway|email|mixed`), PublishOps states (requested→…→closed), item states (draft→…→accepted/rejected), visibility tiers · ops: `GET /api/projects/:id/authority-profiles|submission-center`, `POST /agency-events`, `PUT /submission-center/:itemId` · UI: submission center dashboard, agency event log, dispatch checklist, authority card.
- **Decision lineage & provenance** — `decision-lineage.ts`, `governed-decision-repository.ts`, concept2cureProvenanceEvents/ReviewDecisions · ✅ · Decision lineage + rationale + impact graph · ops: `GET /api/provenance/:artifactId`, `POST /api/decisions/:artifactId`, `GET /api/decision-lineage/graph` · UI: decision tree, rationale cards, impact arrows.
- **Working memory & conversations** — `working-memory.ts`, `concept2cure.ts`, concept2cureConversations/Messages/Artifacts/Versions/Signatures · 🟡 / ✅ · 3-layer memory; persistent conversations + artifact generation + e-sign · ops: `POST /api/projects/:id/conversations`, `/conversations/:id/messages`, `GET /conversations/:id[/artifacts]`, `POST /artifacts/:id/sign` · UI: chat thread, artifact panel, version timeline, signature badge.

## 7.4 Client app structure
- **Layout modes** — `client/src/concept2cure/zen-app-constants.ts` · ✅ · Central `LayoutMode` enum: global (`projects, mdx, pdev, apps, artifacts-center, setup`), project tabs (`project-home, documents, vault, review, submissions, dossier-map, section-workspace, csr-workflow, ind-checklist, template-library`), workspace/editor (`regulatory-workspace, editor, deep-research`), specialist (`precedent-intelligence, biostatistics, review-readiness, report-engine, safety-narrative, device-diagnostics-workbench, vault-workspace`), Phase 10 (`biopharma, cmc, labeling, risk, tasking, submission-gateway, project-detail`), Phase 11 (`intelligence`), Phase 9 (`authoring`), `quality`; + many compat-redirect/demoted/legacy modes · UI: SPA route per mode.
- **Primary nav mapping & router** — zen-app-constants.ts(PRIMARY_NAV_ID_BY_LAYOUT), `router/ZenRouter.tsx` · ✅ · Mode→nav-item + mode→component · UI: nav highlights active mode.
- **Design system & theming** — `theme.json`, `design-system/` · ✅ · Tokens (accent orange `hsl(18,60%,60%)`, green secondary; fonts Inter/Söhne/SFMono; motion 200ms cubic-bezier; radii/shadows) + component library · UI: themed components, responsive grid.
- **i18n** — client i18n provider · 🟡 · Multi-language (en-US primary) · UI: language selector.
- **Industry modes** — `types/workspace.ts` · ✅ · `biotech|medtech|cro|pharma|academic|regulatory|medical_writing` drives module visibility · UI: industry-specific nav (pharma→CTD/NDA; medtech→510k/MDX).

**Domain 7 gaps:** SCIM provisioning routes not enumerated; real-time collab WebSocket unmapped; backup/DR strategy; BI/data-warehouse; AI model version pinning; Global-RI rule-update mechanism; clientWorkspace sub-tenancy routes; outbound webhooks/event stream.

---

## Maturity at a glance
**Production-leaning (✅):** Submission core + gateways (FDA ESG/EMA CESP/PMDA), eCTD compile/export, 510(k)/IVDR classification, IND/CMC/nonclinical cores, document editor + versioning + Part 11 e-sign + audit, governed evaluation fabric, AnA chat + commands + tools + proactive intelligence + governance gate, Vault + RAG + 16 connectors + deep research, biostatistics platform, CSR builder, CDISC validation, QMS, CAPA/MDR, inspections, pharmacovigilance, GSPR, design-risk, all 39 Global-RI route groups, auth/RBAC/SSO/MFA, audit, AI gateway, billing, feature flags, notifications, unified tasks, report-OS, decision lineage.
**Partial (🟡):** real-time collaboration/co-authoring, track-changes diff UI, module/dossier preflight services, placement-authority ML, GraphRAG (Neo4j), vault chunking pipeline, working-memory refresh, AI governance admin UI, communication-center automation, analytics AI insights, i18n.
**Stub (⚪):** SOP generator, device cockpit, dossier preflight, some QC tables (unused), pediatric PIP.

*Code-derived; resolve 🟡/⚪ items and the per-domain gaps during design discovery.*
