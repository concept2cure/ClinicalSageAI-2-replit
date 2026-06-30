# Handoff to Design — Medical Device, Diagnostics & IVD Client (complete, code-grounded)

**Date:** 2026-06-23
**From:** Claude Code (platform/contract enablement)
**To:** Claude Design / UI team
**Segment:** `industryMode: 'medtech'` — covers FDA medical devices (510(k) / De Novo / PMA), EU MDR devices (CER), and **IVD / diagnostics** (IVDR, CDx, CLIA, LDT). IVD/diagnostics are **not** separate segments; they live under `medtech` (`client/src/concept2cure/types/workspace.ts:23-30,64`).
**Companion docs:** `HANDOFF_TO_DESIGN_segmentation_and_taxonomy.md`, `GLOBAL_UI_READINESS_ADVISORY_2026-06-17.md`, `HUMAN_FACTORS_AND_USABILITY_SPEC_2026-06-15.md`, `DEVICE_IVD_SUBMISSION_ASSEMBLY_SPEC_2026-06-15.md`, `MDX_PAYING_CUSTOMER_VALUE_AND_ENTITLEMENTS_2026-06-15.md`, `EVALIDATOR_INTEGRATION_SPEC.md`.

Every claim is cited to `file:line`. Items not verifiable in code are marked **[GAP]**. Nothing here renders a pixel — it is the contract + design-intent floor for the device/IVD/diagnostics UI.

---

## §0 · How to read this

1. **Segment drives scope, defaults, and entitlement — never nav.** The rail is identical across industries; `industryMode` only changes AnA context (`server/services/lumen-context-builder.ts:527-535`), module entitlement (`server/services/license-manager.ts`), and pricing (`server/services/billing.ts:205`). Build one rail; express "medtech" as ambient context.
2. **Center of gravity: strong tested backends, little UI.** Per `GA_GAP_AUDIT_2026-06-10.md`, this is design + integration work, not greenfield backend.
3. **The load-bearing rule for this segment is honesty.** Three honesty gates govern almost every device surface and are non-negotiable in the UI (`HUMAN_FACTORS_AND_USABILITY_SPEC_2026-06-15.md`):
   - `officialEstarPdf: false` — a ZIP of section PDFs is **never** labeled submittable (`server/routes/510k-estar-routes.ts:181-183`).
   - `isSample` — fixture data is labeled and **never** exportable as a governed artifact.
   - `canTransmit` — advisory-only markets cannot transmit; gateways return honest `gateway_not_configured`, never a fabricated ACK.
4. **Every capability is dual-mode.** Nearly all device/IVD actions exist **both** as an AnA chat tool **and** as a human-fillable REST form. Design must render both entry points and have them produce the same governed result. The dual-mode matrix in §3 is the heart of this document.

---

## §1 · Surface map (registry `group: 'device'`)

From `shared/constants/ui-surface-registry.ts`:

| Surface | id (line) | layoutMode | uiKit | apiPrefixes | sharedContract | readiness | compliance |
|---|---|---|---|---|---|---|---|
| 510(k) workbench | `device-510k` (271) | `section-workspace` | `mdx` | `/api/510k-workflow`, `/api/cerv2`, `/api/cerv2-sections`, `/api/fda-forms` | `@shared/types/predicate-intelligence` | routes-ready | Part 11, a11y, tone |
| CER generator (EU MDR) | `device-cer` (286) | `section-workspace` | — | `/api/cer`, `/api/cerv2` | — | routes-ready (dashboard only) | Part 11, a11y, tone |
| Device & diagnostics workbench | `device-diagnostics` (498) | `device-diagnostics-workbench` | `risk` | `/api/mdx`, `/api/manufacturing`, `/api/ivdr` | — | routes-ready | Part 11, a11y, tone |
| Labeling | `labeling` (513) | `labeling` | `labeling` | `/api/mdx` | — | **kit-only** | Part 11, a11y, tone |
| Risk management | `risk` (528) | `risk` | `risk` | `/api/mdx`, `/api/design-risk` | — | **kit-only** | Part 11, a11y, tone |

