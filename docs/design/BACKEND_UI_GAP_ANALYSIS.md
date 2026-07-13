# Backend → UI Gap Analysis (for Claude Design)

**Purpose.** The ui-v2 client replacement is shipped. This document is the reverse audit: **what the backend can already do that the UI does not yet expose.** Each entry is a real, mounted, verified backend capability with (a) its endpoints, (b) its current UI state, and (c) a proposed UI surface/component for Claude Design to build. It is meant to be picked up directly as a design backlog.

**Method.** Seven parallel audits traced every mounted `/api/*` prefix (170 prefixes across 335 route files, from `server/bootstrap/register-*.ts`) to its route module, confirmed the capability is real (DB/service-backed, not a stub/mock), then cross-referenced against what the ui-v2 client actually calls (`liveGet`/`useLive`/`apiRequest` in `client/src/concept2cure/v2`, distinguished from `SampleTag sample={true}` fixture shells and the aspirational `fixtures/coverage-data.ts` coverage map). Every capability claim below is grounded in `file:line` in the source reports.

---

## How to read this — the two gap classes

The ui-v2 client is **fixture-first by design** (`dataConnect.tsx` `live ?? fixture` contract). That produces two very different kinds of gap:

- **WIRE** — *a surface shell already exists* (registered in `surfaceViews.ts`, laid out, styled), but it renders sample fixtures and its governed actions are no-ops. The backend REST is real and unwired. **Design lift: light** — mostly data-wiring plus a few new tabs/panels/actions. This is the majority of the backlog.
- **BUILD** — real backend capability with **no surface at all**. **Design lift: a net-new surface** (or a major tab within an existing one).

A third bucket, **EXCLUDED**, is documented in the appendix: internal/ops/webhook routes, deprecated/superseded engines, and stubs — these are *not* gaps and should not be built against.

**Headline finding:** the backend is a substantially larger product than ui-v2 exposes. ~90 distinct user-facing capabilities are unexposed. The largest concentrations are an entire **research-administration suite** (~19 REST families, almost all BUILD), a full **submission/eCTD operations pipeline** (mostly WIRE), a **program-management OS** (`mission-control`, BUILD), and a set of **predictive/contradiction intelligence engines** rendered today as fabricated fixtures.

---

## Priority index

Ranked by user value × how much real capability is dark. Effort is D (design-heavy new surface) / M (medium) / W (wire-only).

### P0 — flagship capabilities, high value, fully built and completely dark
| # | Capability | Prefix(es) | Class | Effort |
|---|---|---|---|---|
| 1 | **Program OS** — artifact lifecycle, evidence graph, review/approval inbox, multi-axis readiness scoring, one-click IND/510k/NDA scaffolding | `/api/mission-control` | BUILD | D |
| 2 | **Submission Operations Command Center** — readiness, milestones/gates, policy engine, blockers, workload, publish→assemble-eCTD→preflight | `/api/submission-ops`, `/api/submission-orchestrator`, `/api/ectd` | WIRE→BUILD | D |
| 3 | **Research Administration suite** — grants lifecycle, IACUC/IRB/IBC, FCOI, effort, export-control, controlled-substances, inspections, agreements | 19 families (see Domain 5) | BUILD | D |
| 4 | **Predictive & Network Intelligence** — DP cross-tenant CRL/RTF/first-cycle risk, calibration, rejection-pattern mining (today shown as *fabricated* fixtures) | `/api/regulatory-intelligence` | WIRE | M |
| 5 | **Protocol authoring hub going live** — 12 governed protocol REST families behind the existing `protocol-dev` tab shell | `/api/protocol-*` | WIRE | M |
| 6 | **Stability LIMS** — ICH Q1A studies, samples + barcode + chain-of-custody, OOT, CAPA, 3.2.P.8 export (~70 endpoints, no UI) | `/api/stability` | BUILD | D |

