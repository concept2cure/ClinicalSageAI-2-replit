# Feature Catalog — Concept2Cure / ClinicalSageAI

**Date:** 2026-06-16
**Scope:** Entire codebase (`client/`, `server/`, `services/`, `workers/`, `ingestion/`, `shared/`, `shadow_service/`, `database/`).
**Purpose:** Authoritative inventory-management catalog of every module, feature, sub-feature, and service — organized **(A) by client use-case type** and **(B) by central services for all clients**.

## Methodology

This catalog was produced as a **fresh, unbiased, code-derived inventory**. It was built by a swarm of **24 inventory agents** (16 client feature-area + 8 central-service), each deriving findings **only from source code** and explicitly **excluding** all prior inventory/audit/spec documents (`FEATURE_INVENTORY.md`, `*_AUDIT_*`, `*_SPEC_*`, `MDX_*`, `HANDOFF*`, etc.). Findings were independently re-verified by an **audit swarm** and reconciled by a **chief-investigator** pass that cross-checked the catalog against the authoritative `LayoutMode` enum (`client/src/concept2cure/zen-app-constants.ts`), the route-registration spine (`server/startup/routes.ts`, `server/bootstrap/register-*-routes.ts`), the Drizzle schema (`shared/schema.ts` + `shared/schema/`), and top-level directories. A second **deep route-surface sweep** then classified all 307 distinct top-level route basenames so no route file is left uncatalogued — see **Section D**.

**Maturity legend** (assessed from code evidence, not aspiration):
- ✅ **Built** — wired end-to-end: real routes/UI + real logic + real data/schema (+ tests where present).
- 🟡 **Partial** — exists but incomplete: UI-only with fixtures, backend-only with no UI, legacy/superseded, or framework-with-stubbed-logic.
- ⚪ **Stub** — placeholder/scaffold/unused (schema or types defined, no active code path).

**Platform shape:** Single-page React 18 + Vite client driven by a `layoutMode` state machine (`ZenApp.tsx` → `ZenRouter.tsx`); Express/TypeScript server (~418 route files, ~1,758 service files across 138 service directories) over PostgreSQL + pgvector (Drizzle ORM, 122 migrations); plus Python microservices (Celery), background workers, and a `shadow_service` for predicate intelligence. Cross-cutting compliance posture: **21 CFR Part 11** (audit hash-chain, e-signatures, immutability), **multi-tenant** (org + client-workspace isolation, RLS), **WCAG 2.x AA**.

---

# Section A — Features by Client Use-Case Type

## A.0 · Persona / use-case map

| Persona / use-case | Primary feature-areas consumed |
|---|---|
| **Biotech sponsor** (single product → IND→NDA/BLA) | A.4 Biopharma/IND, A.1 Authoring, A.5 CMC, A.6 Biostatistics, A.7 PDEV, A.9 Submission, A.13 Reporting, A.14 ANA |
| **Pharma global team** (portfolio, multi-region) | A.4 Biopharma, A.9 Submission/eCTD, A.15 Reg-correspondence/PV, A.13 Reporting (portfolio rollup), A.16 Admin/Entitlements |
| **CRO / program manager** | A.12 Tasking/Projects (hierarchy), A.1 Authoring, A.9 Submission, A.16 Client portal/branding, A.11 Review/Governance |
| **Medical-device & IVD maker** | A.2 510(k)/De Novo, A.3 PMA/CER/IVDR/UDI/Postmarket/Labeling, A.8 Risk (ISO 14971)/QMS, A.9 Submission gateways |
| **Regulatory affairs** | A.9 Submission/eCTD, A.15 Reg-intelligence/precedent/correspondence, A.11 Governance/audit, A.14 ANA |
| **Medical writer** | A.1 Authoring & Editor, A.10 Vault/Documents, A.14 ANA, A.13 CSR builder |
| **Biostatistician** | A.6 Biostatistics/Study Design/CDISC, A.13 Reporting (prediction/calibration) |
| **Clinical operations** | A.4 IND lifecycle, A.10 eTMF, A.15 PV/Safety, A.8 Inspection/CAPA |
| **Quality / CMC** | A.5 CMC, A.8 QMS/SOP/CAPA/Inspection, A.11 Governance/e-sign |
| **Pharmacovigilance / post-market** | A.15 PV/Safety, A.3 Postmarket/GSPR, A.8 CAPA-MDR |
| **Academic / research institution** | A.15 Research compliance (IRB/IACUC/IBC/FCOI/Grants/Effort), A.6 Study design |

---

## A.1 · Document Authoring & Editor  ✅
*Universal AI-assisted regulatory document authoring across (doc_type × agency) rule packs.*
Paths: `client/src/concept2cure/authoring/`, `components/editor/`, `components/intelligentDocs/`, `server/routes/authoring.router.ts`, `authoring-actions.ts`, `contentAssembly.routes.ts`, `docx-factory.ts`, `coauthor.ts`, `inline-annotations.ts`.

- **Authoring shell (Phase 9)** ✅ — conversation + workbench dual mode over live `/api/c2c/documents`; outline tree with status rollup (todo/drafted/review/approved/locked); 8 agencies (FDA/EMA/PMDA/HC/MHRA/ICH/TGA/NMPA) × 16 doc types (IND, CTA, NDA, BLA, MAA, 510(k), De Novo, PMA, CER, PSUR/PBRER, IB, Protocol, CSR, Briefing, Module 3, Module 2).
- **Artifact renderer & inline compliance gates** ✅ — paragraph provenance/citation chips, inline gate markers (err/warn/info), evidence-mode toggle, streaming indicator.
- **Conversation surface** ✅ — slash commands (`/cite`, `/precedent`, `/strengthen`, `/tighten`, `/diff`, `/review`, `/flag`, `/crossref`, `/validate`, `/translate`), skills menu (draft, compare-to-predicate, pull-evidence, risk-benefit, agency-translate, validate, precedent-search, compile-submission), selection toolbar.
- **Workbench** ✅ — section table with status/owner/readiness %, inspector (evidence + reviewers).
- **Authoring router (server)** ✅ — JWT + Part 11 document CRUD, section mutation, role-gated section permissions, file upload, status transitions (draft→review→approved→locked).
- **Authoring actions (AnA-first)** ✅ — resume-last-section, promotion-blocker explanation, governed-document-contract validation.
- **Content assembly** ✅ — conditional assembly, completeness, SSE-streamed preview, DOCX factory (BFF proxy w/ program-ownership IDOR guard).
- **PDF QC & CTD readiness** ✅ — M2 summary renderer + QC, M4 nonclinical QC, M5 clinical QC, cross-module IND assembly-readiness aggregator.
- **Citation engine** ✅ — sentence-level RAG citation, supports/contradicts/gap classification, PubMed/CrossRef verification (PMID→DOI→title), retraction detection, immutable run row.
- **Inline annotations & co-author** ✅ — approval/review/comment/question/suggestion threads; collaborative sessions (pgvector-embedded coauthor docs).
- **Intelligent docs (Phase 5)** ✅ Smart Claim Highlighter (TipTap component); 🟡 Source Suggestion Panel; ⚪ Compliance Guardian / Document Sherpa / Data Bridge (type definitions in `types.ts` only — no wired component); 🟡 Document Understanding (LayoutLMv3 types/framework).
- **Section builders** ✅ — IB builder, nonclinical study report builder, body-aware authoring (regional CTD + deficiency taxonomy).

## A.2 · Medical Device — 510(k) / De Novo / eSTAR / Substantial Equivalence  ✅ (eSTAR PDF fill 🟡)
Paths: `client/src/concept2cure/mdx/surfaces/K510*`, `mdx/hooks/useK510.ts`, `server/routes/{predicate-intelligence,510k-estar-routes,510k-workflow-routes,substantial-equivalence,device-classification,fda510k-routes,fda510k-unified}.ts`, `server/services/pathway-engines/estar/`, `shadow_service/predicate_intel/`.

- **510(k) workbench (K510 surface)** ✅ — predicate selection, SE matrix (single/multi-predicate), eSTAR readiness panel (20 §-sections), 7-stage strip; live hooks w/ fixture fallback.
- **Predicate intelligence engine** ✅ — candidate suggest/CRUD/analyze/radar/defense-preview via BFF→shadow service; SE matrix generation v1/v2 (risk-code→evidence linkage) + DOCX render.
- **Substantial-equivalence decision engine** ✅ — deterministic FDA SE flowchart (SE/NSE/INSUFFICIENT_DATA), technological-characteristics comparison.
- **Device classification** ✅ — IMDRF SaMD risk (N12), IEC 62304 software safety class.
- **eSTAR fill** 🟡 — template registry, field-map registry, fill orchestrator, readiness mapper all built; ⚪ official FDA AcroForm templates not vendored + field maps empty (fail-closed).
- **eSTAR export / workflow state** ✅ — governed ZIP package assembly + attachments, 21 CFR Part 11 audit, stage persistence, cross-tenant IDOR guard.

## A.3 · PMA · CER (EU MDR) · IVDR · UDI · Postmarket · Labeling  ✅ (CDx & CER full-narrative 🟡)
Paths: `mdx/surfaces/{Pma,Cer,Udi,Postmarket}*`, `client/src/concept2cure/labeling/`, `server/routes/{pma-workflow-routes,cer-routes,cerv2-*,ivdr-routes,mdx-ivdr,ivd-lifecycle,ivd-knowledge,udi-ivdr,mdx-udi,mdx-labeling,gspr-postmarket,postmarket-surveillance,mdx-postmarket}.ts`, `server/services/{cer/,regulatory/,gspr-postmarket/,postmarket/,ivd-knowledge/}`.