Device clients also depend on segment-agnostic surfaces: **FDA forms** (`/api/fda-forms`), **Report engine** (`/api/report-os`, `/api/intelligent-reports`), **Submission Center** (`/api/submissions`, `/api/submission-ops`), and the cross-cutting concerns in §6 (`ui-surface-registry.ts:635-671`).

---

## §2 · The five filing / authoring spines

Build **one reusable `FilingStepper`** fed by per-pathway stage constants. Pathway grouping: `shared/constants/mdx.ts:21` (`REGULATORY_PATHWAYS = ['k510','pma','cer']`; De Novo maps to `k510`).

### 2.1 — 510(k)
- **Stages (7):** `shared/constants/mdx.ts:76` (`STAGE_LABELS`): Intake → Classify → Predicate search → Performance Testing → Substantial Equivalence → Assemble eSTAR → Submit → Cleared. Kit data: `client/src/concept2cure/mdx/data/k510.ts:60-113` (`K510_STAGES`, `K510_PREDICATES`, `K510_SE_ROWS`, `K510_ESTAR`); surface `client/src/concept2cure/mdx/surfaces/K510Surface.tsx`.
- **eSTAR section slots:** `server/services/pathway-engines/estar/estar-mapper.ts` — `baseSlots` (`:50`, 10 shared sections: cover-letter, indications-for-use, device-description, proposed-labeling, biocompatibility, sterilization, software, emc-electrical, performance-testing, standards-conformance), `SLOTS_510K` (`:63` = baseSlots + substantial-equivalence). Dispatch `:88`.
- **Routes:** `/api/510k-workflow/:projectId` (`server/routes/510k-workflow-routes.ts`), `/api/fda510k-unified/estar/{validate,build}` (`fda510k-unified.ts`), canonical ZIP `/api/510k/estar/build` (`510k-estar-routes.ts`, honesty flag `:183`), predicate panel `/api/predicate-intelligence/{candidates,analyze,se-matrix,defense-packet}`.
- **FDA forms:** see §4.
- **Contract:** `@shared/types/predicate-intelligence` (§3).

### 2.2 — De Novo
- Branches from 510(k) at Classify; **no predicate**. `estar-mapper.ts:68` (`SLOTS_DE_NOVO` = baseSlots + `classification-request` + `special-controls`). Shares `/api/fda510k-unified/*` with `pathway='de_novo'`. UI reuses K510 surface with predicate stage replaced by risk-to-benefit + two extra required sections.

### 2.3 — PMA
- **Modules (1–10, 21 CFR 814.20):** `server/services/pathway-engines/pma/pma-mapper.ts:57` (`PMA_SLOTS`): Module 1 admin/regulatory, 2 device-description/IFU, 3 manufacturing (QSR/820), 4 nonclinical, 5 clinical (pivotal/GCP), 6 labeling, 7 **SSED**, 9 statistical-analysis, 8 post-approval-study (opt), 10 references (opt). Submission types `:20` (`original | panel_track_supplement | 180_day_supplement | real_time_supplement`).
- **10-phase grid:** `client/src/concept2cure/mdx/data/pma.ts:31-58` (`PMA_PHASES` presub→postapp; `PMA_MODULES`; `PMA_TRIAL_METRICS`). Surface `PmaSurface.tsx`. Routes `/api/pma-workflow/:projectId` (`pma-workflow-routes.ts`).

### 2.4 — CER (EU MDR / IVDR technical file)
- **UnifiedCERService:** `server/services/cer/index.ts` — frameworks `CERRegulatoryFramework` (`:33`: MDR_2017_745 | IVDR_2017_746 | UK_MDR_2002 | Swiss_MedDO); 8 sections (`:74-82`: executive_summary, device_description, essential_requirements [Annex I GSPR], clinical_background, clinical_evidence, literature_review, risk_benefit_analysis, conclusions).
- **Tech-doc assembler:** `server/services/pathway-engines/mdr-ivdr/tech-doc-assembler.ts` — `MDR_SECTIONS` (`:70`, Annex II/III + Annex XIV CER), `IVDR_SECTIONS` (`:77`, analytical-performance Annex II 6.1, clinical-performance 6.2, performance-evaluation Annex XIII PER, pms-plan Annex III PMPF). Dispatch `:99`.
- **Kit data:** `client/src/concept2cure/mdx/data/cer.ts` — `CER_SIGNALS` (FAERS/MAUDE/PubMed/Eudamed), `CER_GSPR` (23-row Annex I checklist), `CER_EQUIV_MATRIX`, `CER_PMS_KPIS`. Routes `/api/cer`, `/api/cerv2/sections`, `/api/cerv2-export/{pdf,docx,zip}`. **Readiness: dashboard only** (registry note, `:286-299`).