### P1 — high value, mostly wiring an existing shell
| # | Capability | Prefix(es) | Class | Effort |
|---|---|---|---|---|
| 7 | Pharmacovigilance — ICSR/E2B, PSUR/PBRER, signal mgmt, RMP, deadline calc | `/api/pharmacovigilance`, `/api/grdhe` | WIRE/BUILD | M |
| 8 | Correspondence / HAQ OS — governed intake, issue parser, response-package assembler, deficiency analytics | `/api/regulatory-correspondence`, `/api/haq-manager` | WIRE | M |
| 9 | Clinical Operations (CTMS) — studies, sites, enrollment forecast, monitoring visits, deviations | `/api/clinical-operations` | WIRE | M |
| 10 | IND lifecycle depth — 65 endpoints (rendering, eCTD sequence filing, validate/diff, dispatch gate, cockpit); only readiness wired | `/api/ind-lifecycle`, `/api/ind-generation`, `/api/ind-sections`, `/api/ind-master-data`, `/api/ind-pdf` | WIRE | M |
| 11 | Study Design — defensibility gates, CSR-grounded synthetic-twin simulation, sample-size, M11/SAP/registration projections | `/api/study-design` | WIRE | M |
| 12 | Contradiction detection + governed resolution | `/api/governed-intelligence`, `/api/resolution` | WIRE | M |
| 13 | Regulatory Horizon digest — nightly multi-source scanner behind a fixture | `/api/external-intelligence`, `/api/learning/horizon` | WIRE | W |
| 14 | Medicare Coverage Analysis (NCD 310.1) | `/api/coverage-analysis` | WIRE | M |
| 15 | Section-workflow backbone (assign/deadline/comments/milestones/timeline, 21 endpoints) | `/api/project-sections` | WIRE | M |
| 16 | Source-traceability engine — hash-verified links + change propagation; citation verify (PubMed/CrossRef) | `/api/intelligent-docs`, `/api/documents/:id/sources`, `/api/citations` | WIRE | W–M |
| 17 | RIM registration grid + labeling; post-approval obligation calendar | `/api/rim`, `/api/lifecycle` | BUILD | M |
| 18 | Manufacturing / EBR (ISA-95/FHIR MES, batch release) | `/api/manufacturing` | BUILD | D |

### P2 — real, narrower, or admin/settings
mission-control-adjacent `snowglobe` stress-test engine · `pm-settings` org settings · `enterprise/rbac` roles admin · `api-keys` (panel is mocked) · `module-subscriptions` admin toggle · `dmsp` NIH data plans · `operating-system` decision/assumption registry · `precedent-engine` · `biologics` · `regulatory` filing registry · `cdisc-validation` · `preclinical` ingest · `authoring-pdf` QC · `dossier-readiness` · `validate-completeness` · `content-assembly`/`content-plan` · `knowledge` corpora · `knowledge-base` generation · `biosketch` · `csr-real-data` · `corpus` · `external-evidence` · `client-intelligence` · `harmonize` · `fda-forms` · `510k-workflow`/`pma-workflow` persistence · `ctd` onboarding · `packager` · `ivdr` binder · `region-profiles` · `effort-certification` · `predictive-sections` · `ai-claims`→binder · `regulatory-assessments` · notification prefs · `platform` AI-provider pref · `escalate`.

---

## Domain 1 — Regulatory submission, filing & eCTD assembly

Almost the entire pipeline is real and unwired; the surfaces (`orchestration`, `dossier`, `authoring-engine`, `nda-cockpit`, `filings-catalog`, `ivd-completeness`) are fixture shells. `IvdCompleteness.tsx:202` literally says "Connect the backend to compute completeness live."