- **PMA workflow** ✅ — 10-phase grid, module assembly, state persistence (`project_charters.pma_config`), kit→phase mapper. 🟡 full eCTD/eSTAR PMA assembly.
- **CER (EU MDR Annex XIV)** ✅ — safety signals (FAERS/MAUDE/Eudamed), literature corpus, Article 61 section checklist + export; conformance validator (MDR 2017/745 / IVDR 2017/746); cerv2 sections/versions/document/export/ai routes. 🟡 full narrative auto-assembly; ⚪ live literature auto-ingestion (fixtures).
- **IVDR** ✅ — Annex VIII classification (A/B/C/D + NB flag), Annex XIII performance evaluation (3 pillars), MDX classifications/PERs CRUD, IVD lifecycle deterministic engines (stability, carryover, hook-effect, recovery, cutoff, traceability, SDLC, change assessment), IVD knowledge corpus (100+ entries). 🟡 CDx pairing workflow engine.
- **UDI** ✅ — GS1 GTIN-14 records + mod-10 validation, GUDID completeness scoring, EUDAMED status, ISO 15223-1 symbols, MRI conditional matrix, submit-to-GUDID transition.
- **Postmarket surveillance** ✅ — MDR clocks (FDA 5/30-day, EU 15-day), CAPA Kanban, signal triage, vigilance trends, openFDA MAUDE aggregation + recall summarization, eMDR/MIR/FSN/PSUR authoring, PMCF plan generator (honest placeholders).
- **GSPR** ✅ — Annex I catalog (MDR/IVDR), per-program applicability/conformance mapping, coverage gap report, post-market document lifecycle (pms_plan/report, pmcf, psur, sscp).
- **Labeling** ✅ — IFU/insert/patient-label/manual/box-label CRUD, multi-language translations (human/MT/machine), ISO 15223-1 symbol glossary, translation coverage, label↔UDI linkage.

## A.4 · Biopharma — IND / NDA / BLA / MAA / JNDA  ✅ (client surfaces 🟡 fixtures)
Paths: `client/src/concept2cure/biopharma/surfaces/`, `server/routes/{ind*,biopharma*,biologics-routes,nonclinical,preclinical}.ts`, `server/services/{ind-lifecycle/,ind-forms/,ind-master-data/,biologics*,nonclinical/,preclinical/,global-ri/,ha-interactions/}`.

- **IND lifecycle (server, deterministic, tested)** ✅ — safety reports (312.32, 7/15-day classification), annual report/DSUR (312.33), SAE line listing, amendment planner (312.30/.31→CTD ops), 30-day regulatory clock + clinical-hold state, readiness verdict, eCTD envelope (US regional), E2B(R3) ICSR composer + gateway transport, sequence validation/diff, dispatch gate + snapshot, cockpit/portfolio/timeline/action-items.
- **IND forms** ✅ — FDA 1571/1572/3674/3454/3455 PDF fill (official AcroForm + deterministic fallback) + field QC.
- **IND documents** ✅ — cover letter, briefing book (Type A/B/C), Letter of Authorization (M1.4), cross-reference register, document renderer.
- **IND master data** ✅ — sponsors / regulatory agents / investigators registries.
- **NDA/BLA/MAA/JNDA pathways** ✅ (server) biologics intelligence (351(k), interchangeability), global pathways summaries, pathway eligibility; 🟡 client Pathway surfaces (live program table + fixture clocks).
- **Meetings / HA interactions** ✅ — meeting CRUD (planned→held→minutes), question routing + commitments, global meeting guidelines; 🟡 Meetings client surface (fixtures).
- **Designations** ✅ — orphan/pediatric (PREA/iPSP/PIP) eligibility, expedited programs (BTD/FastTrack/AccelApp/PriorRev); 🟡 client Pediatric/Orphan surfaces; ⚪ RPD voucher tracker.
- **Nonclinical / preclinical** ✅ — study registry + SEND readiness, LLM PDF ingestion (feature-flagged), M24 adapter, program loader, safety assessment.
- **Market strategy** ✅ — market readiness/registry, region profiles, exclusivity periods, global review timeline.

## A.5 · CMC (Chemistry, Manufacturing & Controls)  ✅ (collaboration/workflow 🟡)
Paths: `client/src/concept2cure/cmc/`, `server/api/cmc/`, `server/services/{cmc-*,module3-*,cmc/}`, `shared/cmc-schema.ts`, `shared/schema/cmc-os.ts`.

- **Surfaces** ✅ — Overview/portfolio, Specifications (e-signed approval), Stability (study lifecycle + shelf-life), Batch (release decision e-sign), Blueprint (QbD CQA/CPP → §3.2 generation), Change (SUPAC/variation classifier, multi-region filing path), Copilot (AI Q&A); 🟡 Global (multi-region transform).
- **Module 3 Operating System** ✅ — canonical source objects → deterministic §3.2 compilation (3.2.S.1–S.7, 3.2.P.1–P.8, 3.1, 3.3), section lineage, versioning, provenance events, staleness tracking.
- **Module 3 convergence & auto-draft** ✅ — artifact classification, build-state machine, source-section coverage matrix, completeness scoring, deterministic uploads→sources→sections bridge.
- **Contradiction detection** ✅ — 8 deterministic rules (batch rejected, comparability risk, stability failure, spec conflict, method gap, change-control misalignment, impurity breach, dissolution discrepancy) with severity + reviewer routing.
- **Write-through** ✅ — auto-upsert every CMC save to source objects (SHA-256 hash) + stale-section marking.
- **AI services** ✅ — ICH compliance checker (Q1A/Q2/Q3/Q3D/Q6/Q8/Q9/Q10), manufacturing reviewer (YAML rules); ⚪ LLM hook stubbed.
- 🟡 — analytical-method validation UI, workflow task orchestration, collaboration persistence (in-memory), control-strategy generator.

## A.6 · Biostatistics · Study Design · CDISC  ✅ (intelligence client surfaces 🟡 fixtures)
Paths: `client/src/concept2cure/intelligence/surfaces/Biostat.tsx`, `server/routes/{ana-biostats,biostat-design-stats,study-design,cdisc-validation.routes}.ts`, `server/services/{ana-biostats/,biostatistics-judgment/,study-design/,sap-generator-service,power-sample-size-service,estimand-engine-service,estimand-sap-section,statistical-defensibility-service,biostat-knowledge-graph-service,cdisc/}`.

- **AnA Biostats orchestrator (9 layers)** ✅ — input normalize → deterministic computation (t-test, proportion, time-to-event, diagnostic, multiplicity, crossover, missing-data, device/IVD) → judgment → domain → regulatory → document → workflow → SME router → interpretation.
- **Study design (USDM/ICH M11)** ✅ — design gates (estimand §2, endpoint §3, framework/multiplicity §4, power §6, SoA §7), sample-size solver (power + assurance), protocol/SAP/SoA/CRF/registration projections, trial simulator (seeded Monte Carlo), evidence prior + CSR evidence extractor, design validation, CDISC PRM persistence.
- **Estimand framework (ICH E9(R1))** ✅ — 5-attribute advisor, strategy finder, SAP-section renderer, DB-backed estimand engine + method/multiplicity recommendation.
- **Biostatistics judgment** ✅ — power adequacy, assumption fragility, endpoint-method defensibility, risk classifier, tradeoff interpreter, role-aware interpretation, statistical-defensibility service.
- **Power & sample size service** ✅ — 11 design families (NI, equivalence/TOST, ANOVA/ANCOVA, group-sequential, Bayesian, etc.).
- **Advanced stats routes** ✅ — group-sequential OC, assurance, multiplicity, diagnostic/IVD, external-control borrowing, region rules, enrollment/event forecasting, MRMC, win-ratio, BOIN, RMST, MMRM.
- **CDISC validation** ✅ — SDTM/ADaM (ADSL/BDS/OccDS)/SEND conformance, Define-XML v2.1 generator, controlled-terminology validator, package readiness.
- 🟡 Intelligence client surfaces (Protocol/Biostat/Reports/Cmc) — UI shells on fixtures pending Phase 11 endpoints.

## A.7 · PDEV · Evidence · Knowledge  ✅ (workbench/evidence-attach 🟡)
Paths: `client/src/concept2cure/pdev/`, `components/knowledge/`, `server/routes/{evidence,evidence-sufficiency,knowledge,knowledge-base,graphrag,deep-research}.ts`, `server/services/{pdev/,evidence-sufficiency/,knowledge-graph,foresight-knowledge-graph,contradiction-engine-service,confidenceScoringEngine,citation-verification-service}`.