### 2.5 — IVDR / IVD lifecycle (diagnostics)
Two backends:
- **Persisted IVDR** — `server/routes/ivdr-routes.ts` (1546 lines): Annex VIII classify A/B/C/D (`:165`, schema `classifySchema:28`); analytical validations (`:344`, `validationSchema:43` — LoD, LoQ, precision/CV, linearity, accuracy, carryover, hook effect, stability); clinical evidence 2×2 (`:549`, `clinicalEvidenceSchema:51` → sensitivity/specificity/PPV/NPV); CDx workflows (`:754`, `cdxWorkflowSchema:62`, states initiation→post_market); **GSPR 23-requirement** checklist (`GSPR_REQUIREMENTS:967`, init `:1026`, matrix grouped by Chapter I/II/III); submission-package job (`:1243+`).
- **Stateless calculators** — `server/routes/ivd-lifecycle.ts`: classify, cdx/pair, study-design, review-simulation, program-plan, and analytical engines (`assessRealTimeStability/AcceleratedStability/Carryover/HookEffect/Recovery`, `determineCutoff`), `scientific-validity` (`:452`), software (IEC 62304) `:455-459`, post-market authoring `:474-477` (emdr/mir/fsn/psur). Full surface in `ivd-platform.openapi.json`.
- **Persisted MDX sub-domains:** `/api/mdx/ivdr` (classifications + PER, `mdx-ivdr.ts`), `/api/mdx/cdx` (`mdx-cdx.ts`), `/api/mdx/clia` (`mdx-clia.ts`), `/api/mdx/ldt` (`mdx-ldt.ts`), `/api/mdx/labeling` (`mdx-labeling.ts`), `/api/mdx/risk-items` (`mdx-risk-management.ts`), `/api/mdx/udi` (`mdx-udi.ts`).

---

## §3 · Dual-mode action / service matrix (CORE)

For every capability the segment needs, this maps the **AnA tool** (chat action) and the **human data-entry** route/form to the same service. AnA tool line numbers verified in `server/services/ana/AnaToolDefinitions.ts`; pedigree per `server/services/ana/tool-pedigree.ts:115-119` (`deterministic_registry` for global-RI names; `external_api_live` for `search_*`; `model_assisted` otherwise — render the badge on every AnA output).

> **Design mandate:** every row must be reachable two ways — a slash/"Ask AnA" action **and** a manual form — and both must write through the same governed service and produce the same artifact + pedigree.

### 3.1 — Predicate & Substantial Equivalence (510(k))
| Capability | AnA tool (file:line) | Human form / route | Inputs | Output | Pedigree |
|---|---|---|---|---|---|
| Analyze predicate vs subject | `analyze_predicate_device` (1438) | `POST /api/predicate-intelligence/analyze` | product_code, device_name, intended_use, tech description, materials, energy, tissue contact, sterilization | `PredicateSuggestion[]` (`shared/types/predicate-intelligence.ts:170`) | model_assisted |
| Find predicate candidates | (panel) | `POST/GET /api/predicate-intelligence/candidates` | subject device profile | candidate list + scores | — |
| Generate SE matrix | (panel) | `POST /api/predicate-intelligence/se-matrix` | subject + selected predicate | `SEMatrixComparisonRow[]` (`:286`), equivalence_status, diff_severity | — |
| Build defense packet | (panel) | `POST /api/predicate-intelligence/defense-packet` | SE matrix + risk codes | `DefensePacketFull` (`:1042`), evidence tasks, `RiskCode` (`:699`), objections (`Objection:80`) | — |
| Mine / look up precedents | `mine_precedents` (1670), `lookup_regulatory_precedents` (2171), `compare_submission_against_precedent` (2220) | `/api/precedent-engine/*` | indication, product code, query | precedent records + rationale | model_assisted |