| Prefix | Capability | Class | Current UI | Proposed UI |
|---|---|---|---|---|
| `/api/submission-ops` | Command center: packages, readiness engine, milestones/gates, policy engine, blockers, automation sweeps, workload, **publish/assemble-eCTD/preflight** (`submission-ops.ts:146-1783`) | WIRE→BUILD | MDX wires only `/packages`,`/blockers`,`/workload` | Full **Submission Ops Command Center** surface (submission rail): readiness, milestones, policies (CRUD+resolve), blockers, workload, automation runs, and a Release panel (`POST /packages/:id/{publish,assemble,preflight}`) |
| `/api/submission-orchestrator` | M2/M3 composition runs, CSR §10–12 tabulation, standalone M2.3/2.4/2.5/2.7 builders, hardened eCTD validator (gatewayReady/hardenedScore) (`:280-743`) | WIRE | `orchestration` fixture shell | **CTD Assembly Runner**: run launcher + timeline (`/runs/:id`,`/audit`), builder panels, Gateway-Readiness card (`POST /validate/hardened`) |
| `/api/ectd` (export) | ICH-M8 v4.0 generate+download ZIP, validate, leaf preflight, structure preview (`ectd-export.ts:316-852`) | WIRE | `ectd-coauthor` wires authoring only | Add **Publish/Export** pane to `ectd-coauthor`: preview → validate → preflight (findings table) → generate ZIP |
| `/api/fda-forms` | 3514/3601/3881/3654 gen, smart-forms, auto-generate by submission-type, DB-persisted (`fda-forms.routes.ts:43-577`) | WIRE | none (MDX doesn't call it) | **FDA Forms** tab on `device-510k`/`device-submission` and IND context (1571/1572/3674) |
| `/api/510k-workflow` · `/api/pma-workflow` | 510(k) Part-11 audit-trail/lineage/version/compliance-report; PMA task-state persistence (`510k-workflow-routes.ts`, `pma-workflow-routes.ts`) | WIRE | none | Compliance/lineage drawer + PMA checklist persistence on the device workstream |
| `/api/validate-completeness` | Rule-based completeness + RTF risk + Go/No-Go + optional predictive CRL/RTF/first-cycle (`validate-completeness.ts:43-77`) | WIRE | `ivd-completeness` fixture | Wire `ivd-completeness`; add a "Filing-risk" card reused in `nda-cockpit`/`dispatch-readiness` |
| `/api/dossier-readiness` | Live per-CTD-section readiness roll-up from `concept2cure_artifacts` (`dossier-readiness.ts:65`) | WIRE | `dossier`/`dossier-map` fixture | Replace hardcoded section status with `GET /dossier-readiness/:projectId` |
| `/api/authoring-pdf` | M2 CTD→PDF, cross-module M2/M4/M5 QC, CTD authoring-readiness rollup (`authoring-pdf.routes.ts:37-134`) | WIRE | `authoring-engine` fixture | QC verdict + readiness card on `authoring-engine` |
| `/api/ind-generation` · `/api/ind-sections` · `/api/ind-master-data` · `/api/ind-pdf` | AI section drafting, CTD section map + live status, sponsor/agent/investigator registries, IND PDF gen/extract/import (multiple modules) | WIRE | `ind-lifecycle` wires only `/api/ind-lifecycle` | Flesh out `ind-lifecycle`: section tree + status, per-section AI draft + assemble, master-data manager, IND PDF export/import |
| `/api/ctd` | CTD onboarding: create, AV-scanned upload, section auto-detect, completeness/gap (`ctd-onboarding.ts:66-261`) | BUILD | none | New **CTD Onboarding** wizard to ingest an existing client dossier |
| `/api/packager` | Universal export pdf/docx/xlsx/csv/json/html/zip/**ectd-zip** (`universal-packager.ts:31-208`) | BUILD | none | Reusable "Export as…" menu on document/dossier surfaces |

*Excluded:* `/api/regulatory-submissions` (feature-flagged legacy compat bridge, superseded), `/api/ind-autodraft` (backend returns hardcoded canned templates — make real first), `/api/test-assembly` (test-only, prod-fenced).

---

## Domain 2 — Protocol development & clinical/study operations

Every prefix is real, DB-backed and governed; **none is wired.** `ProtocolDev.tsx` renders all 11 tabs from the `PDEV_DOC` fixture and its Finalize/Export dialogs are `onConfirm={() => {}}` no-ops.

| Prefix | Capability | Class | Proposed UI |
|---|---|---|---|
| `/api/protocol-development`, `-soa`, `-risks`, `-milestones`, `-budget`, `-amendments`, `-deviations`, `-reviews`, `-consent`, `-export`, `-templates` | Governed protocol authoring: sections, SoA grid, risk register (L×I), milestones, per-subject budget, amendments, deviations+CAPA, review workflow, ICF (45 CFR 46.116), structured/Markdown/**CT.gov PRS** export, template curation | WIRE | **All 11 belong in the existing `ProtocolDev.tsx` (`protocol-dev`)** — the tab set already matches. Replace `PDEV_DOC` with live loads and route each tab's add/edit + Finalize/Export through the existing `GovernedActionDialog` (needs ≥8-char reason) to the governed endpoints. Add template picker; surface CT.gov PRS draft in Export. |
| `/api/protocol-portfolio` | Org-wide analytics: expiration buckets, overdue/expiring, prioritized needs-attention across IACUC+IRB | WIRE | Point `ResearchAdmin.tsx` Portfolio tab at `GET /analytics` |
| `/api/study-design` | Defensibility gates (`/validate`), CSR-grounded synthetic-twin simulation (`/simulate`), sample-size/assurance, project ICH M11/SAP/SoA/CT.gov+CTIS/CRF, persist to CDISC PRM (`study-design.ts:100-378`) | WIRE | Extend `Biostatistics.tsx` (computes sample-size locally today) or a new "Study Design" surface to call validate/simulate/persist + the M11/SAP/registration projections as downloadable artifacts |
| `/api/clinical-operations` | Full CTMS: studies, sites, enrollment + linear forecast, monitoring visits, deviations, milestones, portfolio KPIs (`clinical-operations-routes.ts:220-907`) | WIRE | Wire `ClinicalOps.tsx` off `RBM_*` fixtures to `/overview`,`/studies`,`/sites`,`/enrollment(-forecast)`,`/monitoring-visits`,`/deviations`,`/milestones` |
| `/api/nonclinical` | GLP study registry + SEND packaging + SEND readiness; IACUC→study→Module 4 provenance (`nonclinical.ts:95-165`) | WIRE | Wire `Nonclinical.tsx` add-study/SEND/readiness |
| `/api/cdisc-validation` | Deterministic SDTM-IG 3.4 / ADaM / SEND-IG 3.1 conformance, Define-XML 2.1 gen, controlled-terminology (`cdisc-validation.routes.ts:43-169`; role `regulatory-author`) | BUILD | New CDISC/SEND validation surface (or `nonclinical` tab): dataset metadata → verdict+findings; Define-XML export |
| `/api/preclinical` | Module-4 nonclinical PDF ingest via LLM extraction, governed provenance (flag `PRECLINICAL_INGEST_ENABLED`) (`preclinical.ts:38-135`) | BUILD | "Ingest study report (PDF)" uploader on `nonclinical` (flag-aware) |
| `/api/stability` | ICH Q1A stability LIMS: ~70 endpoints — studies/conditions/timepoints, **samples + barcode + chain-of-custody**, OOT surveillance, CAPA, trends, 3.2.P.8 export, AI coach (`src/routes/stability.router.ts`) | BUILD | **Dedicated Stability surface** (or major `cmc` expansion — CMC today only uses the 4-endpoint `/api/cmc/stability`). Study setup, sample management w/ custody, results review/sign-off, OOT, CAPA, P8 export |
| `/api/predictive-sections` | eCTD section-suggestion engine: suggestions, doc analysis, completion-status/critical-path/gaps (`predictive-sections.ts:17-297`; `/templates` mock) | BUILD | "Suggested sections / completion" side-panel in `ectd-coauthor`/`document-authoring` |

---

## Domain 3 — Intelligence, AI/AnA & regulatory intelligence

Real engines behind fabricated fixtures. Per `docs/AI_CONSOLIDATION_PLAN.md`, `/api/ana-ri` is the canonical spine (v2 already uses it); the legacy engines are excluded.

| Prefix | Capability | Class | Proposed UI |
|---|---|---|---|
| `/api/regulatory-intelligence` | Predictive CRL/RTF/first-cycle scoring, **cross-tenant differentially-private network priors** (Laplace+k-anon), logistic retraining, Platt calibration, rejection-pattern mining, proactive warnings (`services/intelligence/risk-model.ts:136-493`) | WIRE | **Submission Risk & Network Intelligence** surface — today `PharmaIntel`/`shadow-review` show *fabricated* risk scores. `POST /score`/`/readiness` live readiness card, `GET /network-insights` anonymized peer prior, `/calibration` + `/warnings` rail. (Fix the `/templates/prompt-hints` route-shadowing bug first.) |
| `/api/grdhe` | Global Reg Data Harmonization: multi-jurisdiction transform, **FDA 3500A + ICH E2B(R3) ICSR XML**, AE case mgmt+validation, terminology versioning, e-sig, audit | BUILD | "Safety / ICSR Export" workspace: AE case list/detail, `POST /adverse-events/:id/validate`, export job flow w/ format picker. ⚠ backend: e-sig password validation is a placeholder (Part 11 gap) and some body-tenant routes skip IDOR check — flag to owner |
| `/api/coverage-analysis` | Medicare Coverage Analysis (NCD 310.1) qualifying-trial determination, item classification, ICD-10, billing grid, **live CMS Coverage API**, governed finalize | WIRE→BUILD | Own "Coverage Analysis" surface (near `clinical-ops`/`research-admin`; unrelated to payer `market-access`). CRUD + classify + ICD-10 + billing grid + gated finalize |
| `/api/governed-intelligence` + `/api/resolution` | Cross-artifact **contradiction engine** (real scan) + governed resolution orchestrator (plans/bundles/executor, supersession, promotion-block) | WIRE | One coherent feature behind the fixture-only `Inconsistency`/`Insights`: `POST /contradictions/scan/:projectId`, then resolution plans→bundles→execute with `BundleExecutionReceipt` + supersession audit |
| `/api/external-intelligence` + `/api/learning/horizon` | Nightly FDA/EMA/MHRA/TGA/FederalRegister/PubMed/medRxiv scan → findings/digest; AnA continuous-learning cards + ICH currency | WIRE | Wire `RegChange.tsx` (inline `RCI_CHANGES` fixture) to `/digest`+`/findings`+`/sources`+`POST /run`; add "what AnA is studying" panel. (Horizon needs `ENABLE_REGULATORY_HORIZON_SCAN=true`.) |
| `/api/external-evidence` | Evidence routing (PubMed/ClinicalTrials/openFDA/Firecrawl), tenant Firecrawl quota + domain-policy governance, evidence-brief drafting | WIRE | Wire `Evidence.tsx`: search → `POST /route`, governed `POST /validate` pre-check before scrape, "Draft evidence brief" |
| `/api/client-intelligence` | Client profile/persona, doc ingestion, client-memory + semantic search + context assembly, doc checklist | BUILD | "Client Intelligence" onboarding surface (`ana-memory` targets a different backend). ⚠ ingest "AI extraction" is regex heuristics mislabeled `extractedBy:'ai'` — fix/relabel before presenting as AI |
| `/api/ai` (ai-claims) | Promote AI claim → IVDR evidence binder w/ citations + vault/atom evidence + audit | BUILD (narrow) | "Add to binder" action on AI-claim cards in `ivd-completeness`/`device-cer` |
| `/api/harmonize` | Deterministic within-submission consistency (terminology/numerics/summary-body/references), consistency score | BUILD (action) | One-click "Check consistency" in authoring/`Inconsistency` view |
| `/api/account-intelligence` | Account canon (facts) + event ledger + projection + skill/template registries | infra | Lower priority; an admin "Knowledge Governance" surface only if canon curation becomes a user task |
| `/api/foresight-ai` | Clinical-pharmacology AI: dose-escalation optimizer (3+3/BOIN/CRM), cross-species PK/PD, protocol gen, IND narrative | BUILD (caveat) | Real & unique math, re-homed live at `/api/cortex/clinical` despite a Deprecated header on the old mount — confirm product intent before building |

*Excluded (superseded/legacy/stub):* `/api/cortex`, `/api/ana-cortex` (chat/analysis dup of ana-ri; only its SEC-EDGAR `/harvest/10k` is unique background ingestion), `/api/ai-assistance`, `/api/foresight`, `/api/foresight-feedback`, `/api/biotech-rag` (`@deprecated`), `server/api/ai/routes.ts` + `phase3-routes.js` (keyword/static-KB stubs, mostly 503).

---

## Domain 4 — Documents, knowledge base, corpus & content authoring

Only `/api/knowledge-base/search-connectors` is genuinely wired (the DMS gap closed pre-merge). Everything else is fixture shell or dark.

| Prefix | Capability | Class | Proposed UI |
|---|---|---|---|
| `/api/citations` | `POST /verify` — real PubMed + CrossRef existence check (`citations.ts:38`) | WIRE (near-zero effort) | The `source-tracer` "Verify against PubMed/CrossRef" panel already exists — swap its one handler (`SourceTracer.tsx:33`) from the `stVerify` fixture to `POST /api/citations/verify` |
| `/api/intelligent-docs` + `/api/documents/:id/sources` | Versioned source docs, **SHA-256 hash-verified traceability links**, change-propagation events, compliance history (`intelligentDocs.ts`, `sourceLinks.ts`) | WIRE | Wire `source-tracer` to sentence-level source links + a "source freshness" strip (links/verify/propagation-events). Flagship regulatory-integrity capability, fully dark. (`compliance/calculate` is intentionally 501 — don't surface.) |
| `/api/project-sections` | Section workflow: initialize/status/assign/deadline/comments/history/dependencies/notifications/milestones/timeline (21 endpoints) | WIRE | Wire `regulatory-workspace` (generic shell that already lists this API): section tree, assignment/deadline/status, comments, milestones, timeline |
| `/api/templates` (+ `/api/c2c/templates`) | Template library: list/catalog/get/create/upload/update/delete/use-tracking/recent/featured | WIRE | Wire `template-library` grids + upload/create + "use" tracking. **Flag `/api/templates` vs `/api/c2c/templates` duplication for consolidation** |
| `/api/knowledge-base` (generation) | upload/OCR/extract-pdf, generate-docx/ind-package/ind-section/module3, save-as-artifact | WIRE | "Generate document" action in `artifacts-center`/`document-authoring`: OCR/extract + IND/module-3 generators + persist |
| `/api/content-assembly` + `/api/content-plan` | Dynamic assembly, completeness report, live SSE preview, validate; per-section plan w/ owner/deadline/evidence/gap | WIRE/BUILD | "Assembly & completeness" panel on `ectd-coauthor`/`document-authoring` |
| `/api/knowledge` | Citable reg-intel corpora: ICH guidelines, pathways, consensus standards, deficiency taxonomy, pharmacopoeia, eCTD validation rules | BUILD | Reference drawer / palette panel in `evidence-search`/`intelligence-catalog` |
| `/api/biosketch` | Governed NIH biosketch (FORMS-H auto-seed, completeness, finalize gate) | BUILD | "Biosketch" tab under `pdev`/`research-admin` |
| `/api/csr-real-data` | DB-backed CSR list + stats dashboard (phases/indications/sponsors) | BUILD | "CSR library" panel on `biostatistics`/`csr-workflow` |
| `/api/corpus` | Precedent benchmarking, deterministic CSR entity extraction, CTgov→corpus ingest | WIRE | Benchmark card + paste-and-extract tool on `vault`/`evidence-search` |
| `/api/cerv2-versions` | CER/510(k) section version history | BUILD | Version-diff drawer on device-cer/510k or `audit-trail` |

*Excluded:* `/api/docs` (stub — returns empty), `/api/smart-blocks` (mostly stub; `/generate` throws), `/api/template-library` (surface id only; backend is `/api/templates`).

---

## Domain 5 — Research administration & compliance

**The single biggest BUILD opportunity: an entire research-administration product exists in the backend, all real/persisted/governed, essentially none wired.** The only home today is the fixture-only `research-admin` add-on surface (off by default). Recommend a new **"Research administration" rail group** (the registry group already exists at `registryModel.ts:612`).

| Prefix | Capability | Class | Proposed UI |
|---|---|---|---|
| `/api/grants` | eGrants award lifecycle: proposals, awards, milestones (2 CFR 200.344 closeout), subawards/subrecipient monitoring, budget-vs-actual, cost-share, NCE, invoices | BUILD | New `grants-management` surface with the full lifecycle tab set |
| `/api/grant-finder` | Funding profile + explainable Grants.gov opportunity ranking + record-to-pipeline | WIRE | Wire the existing `ResearchAdmin` "Grant finder" section; make "Record" governed |
| `/api/iacuc` · `/api/irb` · `/api/ibc` | Animal-use (3Rs, pain category, DMR/FCR), human-subjects (reviews, sIRB, consent, reportable events), biosafety (BSL, agents, containment) — each with amendments + completeness | BUILD | Three companion protocol workspaces feeding the Committees meeting poll |
| `/api/committees` | RBAC-gated committee ops: composition, meetings, convene→quorum, **live voting poll**, CITI-gated finalize, portfolio | WIRE | Wire the built-but-inert Committees section (poll UI exists; bind members/meetings/convene/votes/finalize) |
| `/api/citi-training` | Bulk CITI import, org training matrix, expiring-soon | WIRE | Wire the "Training" section to `/matrix` + `/expiring` |
| `/api/financial-disclosures` | 21 CFR 54 FCOI: investigators, disclosures, interests, AI completeness, certify (Part 11) | BUILD | "FCOI / Financial disclosures" surface (Compliance group) |
| `/api/other-support` | NIH Other Support: entries, person-months, readiness gate, certify | BUILD | Authoring surface or grants-management tab (entries link `grantProposalId`) |
| `/api/effort-certification` | 2 CFR 200.430 effort statements, lines, validation, certify (content-hash) | BUILD | Effort-certification view (Compliance group / grants tab) |
| `/api/invention-disclosures` | Bayh-Dole tech transfer: disclosure, TTO decision, 37 CFR 401.14 compliance clock | BUILD | "Invention disclosures / Tech transfer" surface |
| `/api/research-agreements` | MTA/DUA/CDA authoring, HIPAA 45 CFR 164.514 execution-readiness gate, portfolio | BUILD | "Research agreements" surface w/ expiry roll-up |
| `/api/research-compliance` | Personnel roster, training records, compliance-checklist engine, "no index until trained" gate | BUILD | Foundation "Research personnel & compliance" view (anchors the group; makes the training gates legible) |
| `/api/research-security` | NSPM-33 / NOT-OD-26-017 COI disclosures + review, foreign-flagging | BUILD | "Research security / COI" view (complements FCOI) |
| `/api/controlled-substances` | DEA registrations, inventory, **perpetual transaction ledger** w/ witness, recordkeeping eval | BUILD | "Controlled substances (DEA)" surface |
| `/api/export-control` | ITAR/EAR/OFAC screening, Fundamental Research Exclusion, license determination | BUILD | "Export control" review surface |
| `/api/inspections` | BIMO/PAI readiness, Form 483 findings, 15-day response clock, per-area score | BUILD | "Inspection readiness" surface (Review & govern group) |
| `/api/ha-interactions` | Agency meetings, questions, meeting readiness, commitments (PMR/PMC/REMS) + fulfillment | WIRE | Wire `CommunicationCenter.tsx` "Meetings & commitments" tab (already labels the API) |
| `/api/innovation` | **8-feature platform**: Delta Radar, Evidence Heatmap, Readiness Twin, Auto-traceability, Reviewer Workspace, Template Learning, Negotiation Logbook, Guardrails SDK (`innovation-routes.ts:318-1314`, persisted) | BUILD | An "Innovation" surface group (Intelligence rail) with a panel per program-scoped feature — largest single dark platform |

*Excluded:* `/api/leaves` (mock eCTD leaf-editing, misfiled here).

---

## Domain 6 — Platform, governance, admin & settings

| Prefix | Capability | Class | Proposed UI |
|---|---|---|---|
| `/api/mission-control` | **Program OS**: programs/destinations/route-plans, artifact lifecycle state machine, evidence+dependencies+staleness, decisions, review cycles, risks, **approval inbox (decide/delegate)**, provenance, multi-axis **readiness computation**, auto-scaffold IND/510K/NDA (`mission-control.ts:93-1153`) | BUILD | **Program OS surface** (sibling to `program-journey`/`project-home`/`orchestration`): readiness radar home + tabs for artifacts, evidence, decisions, reviews, and a governed approval inbox |
| `/api/snowglobe` | 6 AI risk engines over real program content (agency screen, reviewer friction, audit exposure, route viability, claim defensibility, bottleneck), scenarios, remediation, delta-vs-baseline, findings-memo (`snowglobe.ts`) | BUILD | "Snow Globe" stress-test surface (near `intelligence-catalog`/`shadow-review`): run full stress-test, scored findings by engine, remediation plan, memo export |
| `/api/pm-settings` | Org settings: AI (tone/risk/citation), workflow defaults, compliance (Part 11/retention/redaction), TA; GET/PUT/reset/history | BUILD | "Workspace settings" tab on `setup`/`admin-console`, governed w/ audit history |
| `/api/enterprise/rbac` | Full RBAC admin: roles+hierarchy, assign (scope/expiry/delegation), bulk, custom roles, effective perms, check-permission (`rbac-routes.js:23-405`) | BUILD | Roles & permissions manager (the `setup` fixture already lists it "routes-ready") |
| `/api/api-keys` | Key CRUD: create (raw once), list, revoke, usage — admin-only + audited | WIRE | The AdminSurfaces API-keys panel is **fully mocked** (`AdminSurfaces.tsx:1696-1728`) — wire list/create(copy-once modal)/revoke/usage |
| `/api/module-subscriptions` (admin) | `POST /provision`, `PUT /:moduleId/toggle` | WIRE | Reads are surfaced (`useLicense`); wire the Apps-catalog admin toggle (currently local-state) |
| `/api/dmsp` | NIH Data Mgmt & Sharing Plan: 6-element auto-seed, completeness, finalize gate (`dmsp.ts:84-159`) | BUILD | DMS-plan authoring view under `pdev`/`research-admin` (note: unrelated to the "DMS/Vault" DMS false-friend) |
| `/api/operating-system` | Assumption Registry + Decision Records + Governance Boundaries w/ transition workflows (`operating-system.ts:49-671`) | BUILD | Governance/decision registry — natural home is `decision-lineage`/`inconsistency`. (Scope to working endpoints; `link-artifact`/`contradiction-links` are no-op shims) |
| `/api/platform` (`/ai-providers`) | Tenant default AI-provider preference | BUILD (minor) | Small "AI provider" control in settings (handle 501 read-only) |
| `/api/users/me/notifications` | Per-user notification prefs (channels, digest, timezone) | BUILD (minor) | "Notifications" tab in user profile |
| `/api/escalate` | `POST /evaluate` structured escalation recommender (advisory, no persistence) | BUILD (minor) | Lightweight action from HAQ/risk/task context |

*Excluded (internal/ops/stub):* `/api/control-plane` (ops-token gated; UI dependency explicitly removed), `/api/field-sync` (SSE plumbing), `/api/firecrawl` + `/api/firecrawl-webhooks` (integration/webhook), `/api/nano-banana` (image/PPTX utility), `/api/demo` (prod-blocked seeding), `/api/gcc` (4 of 5 sub-apps are `{status:'operational'}` stubs; only `/drafting` real), `/api/enterprise` non-rbac (stub auditService), `/api/notifications` (mock email).

---

## Domain 7 — Regulatory lifecycle, programs, correspondence, device/IVD & CMC

| Prefix | Capability | Class | Proposed UI |
|---|---|---|---|
| `/api/regulatory-correspondence` | Correspondence/HAQ OS: submissions lifecycle, governed intake + issue parser, issue review, response-package assembly, timeline, M365 mailbox, deficiency analytics (`regulatory-correspondence.ts:274-1019`) | WIRE | Build out `communication-center` + wire `haq-manager` (currently `fixtures/haq-data`): intake, issue triage, response-package assembler, timeline, mailbox connect, deficiency-pattern analytics. **Highest-value in this domain** |
| `/api/pharmacovigilance` | ICSR/E2B, PSUR/PBRER + scheduling, signal mgmt+screen, RMP, reporting-deadline calc, compliance matrix, MedDRA search (`pharmacovigilance-routes.ts:271-673`) | WIRE | Point `safety-narrative`/`pharmacovigilance` (both sample) at the live backend — AE register, ICSR gen, periodic reports, signals, RMP, deadline calc, compliance matrix |
| `/api/manufacturing` | ISA-95/FHIR MES: equipment (Plug&Produce), electronic batch records, deviations, test results, AI batch review, batch release (`manufacturing-routes.ts:261-902`) | BUILD | "Manufacturing / EBR" workspace (device-diagnostics group / project tier) |
| `/api/ind-lifecycle` | 65 endpoints: report/amendment/briefing-book rendering, eCTD sequence filing, validate/manifest/diff, dispatch gate+snapshots, cockpit/dashboard/drift, registers | WIRE | Expand `ind-lifecycle`/`nda-cockpit`/`dispatch-readiness` (readiness-only today). `GET /openapi.json` enumerates the full surface |
| `/api/coverage-analysis` | *(see Domain 3 — Medicare NCD 310.1)* | WIRE→BUILD | Own Coverage Analysis surface |
| `/api/lifecycle` | Post-approval obligation calendar (C2C-11): obligations, recurring occurrences, status, urgency calendar (`lifecycle.ts:96-150`) | BUILD | Replace `lifecycle-mgmt` fixtures with live obligation CRUD + urgency calendar |
| `/api/rim` | RIM-lite (C2C-12): products, product×country registration grid, label versions, renewal urgency, label-currency gate (`rim.ts:95-167`) | BUILD | Back `registrations`/`dossier-map` with the registration grid + labeling engine |
| `/api/precedent-engine` | Precedent search/compare/risk/strategy/check-claim/ingest + CRL/RTF/EMA-pattern/AdComm risk (`precedent-engine.ts:106-288`) | WIRE | Wire `precedent-intelligence` (cites the API in its eyebrow, never calls it); `/check-claim` powers real-time claim checking in authoring |
| `/api/biologics` | Biosimilar pathway/requirements, expedited programs, comparability design, combination-product PMOA classify (`biologics-routes.ts:26-162`) | BUILD | "Biologics & combination products" panel on `biopharma` |
| `/api/regulatory` (registry) | Global filing registry: application types, 4-segment taxonomy, region profiles, search, legacy-resolve (`regulatory-registry.ts:36-164`) | BUILD | Back `filings-catalog` (fixture) + application-type/region pickers |
| `/api/ivdr` | EU 2017/746: 23 endpoints — classification, performance validation, clinical evidence, GSPR matrix, evidence binder + pack builder | WIRE (2nd-tier) | ~5 wired via MDX; extend `ivd-completeness` + MDX IVD panes to binder/pack-builder |
| `/api/regulatory-assessments` | Append-only RI/CDISC/eTMF verdict-snapshot persistence per submission | BUILD (niche) | Read-only "Assessment history" strip on `submission-center` (verify demand; no writer today) |
| `/api/region-profiles` | Static per-market Module-1 structure/forms/pathways | WIRE (minor) | A typed client already exists but is unimported — import into `submission-center` |

*Excluded:* `/api/device-projects` (redundant with generic `/api/projects`), `/api/regulatory-programs` (surfaced via MDX, 7/11 endpoints; residual: safety-signals/literature/pma-modules), `/api/global-ri` (surfaced via the catalog browser).

---

## Cross-cutting themes for Claude Design

1. **Most gaps are "wire the shell," not "design from scratch."** The ui-v2 surface tree already has homes for the majority of these capabilities (fixture-driven). The design work is largely: replace fixtures with live loads, turn no-op governed dialogs into real reason-for-change + e-sign actions, and add a handful of tabs/panels. The repo's own `fixtures/coverage-data.ts` (every entry `readiness: 'routes-ready'`) is the team's acknowledgment of exactly this.
2. **Governed-action UX is a repeating pattern.** A large share of these endpoints are governed (`BEGIN → Tx → recordGovernedAction`, ≥8-char reason, often e-sign). Design a single reusable governed-action + audit-history component (extending the existing `GovernedActionModal`) and reuse it across protocol, research-admin, grants, coverage-analysis, resolution, dmsp, etc.
3. **Whole net-new product areas.** Research administration, Program OS (mission-control), Stability LIMS, Manufacturing/EBR, and the Innovation 8-feature platform are large surfaces that don't exist in any form — these need real IA/design, not wiring.
4. **"Fabricated data" hotspots to prioritize.** A few surfaces show *invented numbers* that a real engine could replace: `PharmaIntel`/`shadow-review` RTF/CRL risk (→ `regulatory-intelligence`), `RegChange` horizon (→ `external-intelligence`), `MarketAccess` coverage grid (→ `coverage-analysis`). These are honesty-improving wins.

## Backend issues to fix before wiring (flag to backend owners)
- `/api/grdhe` e-signature password validation is a placeholder (21 CFR Part 11 gap); some body-tenant routes skip the IDOR `validateTenantId` check.
- `/api/client-intelligence` ingest labels regex-heuristic extraction as `extractedBy:'ai'` with no embeddings — fix or relabel before presenting as AI-derived.
- `/api/regulatory-intelligence` `GET /templates/prompt-hints` is shadowed by `/templates/:id` (route ordering).
- Endpoint duplication to consolidate: `/api/templates` vs `/api/c2c/templates`; `/api/stability` vs `/api/cmc/stability`.
- Make real before building UI: `/api/ind-autodraft` (canned templates), `/api/smart-blocks` `/generate` (throws), `server/api/ai` + `phase3-routes` (stubs).

---

*Generated from a 7-cluster parallel backend audit against `client/src/concept2cure/v2`. Every capability claim is grounded in the source route modules (file:line in the underlying audit). Recon inputs: 170 mounted `/api` prefixes, 335 route files, ~109 UI-consumed paths, 87 SURFACE_VIEWS ids.*