- **PDEV (product development)** ✅ — Overview/readiness, Contradictions registry, Workstream drill-down, IND assembly readiness, readiness service + snapshots, activity registry (4 workstreams × 5 stages), orchestrator, state guard; 🟡 AI Draft Workbench (streaming), Evidence Picker (evidence-objects endpoint), Activity Detail (mutation tabs), FDA Interactions stream (apply endpoint), eCTD compile (delegates).
- **Evidence** ✅ — evidence objects CRUD + linking (8 types, evidence levels I–V), evidence sufficiency analyzer (pillar-based, deterministic) + routes.
- **Knowledge graph** ✅ — neuro-symbolic core (40+ entity types, 25+ relationships, traversal, Part 11 audit), knowledge base API (ICH/pathways/standards/deficiencies/pharmacopoeia), IVD knowledge service; 🟡 foresight KG (biomarker→endpoint); ⚪ alternate knowledgeGraphService.
- **Confidence & citations** ✅ — confidence scoring engine (multi-factor, anomaly detection), citation verification (PubMed/CrossRef), citation health/search/graph/expectations/trends; 🟡 confidence heatmap.
- **Contradiction engine** ✅ — 11+ types, source classification, 7-level truth hierarchy, authority states; 🟡 consequence service; ⚪ CMC-specific engine.
- **Deep research orchestrator** 🟡 — multi-connector fan-out + LLM synthesis + job lifecycle (connector registry integration pending).
- **Custom instructions** ✅ — per-project AI behavior (510K/IND/NDA templates).

## A.8 · Risk (ISO 14971) · Quality / QMS / SOP · Inspection · CAPA  ✅ (QC lab schemas 🟡)
Paths: `client/src/concept2cure/risk/`, `quality/`, `server/routes/{mdx-risk-management,qms,mdx-qms,qc.routes,inspections,capa-mdr,part11-compliance}.ts`, `server/services/{qms/,inspection/,capa-mdr/,part11ComplianceService}`, `shared/schema/{inspection,capa-mdr,qc-schemas}.ts`.

- **Risk management (ISO 14971)** ✅ — hazard register (severity×probability), 5×5 risk matrix (pre/post-control, ALARP bands), control hierarchy + traceability + evidence, overview/needs-attention queue, WCAG-AA color-agnostic chips.
- **QMS (21 CFR 820 / ISO 13485)** ✅ — controlled-document register + lifecycle state machine, periodic review/overdue, SOP template library, supplier quality/ASL, internal audits, management review, nonconforming product; 🟡 read-&-understood training (service built, UI fixtures).
- **Inspection readiness (BIMO/PAI/483)** ✅ — inspection lifecycle, Form 483 findings, 15-business-day response clock, readiness assessment/scoring; 🟡 full pre-inspection report (no dedicated endpoint).
- **CAPA / MDR / Complaint** ✅ — complaint intake + triage engine, MDR/vigilance reportability clocks (FDA 5/30, EU 2/10/15-day), CAPA records + actions + effectiveness, append-only vigilance timeline, unified triage queue.
- **21 CFR Part 11 (module-level)** ✅ e-signature meaning/manifestation, server-authoritative timestamps; 🟡 audit-integrity integration, access-control wiring, version lineage; ⚪ IQ/OQ/PQ tracking.
- 🟡 **QC lab schemas** — 6 quality-control tables (`qc-schemas.ts`) exposed via registered `/api/qc` route (`qc.routes.ts`, mounted in `register-clinical-intel-routes`), but the `storage.ts` write operations are fail-closed `NOT_IMPLEMENTED` stubs. (Distinct from the ✅ document-QC routes used elsewhere.)

## A.9 · Submission Center · eCTD Publishing · Regional Gateways  ✅
Paths: `client/src/concept2cure/submission/`, `server/routes/{submissions,submission-ops,submission-readiness,submission-twin,regulatory-submissions.routes,ectd*,esgSubmissionRoutes,dossier_routes}.ts`, `server/services/{submission-service/,submission-gateways/,submission-bundle-storage,submission-package-orchestrator,submission-twin-service,ectd/}`, `services/cerRenderer.js`. (`services/ectd_generator.py` deleted 2026-08-13 — dead Python stack, no Node caller.)