### 3.2 — IVD / Diagnostics
| Capability | AnA tool (file:line) | Human form / route | Inputs | Output | Pedigree |
|---|---|---|---|---|---|
| Classify IVD (Annex VIII A–D) | `classify_ivd_device` (2679) | `POST /api/ivdr/classify` (`classifySchema:28`) / `POST /api/ivd-lifecycle/classify/ivdr` | device_name, intended_purpose, isSelfTest, isNearPatient, isCompanionDiagnostic, analytes | classification A/B/C/D, ruleTrace, notifiedBodyRequired | model_assisted |
| Record analytical performance | `record_analytical_performance_study` (2623) | `PUT /api/ivdr/validations/:id/parameters` (`validationSchema:43`) | LoD, LoQ, precision/CV, linearity, accuracy, interference, stability, carryover, hook | pass/fail status + history | model_assisted |
| Record clinical performance | `record_clinical_performance_study` (2647) | `PUT /api/ivdr/clinical-evidence/:id/results` (`clinicalEvidenceSchema:51`) | TP/FP/TN/FN, prevalence, comparator | sensitivity, specificity, PPV, NPV, AUC-ROC + 95% CI | model_assisted |
| Create PER (Annex XIII) | `create_per_document` (2701) | `POST /api/mdx/ivdr/per` | scientific_validity_done, analytical_done, clinical_done, benefit_risk, pmpf_plan | PER record (draft→approved) | model_assisted |
| Pair companion diagnostic | `pair_companion_diagnostic` (2743) | `POST /api/ivdr/cdx-workflows` (`cdxWorkflowSchema:62`) / `POST /api/mdx/cdx/pairings` | drug, biomarker, application type (nda/bla/anda/foreign), indication, cdx label text | CDx pairing; states initiation→analytical→clinical→NB review→eu_declaration→post_market | model_assisted |
| Categorize CLIA complexity | `categorize_clia_complexity` (2725) | `POST /api/mdx/clia` | test_name, analyte | waived / moderate / high + CMS letter ref | model_assisted |
| Register LDT (FDA 2024 rule) | `register_ldt` (2767) | `POST /api/mdx/ldt` | first_offered_date, grandfathered, enforcement_discretion_basis, fda_pathway, current_phase (1–5) | LDT inventory + phase milestones | model_assisted |
| GSPR checklist (23 reqs) | (panel) | `POST/PUT /api/ivdr/gspr-checklist/:projectId` (`GSPR_REQUIREMENTS:967`) | per-requirement status (not_assessed/compliant/partial/non/na), evidence links | conformity matrix by Chapter I/II/III + overall % | — |
| Scientific validity / study design | (calculators) | `POST /api/ivd-lifecycle/{scientific-validity,study-design,program-plan}` (`:452`,`:176`,`:269`) | assayType, intendedUse, specimen, biomarker | validity verdict / study program / program plan | model_assisted |

### 3.3 — Risk (ISO 14971) & Software (IEC 62304)
| Capability | AnA tool (file:line) | Human form / route | Inputs | Output | Pedigree |
|---|---|---|---|---|---|
| Create risk item | `create_risk_item` (2522) | `POST /api/mdx/risk-items` (`createItemBody:60`) | hazard, hazardous_situation, harm, severity 1–5, probability 1–5, detectability, control_strategy, source (fmea/pha/fault_tree/…) | risk row; server computes initial_risk = sev×prob; `ui_kits/risk/data.jsx` `rmBand` (≥15 unacceptable, ≥8 ALARP) | model_assisted |
| Add risk control | `add_risk_control` (2545) | `POST /api/mdx/risk-items/:id/controls` (`createControlBody:83`) | description, control_type, implementation/verification/effectiveness evidence, introduces_new_risk | control; residual recompute | model_assisted |
| Software lifecycle item | `create_software_lifecycle_item` (2566) | `POST /api/ivd-lifecycle/software/*` | safety_class A/B/C, item_kind (srs, sds, arch, tests, sbom, threat_model, cybersecurity…) | software lifecycle artifact (IEC 62304) | model_assisted |
| Risk summary | (panel) | `GET /api/mdx/risk-summary/:programId` (`:329`) | programId | total, open, high_residual (≥15), avg initial/residual | — |

### 3.4 — Labeling & UDI
| Capability | AnA tool (file:line) | Human form / route | Inputs | Output | Pedigree |
|---|---|---|---|---|---|
| Create UDI record | `create_udi_record` (2497) | `POST /api/mdx/udi` | UDI-DI, issuing agency (GS1/HIBCC/ICCBBA), device_class, product_code, mri_safety, lot/serial, single_use | UDI record | model_assisted |
| Labeling document | (panel) | `POST /api/mdx/labeling` (`DOC_KIND:46`, `DOC_STATUS:47`) | docKind (ifu, package_insert, patient_label, operator_manual, …), version, region, udiDi | labeling doc (draft→effective→superseded) | — |
| Translations | (panel) | `POST /api/mdx/labeling/:id/translations` | language, method (human/mt_postedited/machine), back_translation_verified | translation; coverage `GET …/coverage` (`:346`) | — |
| Symbols (ISO 15223-1) | (panel) | `POST /api/mdx/labeling/:id/symbols` | symbol_code, name, requiredBy (e.g. ISO 15223-1) | symbol set | — |
| Advise labeling structure | `advise_labeling_structure`, `screen_promotional_language` | (chat) | content, market | US PI vs EU SmPC routing / promo screen | model_assisted |

### 3.5 — Submission ops (shared eCTD/eSTAR spine — see §5)
| Capability | AnA tool (file:line) | Human form / route |
|---|---|---|
| Package eCTD for region | `package_ectd_for_region` (2798) | `POST /api/submission-ops/.../generate-ectd` |
| Validate eCTD/eSTAR package | `validate_ectd_package` (3107) | `POST /api/submissions/:id/validate` |
| Shadow review | `run_shadow_review` (3089) | `POST /api/submissions/sequences/:seqId/shadow-review` |
| Dispatch QC gate | `dispatch_qc_check` (3202) | `POST /api/submissions/:id/dispatch-qc` |
| Transmit submission | `transmit_submission` (2833) | `POST /api/submissions/:id/dispatch` (e-sign gated) |
| Trace provenance | `trace_provenance` (3224) | `GET /api/submissions/:id/provenance` |
| SEND/CDISC readiness (nonclinical) | `review_send_readiness` (4049) | `/api/cdisc-validation/*` |

### 3.6 — Advisory (model_assisted) AnA modules
`server/services/ana-advisory/index.ts` exports `pma-advisor`, `eu-techdoc-advisor`, `ivd-knowledge-advisor`, `device-market-advisor`, `submission-plan-advisor`; plus general `advise_regulatory_pathway`, `advise_risk_management`, `advise_special_designation`. These are chat-only guidance framing deterministic engine output — badge as `model_assisted`, link to the governed run.

---

## §4 · Form catalog & rendering model

### 4.1 — FDA forms (510(k) / De Novo)
`server/routes/fda-forms.routes.ts` + `server/config/FDAFormsRegistry.ts`:
- **FDA 3514** CDRH Premarket Notification Cover Sheet (`:85`, required)
- **FDA 3601** User Fee Cover Sheet (`:92`, required, depends on 3514)
- **FDA 3881** Indications for Use Statement (`:99`, required)
- **FDA 3654** Certification/Disclosure Statement (`:106`, required)
- Registry `GET /api/fda-forms/registry`; generation `POST /api/fda-forms/project/:projectId/generate/:formType` (`case 'FDA_3514':` `:155`).

### 4.2 — eSTAR section forms
`estar-mapper.ts` slots (§2.1/2.2). Fill machinery is the **proven IND AcroForm filler** reused for eSTAR (`server/services/ind-forms/ind-form-fill-service.ts`, per `DEVICE_IVD_SUBMISSION_ASSEMBLY_SPEC_2026-06-15.md:15,83-85`). **[GAP]** official FDA eSTAR PDF templates must be vendored before official PDFs can be produced (spec §7); until then output is `officialEstarPdf:false` content packages.

### 4.3 — IVDR / risk / labeling forms
Classification (`classifySchema:28`), analytical validation (`validationSchema:43`), clinical 2×2 (`clinicalEvidenceSchema:51`), CDx (`cdxWorkflowSchema:62`), GSPR 23-req, PER, risk/FMEA (`createItemBody:60`, `createControlBody:83`), labeling (`DOC_KIND:46`), UDI, translations, symbols.