- **Submission Center UI** ✅ — Overview, Transmittals (ack1/2/3 chain), pre-flight Validation findings + resolve, environment/region filtering, AnA dock.
- **Gateway routes** ✅ — gateway list/transmittals/transmit/status/findings, submission-ops command center, readiness assessment, submission twin (claims/evidence/drift/change-impact).
- **Regional gateways** ✅ — FDA ESG (AS2 + SFTP, MDN ack1/2/3), EMA CESP (OAuth2) + EUDAMED (mTLS), PMDA (mTLS + HMAC), gateway registry + per-org config status.
- **eCTD assembly & validation** ✅ — eCTD 4.0 validator + ICH M8 backbone, lifecycle operator (sequence diff: new/append/replace/delete), regional packager (FDA/EMA/PMDA), assemble/package-from-core, validation rule corpus (50+ rules), regional rules, structural validator.
- **PDF/A pipeline** ✅ — detection, Ghostscript/veraPDF finalization, submission-grade gate (fail-closed in prod).
- **Dispatch gates** ✅ — deterministic dispatch-readiness validator, hard dispatch gate (blocks on errors/unack'd criticals), server-side assessor, findings report.
- **External validation** ✅ — pluggable registry, Lorenz adapter (live HTTP); 🟡 FDA-criteria adapter.
- **Bundle integrity & storage** ✅ — SHA-256 re-verify before transmit, S3 + local durable storage.
- **Cross-reference resolver** ✅, PDF bookmark/leaf renderer/DTD bundler/leaf-source resolver ✅; 🟡 STF generator, eCTD scaffolding.
- **Python codegen** ✅ — eCTD DOCX generator (Module 2.7.3), CER renderer (Puppeteer cluster).
- **Submission orchestrator** ✅ — multi-step package pipeline (M3→M2→M1→validator→ZIP→audit), idempotent.
- **Dossiers** ✅ — value dossier, classifier, dossier routes + readiness.

## A.10 · Vault · Document Management · eTMF  ✅ (vault chunks/citations ⚪)
Paths: `server/routes/{documents-unified,document-routes,document-data-center,documentOrchestrationRoutes,folder-management,mdx-vault,etmf*,ectd-documents}.ts`, `server/services/{DocumentOrchestrationService,DocumentDataCenterService,etmf/,documentReconstruction,documentExportService}`, `shared/schema/vault.ts`.

- **Document routing/orchestration** ✅ — unified routes (rate-limited), core CRUD + upload + version history, orchestration (template apply + cross-ref + lock), authoring routes.
- **Vault aggregator** ✅ — artifact list grouped by eTMF family, versions, program↔project bridge, status + eSig flag; vault storage service (deterministic versioning + content hash).
- **Vault chunks & evidence citations** ✅ — `vault.document_chunks` written by `vectorization-worker.ts` + `layout-aware-ingestion.ts` and read by `advancedRAGPipeline.ts` (semantic retrieval corpus); `vault.evidence_citations` written by the RAG pipeline. *(Corrected from an earlier "schema-only" reading after chief-investigator verification of the INSERT/SELECT sites.)*
- **eTMF** ✅ — governed TMF file/artifact CRUD with DIA-RM auto-classification (11 zones), completeness gap-check (inspection verdict), TMF completeness reference (ICH E6(R2) §8), alternate trial-scoped persistence.
- **eCTD documents** ✅ — CTD artifact CRUD (coauthor_documents backed), AI ingestion, submission-agent readiness.
- **Document Data Center (510k)** ✅ — 3-axis tagging (12 categories × 16 standards × component tree), deep semantic search (pgvector), AI tagging, citations, audit.
- **Folder management** ✅ — hierarchical tree (JWT-scoped).
- **Annotations** ✅ — sentence-level approval/review/comment/question/suggestion + replies + decide (Part 11 audit).
- **Versioning & locking** ✅, document reconstruction + export (PDF/DOCX/HTML w/ watermark) ✅.
- **Document quality** ✅ — QC routes, quality lint (Vale + LanguageTool + C2C rules), PDF validation.
- **Templates** ✅ — FDA 510(k) template service, cross-reference mapper.

## A.11 · Review · Approval · Governance · Decision/Data Lineage · Audit · e-sign  ✅
Paths: `server/routes/{approval-workflow,assumption-decision-contradiction,decision-lineage,data-lineage,audit-trail-routes,esignature,defense-packet,c2c/governance}.ts`, `server/services/{workflow/ApprovalOrchestrator,assumption-registry-service,decision-lifecycle-service,decision-record-service,data-lineage-service,governance-boundary-service,contradiction-engine-service,governed-decision-repository}`, `client/src/concept2cure/_shared/components/EsignModal.tsx`.

- **Approval workflows** ✅ — template management, initiation, approve/reject (reason), delegation, pending queue, status/history; schema `unified_workflow`.
- **Governance & decision lifecycle** ✅ — formal decision records + state transitions, decision search/timeline, assumption registry (create/supersede/status/summary), contradiction scan/review/consequence/overlay-rules/promotion-gate, reactive dependency tracking (downstream/stale/resolve/impact-summary).
- **Governance boundaries** ✅ — semantic boundaries (advisory→governed_draft→approved→locked→submission_ready), transition validation, role gate enforcement.
- **E-signature (21 CFR Part 11)** ✅ — password + MFA/TOTP verification, signature recording (server-derived validity, hash, IP), §11.50 meaning selector, reason-for-change capture, audit-integration (no signature without durable audit), client modal + hook.
- **Decision lineage** ✅ — full graph, JSON/CSV/eCTD-XML export, query, recording, hash-chain verification, multi-framework compliance report (Part 11, Annex 11, E6(R2), PMDA ERES, GAMP 5).
- **Data lineage** ✅ — upstream/downstream trace, coverage analysis, cross-module map, evidence chains, integrity verification, summary.
- **Audit trail** ✅ — paginated logs/events, single + batch event creation, signed export (HMAC) + verify, chain-integrity monitor, immutability enforcement (bulk-delete → 403).
- **C2C permission queries** ✅ — eligible-users, caller-authority check.
- **Defense packet (Phase 6.6.D)** ✅ — CRUD, staleness, build, export JSON/CSV, submission gate, waiver, proof pack (persist/download/verify), determinism replay, safety-signal ingest, predicate lineage graph, document render.

## A.12 · Tasking · Collaboration · Projects  ✅ (real-time collab / memory tab 🟡)
Paths: `client/src/concept2cure/tasking/`, `projects/`, `components/concept2cure-projects/`, `components/concept2cure-home/`, `server/routes/{projects-management,project-hierarchy,project-sections,project-modules,project-rules,unifiedTasks.routes,collaboration,realtime-collab,workspace-summary,c2c/projects}.ts`, `server/services/{project-module-bridge,project-rollup-service}`.

- **Tasking** ✅ — Overview/needs-attention, Kanban board (5-column, keyboard moves), List view, task CRUD (6 module types), status/assignment, AnA dock, unified task API; 🟡 task dependencies (link UI).
- **Projects** ✅ — Projects list (search/filters/saved-views/bulk), creation wizard (region→type→confirm), detail dashboard (header/workstreams/thread/drafts/aside), workstreams + progress, timeline, quick switcher (⌘K), archive/reason modals, aside (team/evidence/activity).
- **Project tabs** ✅ — Chats, Files, Activity (Part 11 audit viewer), Instructions; 🟡 Memory tab, Linked tab, Notifications.
- **Project APIs** ✅ — projects-management (license-enforced), c2c project detail (workstreams/drafts/team/evidence/activity), hierarchy (4-level Program→Project→Study→Sub + rollup), sections (CTD state machine + comments/history/dependencies/timeline), module linking (14 module types), rules engine (triggers→actions), rollup service.
- **Collaboration** 🟡 — activities/team presence (inference, no real-time), real-time collab (Yjs/CRDT architecture defined, transport pending); ✅ workspace summary.
- **Home** ✅ — dashboard (⌘K command palette), navigation/layout (industry-mode visible modules), projects screen (list/timeline/grid), data hooks/briefing.

## A.13 · Reporting & Analytics  ✅ (CSR builder / protocol analysis 🟡)
Paths: `client/src/concept2cure/intelligence/insights/`, `services/reportOsClient.ts`, `server/routes/{analytics-routes,report-os,report-os-insights,intelligent-reports,csr-analytics,csr-builder-routes,csr-intelligence-routes,workspace-summary}.ts`, `server/services/{report-os/,report-generator-service,intelligent-report-engine,risk-model,csr/,csr-intelligence-library,project-rollup-service}`.

- **Report-OS** ✅ — program-scoped report groups + snapshots, report type registry (20+ types, 6 scopes: account/program/project/study/submission/document), run execution + dependency tracking + blockers + confidence, render (typed blocks).
- **Immutable sealing / provenance** ✅ — deterministic content hashing + verify, atom-level provenance extraction, sealed records (draft→pending_seal→sealed→superseded→revoked), 17-regulatory-body indemnification attestations.
- **Prediction & quality** ✅ — deficiency risk (RTF/CRL/approval logistic), readiness trajectory, trial PoS (Monte Carlo), calibration/Brier quality monitoring; advisory-only with mandatory disclosure.
- **Subscriptions** ✅ — create/list/enable, cadence computation, due check; 🟡 delivery integration.
- **Provider registry & freshness** ✅; 🟡 regional comparison, portfolio aggregation.
- **Intelligent Report Engine** ✅ — 12 report domains × 17 regulatory bodies, atom provenance, seal lifecycle, audit logging.
- **CSR analytics & intelligence** ✅ — real-data dashboard (list/stats/search, 30s cache), deterministic extraction library (sample size, p-values, design, blinding, duration, ICH E3 section validation).
- **Insights UI** ✅ — scope switcher, report catalog, rendered viewer, chart components (readiness ring, calibration plot, forecast band, trend line, lifecycle stacked bar, program bar, data-table fallback), hooks.
- 🟡 **CSR builder** (section drafting/comparison/safety-analysis, AI w/ template fallback), **protocol analytics** (PDF extraction via Python subprocess, confidence scoring).

## A.14 · ANA Persistent AI Assistant & AI Actions  ✅ (features-API 🟡 mock)
Paths: `client/src/concept2cure/components/ana/`, `services/cortexService.ts`, `hooks/useAnaChat.ts`, `server/routes/{ana-ri/,ana-cortex,ana-features,ana-intelligence,ana-tool-policy,ai-actions,coauthor}.ts`, `server/services/{ana-ri/,ai-actions/,multi-agent-council,kernel-router,ana-context-builder,ana-guidance-executor,ana-personality}`.

- **ANA chat shell (UI)** ✅ — Ana core (thread hydration, suggested actions, project-intelligence card), ChatView (streaming, scroll-follow, tool-call transparency, evidence chips, extended-thinking), Composer + ToolPicker (drag-drop upload→OCR→memory, tool pinning, stop button), Message (metadata chips, action chips, edit-regenerate), EmptyState, Sidebar/TopBar/Recents (export-as-markdown).
- **Client streaming** ✅ — `useAnaChat` SSE (status/orchestration/text/grounding/tool/artifact/done/post_done), 90s idle timeout, evidence summary, detected lens, suggested actions; 🟡 legacy cortexService/useCortex.
- **Server streaming** ✅ — `/api/ana-ri/stream` (orchestration, context assembly, agentic tool loop, gateway failover, keepalive ping), non-streaming `/chat`, post-processing (guidance/command executor, evidence validation, persistence), thread helpers.
- **Orchestration** ✅ — orchestrator (intent/submission-type detection, section guidance, role-adaptive), multi-agent council (Drafter→Statistician→Critic→Synthesizer), kernel router (task type/strategy/risk tier/temperature/token clamp/tool policy), **agent-swarm** (`/api/agent-swarm`, LangGraph multi-agent submission-automation orchestrator).
- **AI Actions** ✅ — registry + dispatcher (idempotency, permission, timeout, distributed lock, concurrency, circuit breaker, audit), handlers (promote_artifact, run_validation, refine_with_validation, export/route/save-version, attach_sources, register_inline_ai, extract_template, render_with_template, ocr_extract), queue + SSE status stream, REST route.
- **Context & guidance** ✅ — Lumen context builder, guidance executor (confidence-gated auto-execute), ANA personality, context enrichment (governance/precedent/safety/clinical/signals), enforcement (structure/evidence-discipline/quality gates), evidence validation, data-integrity advisor (ALCOA+).
- **Tool system** ✅ — tool definitions + policy, tool picker, policy route, executor + agentic loop (concurrency, max-chain depth).
- **Intelligence/knowledge** ✅ — ana-cortex regulatory analysis, ana-intelligence (Claude draft/stream/review/gap/vision/batch/quick), ICH guideline corpus (65+), industry wisdom pack, agency tactics, decision frameworks, persona/role-lens/client-attunement; 🟡 ana-features (mock dev routes).
- **Command execution & metrics** ✅ — command executor (project/document/task/artifact/dossier + MDX/PDEV handlers), document actions, ana-ri metrics, kernel decision record.

## A.15 · Pharmacovigilance · Reg-Correspondence · Reg-Intelligence/Precedent · Research Compliance  ✅ (correspondence parser & digital twin 🟡)
Paths: `server/routes/{pharmacovigilance-routes,sentinel-routes,regulatory-correspondence,regulatory-graph,regulatory-intelligence,regulatory-precedent-intelligence,regulatory-programs,regulatory-assessments.routes,regulatory-digital-twin,iacuc,ibc,irb,financial-disclosures,grants,research-compliance,effort-certification}.ts`, `server/services/{compliance/pharmacovigilanceService,sentinel/,regulatory-correspondence/,regulatory-precedent-intelligence/,regulatory-graph/,regulatory-assessments/,lifecycle-obligations/,ptrs/,research-compliance/,irb/,iacuc/,ibc/,financial-disclosures/,grants/,effort-certification/}`.

- **Pharmacovigilance** ✅ — AE/SAE/SUSAR/AESI intake, ICSR E2B(R3) generation, periodic reports (DSUR/PSUR/PBRER/PADER), signal detection (PRR/ROR/chi²/EBGM), risk management plans (GVP V), deadline calculator, compliance matrix.
- **Sentinel proactive monitoring** ✅ deadline-risk analyzer + config/finding lifecycle/scans; 🟡 cross-project, regulatory-change, quality-drift, budget-burn analyzers (framework, logic TBD).
- **Regulatory correspondence** ✅ submission/correspondence persistence, timeline events, outbound logging, parser health; 🟡 issue parser, operating layer (issue→task), response assembly (stubs).
- **Regulatory intelligence** ✅ — requirement registry, per-phase summaries; 🟡 guidance aggregation (sample data).
- **Regulatory precedent engines** ✅ — CRL/RTF triggers (nonclinical+CMC), EMA question taxonomy, advisory-committee risk, confidence calibration, cross-jurisdictional reliance; seed orchestrator (real FDA citations).
- **Regulatory digital twin** 🟡 — reviewer persona modeling, RTF/deficiency/AC/timing Monte Carlo prediction (explicitly NOT validated; honesty disclosure ✅); IVD reviewer simulation 🟡.
- **Regulatory assessments** ✅ — append-only audited verdict snapshots per program.
- **Regulatory graph** ✅ — evidence-claim traversal, orphan/contradiction detection, standards applicability, defense-packet staleness.
- **Regulatory programs** ✅ — expedited-pathway enrollment (BTD/FastTrack/PriorReview/AccelApp/Orphan/RMAT) + benefit tracking.
- **Lifecycle obligations & PTRS** ✅ — PMC/Phase-IV obligation tracking, pediatric PREA study-plan/waiver tracking.
- **Research compliance (academic)** ✅ — IRB (submissions/reviews/amendments/consent/reportable-events), IACUC (protocols/pain-category/cohorts/3Rs), IBC (rDNA/risk-group/containment), FCOI (21 CFR 54 disclosures + interests + signature), research-compliance foundation (personnel roster, training records, compliance checklist, "no-index-until-trained" gate), grants (opportunity→proposal→award→milestone→closeout 2 CFR 200.344, subaward screening, budget vs actual, cost-share, NCE), effort certification (2 CFR 200.430).

## A.16 · Admin · Setup · Billing · Entitlements · Client Portal · Branding  ✅ (admin UI 🟡 fixtures)
Paths: `client/src/concept2cure/mdx/surfaces/AdminSurface.tsx`, `server/routes/{tenant-users,mdx-admin,admin/scim-tenants,admin-security,admin/audit-siem,billing,billing-dashboard,module-subscriptions,api-keys,client-branding,tenant-config,clients-routes,operating-system}.ts`, `server/routes/enterprise/`, `server/services/{billing,entitlements/,api-key-service,license-manager,tenant/}`.

- **Admin** 🟡 AdminSurface UI (fixture fallback on `useAdmin`); ✅ `mdx-admin` endpoint returns **live** members/roles (queries `organization_users` + roles); ✅ SCIM tenant management, admin security-health, audit SIEM feed; 🟡 tenant-users CRUD, compliance-docs facet empty.
- **Account intelligence** ✅ — `/api/account-intelligence` (account-level canon, skill bundles, template registry; registered in `register-governance-routes`).
- **Billing** ✅ — Stripe checkout/portal/status/pricing, DTC self-serve, webhooks; dashboard (usage/summary/invoices/budgets/alerts/rate-limits/activity); billing service.
- **Entitlements** ✅ — MDX feature gating (tier→feature, 8 features × 4 tiers), license manager + module catalog, capabilities/entitlements endpoints.
- **API keys** ✅ — generation (csai_ prefix, SHA-256, returned once), validate (timing-safe), revoke, usage, rate limit per key.
- **White-label branding** ✅ — settings, logo/letterhead upload, template CRUD + render, tenant-scoped serving.
- **Tenant configuration** ✅ — settings (branding/security/notifications/workflow/cer/qmp/integration), tier-aware defaults, reset, per-section update.
- **Client portal** ✅/🟡 — client workspaces list/get/metrics + create/delete wired (`clients-routes.ts`); 🟡 license routes (fetch/usage).
- **Operating system** ✅ — assumption/decision record endpoints (org-scoped).

---

# Section B — Central Services for All Clients

*Cross-cutting platform services consumed by every feature-area above. Client-facing features that are also shared infra (e.g. e-signature, audit query, RAG client surfaces) are described in Section A and only cross-referenced here.*

## B.1 · AI Gateway & Memory/Context  ✅
Paths: `server/services/ai-gateway/` (gateway, types, policy, promptInjection, audit, providers/, embeddings/, prompts/), `server/services/{memory-orchestrator,memory-context-assembler,working-memory,shared-memory-contract,memory-consolidation-job,client-intelligence-memory}`, `server/services/ai/` (openai-orchestrator, LiteLLMAdapter).

- **AI Gateway core** ✅ — single seam (`getGateway()`) for all LLM calls; multi-provider routing (OpenAI/Anthropic/Moonshot/Bedrock/Vertex/Azure/local), quality/cost/latency/task/round-robin strategies, same-provider-then-cross-provider fallback ladder, request retry, concurrency limiter.
- **Provider executors & clients** ✅ — OpenAI/Anthropic/Moonshot executors, lazy SDK clients (optional Bedrock/Vertex/Azure peer deps, null-on-absent), provider health (EMA latency + error-rate decay).
- **Policy engine** ✅ — token budget, per-org/user rate buckets, content filters, cost tracking.
- **Prompt-injection detection** ✅ — double-requirement heuristics (verb + meta-reference), ReDoS-safe.
- **Audit** ✅ — 28-column `ai.gateway_audit_log`, in-memory buffer + stats (21 CFR Part 11).
- **Embedding orchestration** ✅ — OpenAI / self-hosted (vLLM/TEI/LiteLLM) two-lane provider seam.
- **Deterministic mode** ✅ — keyless-boot demo templates ([KNOWN]/[INFERRED]/[MISSING]); production safeguard refuses fallback.
- **Data residency / ZDR** ✅ — placement registry (substrate × region × ZDR), hard filter (never fallback across compliance boundary), org-default policy.
- **Memory (3-layer)** ✅ — orchestrator (cross-layer scoring/forgetting/dedup), context assembler (recency + semantic, 3s/layer timeout fallback), working-memory (structured 7-field summary, semantic opt-in), shared-memory contract, nightly consolidation job (WM→project memory), client-intelligence memory (org/project profiles + document ingestion + semantic search); 🟡 legacy in-memory memory-service.
- **Prompt templates** ✅ — 10 domain dirs (consistency-check, cross-region-gap, dispatch-qc, document-classify/extract, fcoi-review, section-generation, shadow-review, submission-plan, validation-explain).

## B.2 · RAG / Corpus / Embeddings / Search  ✅ (GraphRAG ⚪, OpenSearch & deep-research 🟡)
Paths: `server/services/{ragRouter,advancedRAGPipeline,rag-query-transforms,rag-retrieval-strategies,rag-reranker,rag-fusion,rag-filters,rag-corrective-loop,rag-runtime-metrics,enhancedEmbeddingService,embedding-corpus-policy,corpus/,search/,deep-research-orchestrator}`, `server/routes/graphrag.ts`.

- **RAG router** ✅ — single entry point; intent (regulatory_qa/foresight/project_scoped) → policy; corpus selection (vault/rag_chunks/client_memory/project_memory).
- **Advanced pipeline** ✅ — 4 corpus paths, auxiliary-LLM caching; delegates to focused sub-services.
- **Query transforms** ✅ — step-back, multi-hop decomposition, self-query filter extraction.
- **Retrieval strategies** ✅ — HyDE, multi-query, step-back, decompose, RRF-fused batch retrieval.
- **Reranking** ✅ — LLM-judge (default, cached) + pluggable cross-encoder (Cohere/Voyage, opt-in); score blending.
- **Fusion** ✅ — Reciprocal Rank Fusion, hybrid dense+sparse, MMR diversity.
- **Filtering** ✅ — metadata→SQL predicates (doc type/source/date), corpus-specific columns.
- **Corrective loop** ✅ — CRAG/Self-RAG (sufficiency grade, query rewrite, groundedness verify).
- **Context expansion** ✅ — small-to-big neighbor windowing (vault/rag_chunks).
- **Runtime metrics** ✅ — Prometheus histograms (latency, candidates, top-score, outcome).
- **Embeddings** ✅ — enhanced embedding service (auto-embed, batch, cache, multi-model, retry), embedding-corpus-policy (8 corpora, model-per-corpus, CI canonicality gate), provider abstraction (OpenAI ↔ self-hosted, air-gap ready).
- **Corpus ingestion** ✅ — CT.gov v2 fetch → CSR/E3 normalizer → Drizzle writer (idempotent on NCT id), precedent benchmark reader.
- 🟡 OpenSearch keyword search (feature-flagged), deep-research orchestrator (connector fan-out partial), GraphRAG (`/api/graphrag` registered in `register-advanced-platform-routes` + exposed as agent-swarm `graphrag_query` tool, delegates to a Neo4j Python connector; graph tables not yet in schema — graceful fail, so 🟡 not ⚪).

## B.3 · Auth / RBAC / SSO / SCIM / MFA / Multi-tenancy / RLS  ✅
Paths: `server/auth/`, `server/auth.ts`, `server/middleware/{authAdapter,auth.js,tenantContext,tenantIsolation,tenantAuth,lazyRequestDbClient}`, `server/db/{tenantStore,tenantRls,rlsEnforcement,requestDb,withTenantConnection}`, `server/routes/{auth,authEnterprise,sso,scim,tenants,tenant-users,users,enterprise/rbac-routes}`, `server/services/{mfaService,emailOtpService,auth-security-service,saml-provider,roleBasedAccess,token-revocation}`.

- **JWT & session** ✅ — access (24h) + refresh (7d, separate secret) issuance, verification w/ key rotation, revocation.
- **MFA** ✅ — TOTP (RFC 6238, AES-256-GCM secret), backup codes (SHA-256), email OTP, 5-min challenge tokens.
- **Enterprise auth flow** ✅ — check-email (enumeration protection) → verify-password (lockout) → verify-MFA → select-org; NIST 800-63B password policy + history; e-signature flow.
- **SSO** ✅ — SAML 2.0 (XML-DSig signed-assertion enforcement, XSW protection), multi-org via RelayState, JIT provisioning, SLO, request signing.
- **RBAC** ✅ — 5-level hierarchy (viewer→super_admin), two-layer (role + fine-grained `resource:action`), deny-by-default, 60s TTL cache, role assignment routes.
- **Tenant context & isolation** ✅ — JWT-only org binding (header-override blocked + audited), org active/membership validation, lazy request-scoped DB client w/ RLS session vars (AsyncLocalStorage propagation).
- **RLS** ✅ — Postgres policy (off/shadow/on modes, production fail-closed `RLS_REQUIRE_ENFORCE`), tenant trigger (auto org_id), super-admin bypass.
- **SCIM 2.0** ✅ — RFC 7643/7644 user/group lifecycle, bearer token (env or DB-backed multi-tenant), IP allowlist, deprovisioning.
- **Account security** ✅ — lockout (5 fails/30 min), password history (last 5), expiry; dev-auth dual-gate (CI-enforced).

## B.4 · Audit Trail / 21 CFR Part 11 / Observability / Telemetry  ✅
Paths: `server/services/{auditService,part11ComplianceService,audit/ (chain,audit-hmac-seal,chainIntegrityMonitor,audit-integrity-service,auditLogger,signedAuditExport),observability/ (langfuseService,redaction),telemetry/ (opentelemetry,betaFlowTelemetry),usage-metering,governance-observability,kernel-observability}`, `server/middleware/{audit-trail,auditLogger.js}`, `server/utils/sentry.ts`, `server/events/eventBus.js`.

- **Audit service** ✅ — dual-write (Drizzle `audit_logs` + tamper-proof log), filtered query, fallback console logging.
- **Hash chain + HMAC sealing** ✅ — SHA-256 chain computation/verification, HMAC-SHA256 record sealing (timing-safe), combined integrity service (fail-closed; unverifiable when `AUDIT_HMAC_KEY` absent).
- **Chain integrity monitor** ✅ — 5-min background per-org check + daily sweep job (`auditChainIntegritySweep`), CRITICAL logging.
- **Part 11 compliance service** ✅ e-signature gen/validate (RSA-SHA256, 10-yr expiry), audit-trail dual-write, access control, system-validation report; 🟡 data-integrity hash methods stubbed.
- **Audit routes** ✅ — paginated logs/events, signed export (HMAC manifest) + verify, chain-monitor status, immutability enforcement.
- **Observability** ✅ — Langfuse LLM tracing (opt-in, redacted), redaction engine (secrets/PII deep walk), OpenTelemetry (opt-in, prod misconfig guard), Sentry (PII fail-closed `beforeSend`).
- **Metering & metrics** ✅ — usage metering (tier-based credit quotas), governance observability (counters/health/ring-buffer), kernel observability (KDR/policy/plan/protocol).
- **Event bus** ✅ — pub-sub with DB persistence (`ind_events`).

## B.5 · Storage / Vault Integration / Document Processing / OCR / Integrations  ✅ (several connectors 🟡)
Paths: `server/services/storage/` (s3/local providers), `server/services/{vaultService,ocr/,documentIntelligence/,documentQuality/,pdf-converter,pdf-compression-service,docx/,document-analysis,documentExportService}`, `server/integrations/` (veeva-vault, docling, unstructured, tika, grobid, ocrmypdf, scispacy, citationjs, redlines, languagetool, vale, verapdf, firecrawl).

- **Storage** ✅ — provider factory (S3 + local), versioned org/project-scoped vault paths, AES-256 + signed URLs, content-hash audit; 🟡 legacy vaultService.
- **Veeva Vault** ✅ — client (session pooling), field mapper, sync service (push/pull, idempotent links, audit), fail-closed credentials.
- **OCR** ✅ — facade + capability detection, Tesseract WASM (no system dep), PDF rasterizer/inspector, multi-method text extractor, OcrMyPdf client.
- **Document intake pipeline** ✅ — Tika (metadata) → OCR (scanned) → Docling (primary) → Unstructured (fallback) → WASM OCR; spreadsheet service; 🟡 feature flags.
- **Parsing connectors** ✅ Docling, Unstructured, Tika, scispaCy; 🟡 GROBID (TEI-XML), CitationJS, Redlines (Python subprocess).
- **Quality/validation** ✅ — quality lint (Vale + LanguageTool + C2C medical-writing rules), LanguageTool/Vale clients; 🟡 veraPDF (binary-dependent), PDF validation attachment.
- **PDF conversion/compression** ✅ — deterministic DOCX→PDF (LibreOffice/Puppeteer, metadata-normalized for Part 11), Ghostscript 5-tier compression; 🟡 DOCX→PDF pipeline, PDF export framework.
- **Document analysis** ✅ — structure parser, search, section diff.
- **Web scraping (Firecrawl)** ✅ — client (retry/HMAC), scrape/extract/search/crawl routers, webhook verify, policy + per-tenant quota.
- **DOCX generation** ✅ — factory, master-document builder, template registry.

## B.6 · Background Workers / Jobs / Ingestion / Python Microservices  ✅ (enhanced-pipeline & Benchling 🟡)
Paths: `server/jobs/` (driftSentinelSweep, auditChainIntegritySweep, corpusIngestionSweep, regulatoryHorizonScan, externalIntelligenceSweep, retentionCron), `server/workers/` (entity-extraction, vectorization, layout-aware-ingestion, ivdr-pack, enhanced-ingestion-pipeline), `workers/artifact-compute/`, `ingestion/` (Python: pdf_extractor, benchling_connector). (The `services/` Python stack — celery_app, job_store, worker, api, secure_runner, ectd_generator — was deleted 2026-08-13; no Node caller, never deployed.)

- **Scheduled jobs (self-guarding, defensive)** ✅ — drift-sentinel sweep (fact-binding reconciliation), audit-chain integrity (daily), corpus-ingestion (CT.gov flywheel, weekly), regulatory-horizon scan (weekly self-study: harvest→distill→promote→digest), external-intelligence sweep (nightly, default-on), document-retention cron (archive-before-delete, policy-driven).
- **Background workers** ✅ — entity-extraction (24 entity types → knowledge graph), vectorization (chunk + embed → document_chunks, cache + retry), layout-aware ingestion (GPT-4o vision tables/figures), IVDR pack worker (deterministic snapshot + SHA-256, SELECT…FOR UPDATE SKIP LOCKED); 🟡 enhanced-ingestion-pipeline (orchestrator).
- **Python async infra** ✅ — Celery + Redis (late-acks, reject-on-lost, time limits), durable job store (Redis + in-memory fallback), secure runner (hardened Docker: read-only, cap-drop, network-none, symlink-safe mounts), FastAPI gateway (bearer auth, eCTD generate/status/download), eCTD DOCX generator, artifact-compute DOCX runtime.
- **Ingestion (Python)** ✅ — multi-strategy PDF extractor (PyMuPDF→PyPDF2→pdfminer→Tesseract cascade); 🟡 Benchling LIMS connector.

## B.7 · Data Layer — Schema / Migrations / ORM  ✅ (CDISC ref & QC ⚪)
Paths: `shared/schema.ts` + `shared/schema/` (40+ domain modules), `shared/cmc-schema.ts`, `shared/evidenceSchema.ts`, `shared/docTypes.ts`, `database/` (policies/, schema/, seed/), `migrations/` (122 files), `sql/`, `server/db/`, `drizzle.config.ts`.

- **ORM & infra** ✅ — Drizzle (primary, drizzle-zod validation) over PostgreSQL + pgvector; 122 migrations; RLS policies in `database/policies/`; ~60 pgEnums. *(Correction: `server/prisma/client.js` is a **live** Prisma-compatible wrapper over Drizzle — tenant-guarded, with active consumers (`semanticSearch.js`, `bulk_import.js`) + tests — NOT a deprecated ORM to remove. Only the orphaned `schema.prisma` descriptor is vestigial.)*
- **Data domains (~649 `pgTable` definitions across `shared/` — 419 in the monolithic `shared/schema.ts` + 230 in the 60 `shared/schema/` modules; the large majority actively used)** ✅ — tenancy/auth (organizations, clientWorkspaces, users, organizationUsers, billing), submissions (submissions, submissionLeaves, ectdSequences, fda510k*, ind*, qSub*, deviceSubmissions), documents (sharepoint_*, unifiedDocuments, coauthor*, ctd*, documents/versions/folders), evidence/provenance (submissionEvidenceLinks, evidenceObjects, evidenceClaims), regulatory (regulatoryPrograms, lifecycleObligations, standardsApplicability, regulatoryAtoms, regulatoryAssessments), CMC (cmcProjects, drugSubstances/Products, stabilityStudies, cmc-os tables), CSR knowledge DB (csr* — design/population/endpoints/safety/PK/analytics/intelligence), clinical governance (protocols, investigators, irb*/iacuc*/ibc*, clinicalStudies, nonclinical/sendDatasets), financial disclosures + HA interactions, eTMF + inspection, device/IVD (medicalDevices, deviceTestStandards, ivdr*, gspr*, capa-mdr), workflow orchestration (workflowRuns, approvalCheckpoints, unified_workflow), reporting/intelligence (report-os, external-intelligence, ana-intelligence/relational, living-record-spine), AI/ML (aiMlPccp, aiAuditLog), templates/feature-flags, integrations (connectorCredentials, apiKeys, scim*), audit/compliance (auditLogs, electronicSignatures, provenance events), grants/effort, RIM (products/registrations/labels), controlled substances, UDI, support/admin.
- ✅ vault chunks/citations (`vault.document_chunks`/`evidence_citations`) — actively written by vectorization/layout workers + RAG pipeline (see A.10).
- 🟡 `cdisc_prm_*` subset (studies/arms/endpoints) — activated by `study-design-repository.ts` (INSERT/SELECT); `qc-schemas.ts` — reachable via `/api/qc` but storage writes stubbed; lightly-used: pkpdCompartments, pvSignalAssessments, biomarkerOntology/meddraTermReference.
- ⚪ stubs (defined, no active code path): the remaining ~34 CDISC reference tables (eCTD/PQ/device/CDASH/ADaM in `cdisc-reference.ts`).

## B.8 · Feature Flags / Entitlements / Quota / Rate-limiting / Notifications / Control Plane  ✅ (SoD & QA-notify 🟡)
Paths: `server/services/{featureToggleService,entitlements/,atomicQuotaService,quotaEnforcementService,emailService,notify,api-key-service,ana-platform-controller,governance/permissions,governance/separation-of-duties,governance-observability}`, `server/middleware/{rateLimiter,redisRateLimiter,circuitBreaker}`, `server/routes/{operating-system,ana-platform-control}`, `server/src/routes/control-plane.router.ts`, `server/src/control-plane/kernel.ts`.

- **Feature toggles** ✅ — global/per-org/per-workspace evaluation (fail-safe false), persistence.
- **Entitlements** ✅ — MDX tier→feature mapping (deterministic), platform capabilities discovery.
- **Quota enforcement** ✅ — atomic quota service (SELECT…FOR UPDATE: projects/users/submissions), quota-enforcement service + Express middleware (submissions monthly / projects / users / storage), usage statistics.
- **Rate limiting** ✅ — in-memory limiter (10k IP cap) + Redis sliding-window (fail-closed auth/docs, fail-open others, memory fallback).
- **Circuit breaker** ✅ — state machine (CLOSED/OPEN/HALF_OPEN) + request queuing.
- **Notifications / email** ✅ — Nodemailer SMTP (password-reset/OTP/welcome/invitation/report-delivery/generic, branded HTML, console fallback); QA override notify (`notify.ts`) — both email (Nodemailer) and Slack webhook implemented.
- **API key management** ✅ (see A.16; central seam).
- **Platform control plane** ✅ — Ana platform controller (paid-only, audit-logged, HITL breakpoints), control-plane kernel (policy bundle, decision logging, hash-chain verify, self-tests), governed-document fabric routes.
- **Governance permissions** ✅ — 8-role default policy, grant matching, org overrides; 🟡 separation-of-duties.

---

# Section C — Coverage & Validation Summary

**Chief-investigator cross-checks performed:**
1. **`LayoutMode` enum** (`zen-app-constants.ts`) — every *live* surface maps to a Section-A area. The enum also contains **compatibility-redirect** (`workspace`, `assistant`, `ctd`, `medtech-dashboard`, `dossier`), **demoted** (`mission-control`, `snowglobe`, `sherpa`, `platform-admin`, `collaboration-hub`, …), **legacy batch-1**, and **no-renderer MissionControl sub-modes** — these have **no active renderer** (redirect on mount or kept for type safety only) and are intentionally **not** catalogued as live features.
2. **Route registration spine** (`server/startup/routes.ts`, `server/bootstrap/register-*-routes.ts`) — all ~20 registration families covered: 13 primary (Platform, Core, AI, Admin, Governance, IndLifecycle, Regulatory, Document, Tenant, Project, ClinicalIntel, AdvancedPlatform, Integrations) + 6 inline (EarlyRoutes, AnaIntelligence, LitCommerce, PlatformFacades, AiWorkflow, SubmissionWorkflow). A handful of individually-mounted routes surfaced by the coverage audit are now catalogued: `/api/agent-swarm` (A.14), `/api/account-intelligence` (A.16), `/api/ai/claims` (A.2/A.3 IVDR binder promotion). Note: `register-document-routes` applies a **beta route fence** (`EXPERIMENTAL_ROUTES_ENABLED`/`DEMO_ROUTES_ENABLED`) to its experimental/demo families; other families mount without an equivalent guard.
3. **Schema** (`shared/schema.ts` + `shared/schema/`) — ~649 `pgTable` definitions across 21 data domains mapped to feature-areas (B.7); the large majority actively used, with the noted Partial/Stub exceptions (CDISC non-PRM subset, QC write-path).
4. **Top-level directories** — `client/`, `server/`, `services/`, `workers/`, `ingestion/`, `shadow_service/`, `shared/`, `database/`, `ectd/`, `templates/`, `schemas/`, `policy/`, `regulatory_data/`, `csrs/` all represented.

**Notable maturity findings (the inventory-management signal):**
- **Strong / Built end-to-end:** authoring + citation engine, IND lifecycle (deterministic + tested), submission/eCTD + regional gateways, CMC Module-3 OS, biostatistics/study-design/CDISC, audit hash-chain + e-signature, auth/RBAC/SSO/SCIM/MFA/RLS, AI Gateway + RAG + 3-layer memory, report-OS + immutable sealing, research-compliance (IRB/IACUC/IBC/FCOI/Grants/Effort).
- **Backend-ahead-of-UI (🟡):** QMS/Inspection/CAPA (services built, limited client UI), reporting prediction layer, biopharma client Pathway/Meetings/Pediatric/Orphan/PV surfaces (fixtures over partial live data), Intelligence client surfaces (Phase 11 endpoints pending), Admin surface (fixture-backed UI).
- **Honest fail-closed gaps (🟡):** eSTAR official PDF fill (templates not vendored), CER full-narrative auto-assembly, CDx workflow engine, regulatory correspondence issue parser/operating-layer/response-assembly, Sentinel analyzers 2–5, deep-research connector fan-out.
- **Honesty-labeled (not validated):** Regulatory Digital Twin (Monte Carlo illustration, explicit disclosure attached).
- **Unused/schema-only (⚪):** ~34 CDISC reference tables (eCTD/PQ/device/CDASH/ADaM — the `cdisc_prm_*` subset is active), intelligent-docs Compliance Guardian/Document Sherpa/Data Bridge (types only), legacy `LayoutMode` modes with no renderer. *Inventory-management recommendation: activate or prune.* (Note: vault chunks/citations, GraphRAG, and QC lab schemas were re-classified up from ⚪ during the audit reconciliation — see A.8/A.10/B.2.)

**Self-consistency:** Features that are both client-facing and shared infra (e-signature, audit query, RAG, document processing) are described once in Section A and cross-referenced (not re-described) in Section B.

---

# Section D — Complete route-surface sweep (deep pass)

A second swarm classified **all 307 distinct top-level route basenames** in `server/routes/` (plus the nested routers under `ind-lifecycle/`, `ana-ri/`, `cmc/`, `enterprise/`, `admin/`, `c2c/`). Every file resolves to a Section-A/B area, an infra/security utility, or test-only scaffolding — none are orphaned. Counts by home area (top-level files): A.14 ANA/AI ~30 · A.9 Submission ~26 · A.3 Device/IVD ~24 · A.16 Admin/Tenant ~22 · A.15 PV/RegIntel/Research ~22 · A.4 Biopharma/IND ~21 · A.8 Risk/Quality ~14 · A.7/A.10/A.13 ~12 each · A.2/A.11/A.12 ~10 each · A.6 ~6 · Infra/Test ~8.

The sweep surfaced these **capabilities not separately named in Sections A/B** (all code-verified; maturity in the standard legend):

**Device / IVD (A.2/A.3/A.8)** — all ✅ unless noted:
- `cybersecurity-524b` — FDA §524B SBOM completeness + cybersecurity readiness scoring.
- `human-factors` — IEC 62366-1 HFE/UE file completeness + use-related risk.
- `design-risk` — 21 CFR 820.30 design controls + ISO 14971 RMF.
- `mdx-software` — IEC 62304 software-lifecycle deliverable tracking (SRS/SDS/threat-model/SBOM/pentest); `mdx-engineering` — DHF/ECR/BOM aggregator.
- `diagnostics-performance` / `mdx-ivd-performance` — CLSI EP05/06/07/09/12/17/25/28 analytical + clinical (ROC/κ) IVD computations.
- `mdx-clia` (CLIA categorization/waiver), `mdx-ldt` (LDT inventory + FDA LDT-rule phase milestones), `mdx-cdx` + `companion-diagnostics` (CDx pairings/concordance), `ivd-assessments` (lifecycle-calc persistence), `ivdr-binder` (IVDR evidence binder + pack builder), `device-cockpit` (cross-pathway readiness rollup), `device-projects` (device project CRUD).
- `se-matrix` 🟡 — safety/efficacy matrix render orchestration (Shadow Service + DOCX factory + audit).

**Submission / market access (A.9)** — all ✅ unless noted:
- `market-access` — CPT/HCPCS coding classification + coverage-dossier completeness.
- `haq-manager` — Health-Authority-Question response workflow (extract→assign→AI-draft→review→approve; FDA IR / EMA D120 / PMDA / HC).
- `harmonize` — cross-module terminology/structure consistency; `validate-completeness` — rule-based completeness + RTF-risk + Go/No-Go.
- `universal-packager` — single endpoint for all packaging (PDF/DOCX/ZIP/eCTD-ZIP/HTML/JSON/CSV/XLSX/XML); `fda-forms` — FDA form registry/orchestration.
- `regulatorySubmissions` — hierarchical projects→sequences(gates)→modules(tasks)→granules; `regulatory-registry`, `global-markets`, `region-profiles` — global market/region reference + planner.
- `spl-fhir` — LOINC/SPL/FHIR interoperability validation; `rtm-export` — Requirements Traceability Matrix export (CSV/JSON from evidence claims/links).

**Evidence & RWE (A.7/A.15)** — all ✅:
- `evidence-fabric` (Shadow-Service evidence health/contradiction/defense-packet proxy), `evidence-search` (hybrid OpenSearch+DB), `evidence-ask` (Data-Room grounded Q&A), `external-evidence` (Firecrawl web evidence).
- `real-world-evidence` — RWE integration: FHIR, claims, registries, FAERS, signal detection, propensity scoring.
- `global-compliance` — regional config + GDPR (RoPA/DPIA/DSR) + PV/AE/RMP; `precedent-engine` + `saved-precedent-queries` — precedent search/compare/strategy.

**Quality / tenant governance (A.8/A.16)** — all ✅:
- `tenant-ctq-factors` (Critical-to-Quality CRUD), `tenant-quality-validation` (section validation vs CTQ controls), `tenant-section-gating` (eCTD section access gating), `tenant-traceability` (requirement→evidence matrix), `quality-management-api` (CTQ aggregator); `tenant-stats`, `tenant-export` (org export + Part-11 attestation).

**ANA / Cortex / Foresight / Innovation (A.14)**:
- `cortex-unified` ✅ (consolidated Cortex gateway), `cortexAdvisory` ✅ (IND-pyramid risk / 510k sections / rejection patterns), `cortexRoutes`/`cortexManagement`/`cortexQuery` 🟡 (atoms/graph/epistemic — service-delegated), `conversation-os` ✅ (artifact-proposal/scout/plan-execute/quality-lint), `biotech-artifacts` ✅ (eCTD/ICSR/PSUR generation), `learning-horizon` ✅ (self-learning loop read API).
- `foresight-api`/`foresight-ai-advanced`/`foresight-feedback` 🟡 (clinical-trial success prediction, biomarker/PKPD, feedback loop), `ana-cortex-ft` 🟡 (fine-tuned model registry/eval), `ana-mdx-context` 🟡, `conversation-health` 🟡, `chat-actions` 🟡.
- `innovation` 🟡 — 8-feature suite (Regulatory Delta Radar, Evidence Confidence Heatmap, Submission Readiness Twin, Auto-traceability, Adaptive Reviewer Workspace, Outcome-based Template Learning, Negotiation Logbook, Compliance Guardrails SDK).
- `nanoBanana` 🟡 (Gemini image/slide generation, dev-gated), `smart-blocks` 🟡 (auto-populated content blocks, unregistered), `cognitive-ecosystem` ⚪ (LangGraph agents / manufacturing digital-twins / federated-learning — routes real, most logic mock).

**Other**: `ind-autodraft` ✅ (IND auto-draft from source docs, A.4), `clinical-operations` ✅ (full trial lifecycle: sites/enrollment/milestones/deviations, A.12), `field-sync` ✅ (SSE SmartFieldLinking, A.10), `predictive-sections` ✅ + `audit-services` ✅ (A.13/A.11), `document_qc_routes` ✅ (A.10), `escalate` 🟡 (issue-escalation framework, A.11), `controlled-substances` ✅ (DEA registrations/ledger, A.15), `public-api` ✅ (external `/api/v1` via X-API-Key, A.16).

**Infrastructure / security utilities** (not client features): `well-known` ✅ (RFC 9116 security.txt), `csp-report` ✅ (CSP violation logging), `_ops-predicate-shadow` ✅ (K8s liveness/readiness probes), `beta-telemetry` 🟡 (beta-workspace telemetry).

**Test-only scaffolding** (⚪, production-blocked): `test-assembly`, `integration-test` (E2E pipeline smoke test), `seed-demo` (510(k) demo seeding), `misc-inline` (fallback templates).

---

# Appendix — Directory → module map

| Directory | Maps to |
|---|---|
| `client/src/concept2cure/{authoring,mdx,pdev,cmc,risk,biopharma,labeling,submission,intelligence,quality,tasking,projects}/` | A.1–A.13 client surfaces |
| `client/src/concept2cure/components/{ana,editor,intelligentDocs,knowledge,concept2cure-projects,concept2cure-home}/` | A.14, A.1, A.7, A.12 |
| `server/routes/` (307 top-level + nested modules) | Section A & B route families (full sweep in Section D) |
| `server/services/` (138 directories / ~1,758 files) | Section A feature logic + Section B central services (directory index below) |
| `server/services/{ai-gateway,rag*,corpus,search}/` | B.1, B.2 |
| `server/{auth,middleware,db}/` | B.3 |
| `server/services/{audit,observability,telemetry}/`, `utils/sentry.ts` | B.4 |
| `server/services/{storage,ocr,documentIntelligence,documentQuality,docx}/`, `server/integrations/` | B.5 |
| `server/jobs/`, `server/workers/`, `workers/`, `ingestion/`, `services/` (Python) | B.6 |
| `shared/schema*`, `database/`, `migrations/`, `sql/` | B.7 |
| `shadow_service/` | A.2 predicate intelligence (external Python scoring service) |
| `ectd/`, `ectd-stubs/`, `templates/`, `schemas/`, `policy/`, `regulatory_data/`, `csrs/` | A.9 eCTD assets, A.1 templates, A.15 regulatory data, A.6/A.13 CSR corpus |

## Appendix 1 · `server/services/` directory index (all 138 directories → owning area)

- **A.1 Authoring/Docs:** authoring, documents, docx, cover-letter, forms, reviewDiffs, templates
- **A.2 510k / A.3 Device-IVD:** device, device-ivd-cockpit, design-risk, ivd-knowledge, gspr-postmarket, postmarket, mdx-submission-planner, shadow-review, pathway-engines
- **A.4 Biopharma/IND:** ind, ind-common, ind-forms, ind-lifecycle, ind-master-data, biologics, nonclinical, preclinical, chem, q-sub
- **A.5 CMC:** cmc
- **A.6 Biostatistics:** ana-biostats, biostatistics-judgment, biostats-signal-engine, study-design, cdisc, analytical, clinical-pharmacology, stats
- **A.7 PDEV/Evidence/Knowledge:** pdev, evidence, evidence-sufficiency, intelligence, intelligence-engine, literature, research-intelligence, reasoning-engine, truth-engine
- **A.8 Risk/Quality/QMS/CAPA:** qms, capa-mdr, inspection, maintenance, rules-engine
- **A.9 Submission/eCTD:** ectd, submission-ai, submission-gateways, submission-service, cer, global-markets, market-specs, region-profiles
- **A.10 Vault/Docs:** documentIntelligence, documentQuality, ocr, storage, provenance, citations
- **A.11 Governance/Audit:** governance, audit, resolution, commitments
- **A.12 Tasking/Projects:** tasking, projects, workflow, orchestration, automation
- **A.13 Reporting:** report-os, csr, evals
- **A.14 ANA/AI/Cortex/Foresight:** ai, ai-actions, ana, ana-advisory, ana-ri, cortex, cognitive-ecosystem, conversation-os, foresight, innovation, grdhe, lumen-context, tools
- **A.15 PV/RegIntel/Research-Compliance:** sentinel, regulatory, regulatory-assessments, regulatory-correspondence, regulatory-graph, regulatory-precedent-intelligence, global-ri, ha-interactions, lifecycle, lifecycle-obligations, ptrs, iacuc, ibc, irb, financial-disclosures, grants, research-compliance, research-security, effort-certification, controlled-substances, rim
- **A.16 Admin/Tenant:** tenant, tenant-export, entitlements, compute, concept2cure
- **B.1 AI Gateway/Memory:** ai-gateway
- **B.2 RAG/Corpus/Search:** corpus, search
- **B.4 Observability:** observability, telemetry
- **B.5 Integrations:** integrations, export
- **B.6 Workers/Ingestion:** ingestion, python, legacy-importer
- **B.7/cross-cutting:** policy, living-file, living-record, ai-governance, ai-ml-pccp, compliance, connectors, notifications, qc(via qms), services, etmf, design-system

## Appendix 2 · `shared/schema/` module index (60 modules, ~649 tables → B.7 data domain)

- **Submissions/regulatory:** submissions, programs, ctd-projects, project-charter, q-sub, regulatory-atoms, regulatory-assessments, regulatory-graph, regulatory-standards.seed, defense-packets, reviewer-simulation
- **IND lifecycle:** ind-amendments, ind-annual-reports, ind-cross-references, ind-dispatch-snapshots, ind-icsr-transmissions, ind-master-data, ind-safety-reports
- **Device/IVD:** gspr-postmarket, gspr.seed, capa-mdr, inspection, shadow-review
- **CMC:** cmc-os
- **CSR/clinical/biostat:** csr-knowledge-db, nonclinical, evidence, evidence-sufficiency
- **Research compliance:** iacuc, ibc, irb, financial-disclosures, research-compliance, research-security, grants, effort-certification, ha-interactions
- **Documents/eTMF/vault:** etmf, tmf-artifacts, vault, unified_workflow, resolution
- **Governance/orchestration/OS:** operating-system, orchestration, org-lifecycle, living-record-spine, pdev-workflow
- **Reporting/intelligence:** report-os, external-intelligence, ana-intelligence, ana-relational
- **Lifecycle/RIM/controlled subs:** lifecycle, rim, controlled-substances, support-admin
- **AI/ML & API:** ai-ml-pccp, api-keys
- **⚪ Stub/unused:** cdisc-reference (PRM subset active), qc-schemas (reachable via /api/qc, writes stubbed)
- *(plus the monolithic `shared/schema.ts` — core tenancy/users/documents/submissions/audit/e-sign/device/CSR/feature-flags/billing tables.)*