### 4.4 — Rendering model
Prefer **schema-driven dynamic forms**. Gold reference: global-RI catalog returns per-tool `inputSchema` (`ui-surface-registry.ts:84-91`); replicate that for FDA forms (`/api/fda-forms/registry`) and the Zod-schema'd IVDR/risk routes. Each form is fillable by a human **or** pre-filled by the paired AnA tool (§3).

---

## §5 · Reporting & exports

### 5.1 — Report OS (governed reports)
`shared/schema/report-os.ts`, `server/services/report-os/orchestrator.ts`, `server/routes/report-os.ts`. Scope enum `account | program | project | study | submission | document`. Orchestrator computes blockers + confidence + freshness and registers an immutable artifact.

### 5.2 — Sealing & provenance (21 CFR §11.50)
`server/services/report-os/sealing/types.ts`: `ProvenanceAtom` (`:15`: blockPath, sourceTable, sourceField, recordId, transformation, confidence, auditId), `SealedRecord` (`:29`: algorithm sha256, contentHash, atoms, aiDisclosed, sealedAt). Render a `SealBadge` + expandable `ProvenanceTrail` and an explicit **AI-disclosed** flag.

### 5.3 — Device exports
- eCTD leaf PDF: deterministic `renderLeafPdf` (`server/services/ectd/leaf-pdf-renderer.ts`), assembly `assemble-from-core.ts` (surfaces unresolved leaves, audit-logged).
- PDF/A-1b conversion + MD5 recompute: `server/services/submission-gateways/regional-packager.ts`.
- eSTAR ZIP honesty: `510k-estar-routes.ts:183` (`officialEstarPdf:false`).
- The unifying contract: `assemble-device-submission.ts` — `DeviceArtifactKind` (`:35`: `official-estar | content-package-draft | none`), `artifactKind` decided honestly (`:120`).

### 5.4 — Report families & entitlements
`MDX_PAYING_CUSTOMER_VALUE_AND_ENTITLEMENTS_2026-06-15.md:98-135`: report families (Exec/RA/QA) → **standard**; Regulatory Forecast + CRL/RTF Pre-Mortem + scheduled/drift reports → **professional**; portfolio rollup → **enterprise**. Enforced via `server/services/entitlements/mdx-entitlements.ts`.

### 5.5 — Post-market reports
`server/routes/ivd-lifecycle.ts:474-477` authoring: **eMDR/MIR/FSN/PSUR**; plus PMS/PMPF and FDA post-market via `server/services/ivd-knowledge/regulatory/{eu-ivdr,fda-ivd}.ts`.

### 5.6 — Submission gateways (honest transmit)
`server/services/submission-gateways/*` (fda-esg, ema-cesp, pmda-gateway): `canTransmit=false` for advisory-only markets; return `gateway_not_configured` when credentials absent — **never** a fabricated ACK.

---

## §6 · Cross-cutting dependencies

- **Auth / tenant / entitlements / AnA rail / e-signature:** `ui-surface-registry.ts:635-671`.
- **Medtech pricing/tiers:** `server/services/billing.ts:205` (Standard $349/user, Professional $299/user 5+, Enterprise custom); features per tier include 510(k) Workflow, CER Generation, Predicate Intelligence, eSTAR Builder, GSPR Mapping (standard), EU MDR/IVDR + SAML SSO (professional).
- **Industry+tier gating:** `server/services/license-manager.ts` (`canAccessModule` checks enablement + tier + `industries[]`). Locked modules → upgrade CTA (self-serve), never a dead button.
- **Honesty contract:** `assemble-device-submission.ts:35,60,120` (`DeviceArtifactKind`).

---

## §7 · Compliance & human factors (gating — read before building)

From `HUMAN_FACTORS_AND_USABILITY_SPEC_2026-06-15.md` (IEC 62366-1, FDA HFE, WCAG 2.2 AA, 21 CFR Part 11):

**8 critical tasks + mitigations (UI must implement):**
1. Sample data treated as governed → `isSample` guard: labeled empty-state, export/finalize **disabled**.
2. Draft eSTAR ZIP treated as submittable → `officialEstarPdf:false` pill "Draft — not an official eSTAR"; dispatch blocked.
3. Wrong market → region selector shows Advise/Assemble/Transmit; `canTransmit=false` blocks 8 advisory-only markets.
4. Low-confidence prediction read as certain → every number shows confidence band + freshness + source/denominator; cold-start de-emphasized.
5. Seal/sign wrong artifact → role-gated; manifestation restates title, scope, version, **content hash**; drafts watermarked.
6. Wrong tenant (CRO) → persistent context in top bar; server-side isolation; confirm on context change.
7. Partial/degraded report → `partial` state; blockers at top, never buried.
8. AnA narrative treated as source → numbers carry provenance + link to sealed run; assistant pane visually distinct.

**a11y (always):** visible focus, ARIA live for async run status, **color is never the only channel** (status pills/confidence/draft-vs-official use text+icon+shape), keyboard-navigable scope tree, 24×24 targets, AA contrast, `prefers-reduced-motion`.
**Microcopy:** calm, factual, sentence case; no emoji/exclamations/cheerleading/"oops"/"are you sure?"; fixed status vocabulary (Drafting, In review, Approved, Locked, Ready, Blocked).
**Part 11 e-sign:** manifestation `RequiredManifestFields` (`server/services/compliance/signature-manifestation.ts:33`: printedName, dateTimeUtc, meaning) — reuse the one `ESignatureModal`.
**Validation:** formative (5–8/role, degraded states) then summative (15+/role) before GA; GA acceptance checklist in spec §5.

---

## §8 · Readiness, build sequence & component inventory

**Readiness:** `device-510k` / `device-cer` / `device-diagnostics` are routes-ready (bind to endpoints, add a `@shared` contract as you go); `labeling` / `risk` are **kit-only** (lift `ui_kits/labeling` + `ui_kits/risk` structure).

**Suggested build order:** (1) cross-cutting first — `FilingStepper`, `PedigreeBadge`, `ESignatureModal`, `HonestyPill`, `LockedModuleCard`. (2) 510(k) workbench (highest-value, contract exists). (3) IVD classifier + analytical/clinical performance (strong backend). (4) Risk (ISO 14971) + Labeling from kits. (5) CER assembly. (6) PMA.

**Component inventory (reuse + device-specific):**
`FilingStepper`, `PredicatePanel`, `SEMatrix`, `DefensePacketBoard`, `eSTARSectionTree`, `FdaFormFiller`, `IVDClassifier`, `Clinical2x2`, `AnalyticalPerformanceForm`, `GSPRChecklist`, `RiskMatrix (ISO 14971)`, `RiskControlTable`, `SoftwareLifecycleList (IEC 62304)`, `UDIRecord`, `LabelingTranslationCoverage`, `CdxPairingBoard`, `CliaCategorizer`, `LdtPhaseTracker`, `ProvenanceTrail`/`SealBadge`, `PedigreeBadge`, `ESignatureModal`, `HonestyPill`, `RegionTransmitSelector`.

---

## §9 · Open gaps / honesty flags

- **[GAP]** Official FDA eSTAR PDF requires vendored templates (`DEVICE_IVD_SUBMISSION_ASSEMBLY_SPEC_2026-06-15.md §7`); today outputs are honest content packages (`officialEstarPdf:false`).
- **[GAP]** CER surface is **dashboard-only** (registry note `:286-299`); GSPR/export assembly UI incomplete.
- **[GAP]** `labeling` and `risk` are **kit-only** — prototypes exist, no wired UI.
- **[GAP]** External LORENZ **eValidator** integration is specced, not wired (`EVALIDATOR_INTEGRATION_SPEC.md`) — internal validators only today.
- **[GAP]** CDx / IVD have strong backends (`ivdr-routes.ts`, `ivd-platform.openapi.json`) but little UI; `device-diagnostics` is routes-ready, not contract-ready.
- Advisory-only global markets (Health Canada, NMPA, ANVISA, TGA, MFDS, MHRA, Swissmedic, India) — readiness/planning only, `canTransmit=false`.

---

*All citations verified against the repo at the date above. This is the contract + design-intent floor; the components and presentation are Design's.*
