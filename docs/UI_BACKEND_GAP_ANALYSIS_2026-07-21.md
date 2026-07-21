# UI ↔ Backend Gap Analysis — Trapped Capabilities & Design Needs

**Date:** 2026-07-21
**Branch:** `claude/design-kits-audit-backend-wire-oqbqs4`
**Scope:** The v2 shell (`client/src/concept2cure/v2`) and the surfaces registered in `surfaceViews.ts` (`SURFACE_VIEWS`), measured against the real, tested backend under `server/routes`, `server/api`, `server/services`.
**Method:** A quantitative sweep of every `/api/*` mount vs. every `/api/*` string consumed by the client, plus four parallel domain audits (regulatory-core, clinical/safety, documents/authoring, platform/AI). Every claim below cites `file:line`.
**Companion doc:** `docs/UI_KIT_BACKEND_WIRING_AUDIT_2026-07-21.md` (the running wiring roadmap — what has been de-mocked so far).

---

## 0a. Delivery status (updated 2026-07-21, end of session)

Since this analysis was written, the following trapped capabilities have been **built, tested (contract tests, no DB required), and pushed** on this branch:

| Gap item | Delivered as | Commit theme |
|---|---|---|
| Editable authoring canvas (#2) | `DocumentAuthoring.tsx` — docs→sections→edit→auto-revisioned save→history/revert→comments on `/api/authoring` | `authoring:` |
| E-signature chain (#4, modal half) | `Part11SignModal` — verify-password→verify-mfa→sign with §11.50 manifestation on `/api/esignature` | `esign:` |
| Document filing (freeze + e-sign) | `AuthoringFilingBar` — freeze (sha256 seal) + PIN e-sign on `/api/authoring/docs/:id` | `authoring:` |
| eCTD compile & export (#1, compile slice) | `EctdCompile` surface — readiness/validate/compile→backbone XML download on `/api/ectd-compile` | `ectd:` |
| Submission Twin (#8) | `SubmissionTwin` surface on `/api/submission-twin` | `twin:` |
| PV cockpit (#10) | `PvCockpit` — KPIs, ROR/PRR/EBGM screener, reporting clock, compliance matrix on `/api/pharmacovigilance` | `pv:` |
| Biostat workbench (#3, first slice) | `BiostatWorkbench` — defensibility engine + assurance calculator on `/api/statistical-defensibility` + `/api/biostat` | `biostat:` |
| RBM write layer (#9) | `RbmOperations` — KRI capture, site-risk/central-monitoring/patient-scoring on `/api/mdx/rbm-*` | `rbm:` |
| QMP CRUD (#14) | `QmpWorkspace` on `/api/quality` | `qmp:` |
| AI-Actions allow-list (#12) | 11 handlers unblocked in `VALID_ACTION_TYPES` + role permissions | `ai-actions:` |
| Part 11 console (#4) | `Part11Console` — chain-integrity, §11.10 status, SOC 2 grid on `/api/part11`; **fixed the route-shadowing bug** that made chain/seal-integrity unreachable | `part11:` |
| Protocol registers (§2.5) | `ProtocolRegisterForms` — risk/milestone/amendment/deviation creates wired to the real governed routers (dialog was a no-op) | `protocol:` |
| SSO/SCIM console (#13) | `IdentityConsole` — SCIM token issue-once/rotate/revoke, IP allowlist, SAML endpoint references | `identity:` |

**Second wave (same day):** template extract/save/render made real (#7 — `TemplateLibrary` now drives extract/from-upload/render, fake setTimeout + dead buttons removed); IND Module-1 forms panel (#11 — `IndFormsPanel` builds/QCs/downloads real 1571/1572/3674 PDFs inside IndLifecycle); sentence click-through (#6 — SourceTracer's Trace action resolves a sentence to its exact source span via `/api/audit-services/traceability/click-through`); intelligent-reports governance (#15 — `ReportGovernance` surface: list, cryptographic verify, provenance/attestations, seal/revoke with justification).

**Third wave (same day):** appsLive test suite repaired (the 4 failures locked a pre-honesty Apps iteration; rewritten to the fixture-free behavior — suite fully green); Dossier now binds `/api/dossier-readiness/:projectId` (live per-CTD-section rollups + summary); HAQ Route-to-review/Approve persist via the real store endpoints (the `/rounds` mapper now emits the numeric `dbId` they key on); PrecedentEngine saves/reloads/deletes queries on `/api/saved-precedent-queries` (chips + JSON round-trip through the free-text query column, productCode/pathway normalized into scope).

**DeviceSubmission mount — verdict: NOT mounted.** On inspection the orphaned hub's spine is fixture seed data (`DV` from device-data) and its governed dialog is an explicit no-op flagged "MOCK ACTION" — including an "Assemble package / Submit to gateway" flow presented with a 21 CFR Part 11 e-signature affordance that performs no work. Mounting it as-is would ship a fake Part 11 flow, violating the no-mock mandate. It stays unmounted until its spine is rebound to the real endpoints it already references (`/api/capa-mdr`, `/api/inspections`, `/api/pccp`, `/api/cybersecurity-524b`, `/api/design-controls`) and its governed dialog is wired — a dedicated de-mocking pass, not a registry entry.

**Fourth wave (same day) — everything closed:**
- **Gateway transmittals (#5)** — `GatewayTransmittals` surface (`gateway-transmittals`): gateway roster + credential status, governed transmit (§11 re-auth + reason), transmittal log, live status poll, ACK download, governed rollback; 401/409/412/422 gates each surfaced with the server's reason. E2E transport against live agency gateways still needs a running app + credentials.
- **Realtime-collab locks/presence** — `AuthoringCollab` in the canvas header: joins the section room (server's connectedUsers roster as presence), acquire/release section locks, 409 conflicts surfaced. Yjs CRDT socket co-editing (live cursors) remains the one open editor-infrastructure build.
- **Document CREATE + PUBLISH** — `AuthoringCreateExport`: New document (optional template seed), New section, and Word/XML publish via `/docs/:id/export`. One surface now covers create → draft → edit → history/revert → comment → presence/lock → freeze → e-sign → publish across M1–M5 — the product's core loop. (A PDF button is deliberately absent: the server's pdf branch returns mislabeled DOCX bytes — backend fix needed before it can be offered honestly.)
- **Test suite fully green: 916/916** (66 files). The appsLive failures were a stale pre-honesty test, rewritten to lock the fixture-free behavior.

Remaining (all documented, none silently open): Yjs CRDT socket sync; the DeviceSubmission de-mocking pass; the backend `pdf` export branch (returns DOCX bytes under a PDF label); full E2E validation of transmit/ACK against live gateways.

## 0. Headline

The backend is **far** larger than the UI exposes. This is not a "a few endpoints are unwired" problem — it is a structural one: a large fraction of production-grade, tested regulatory machinery is reachable by no human-clickable affordance at all.

| Metric | Count |
|---|---|
| Backend `/api/*` route groups mounted | **~291** |
| Approx. distinct endpoints across them | **~3,943** |
| Route groups referenced anywhere in the client | **~215** |
| **Route groups with ZERO client reference** | **108** (≈ 87 user-facing after excluding ops/infra) |

The 108 fully-dark route groups are only the floor. On top of them sit a second class of gap — route groups that **are** referenced but only for a shallow read while the write/compute layer behind the same mount is untouched (RBM, biostatistics, PV, protocol, templates, submissions). Those "UI-THIN" surfaces are where the largest depth-vs-UI deltas live.

**The three failure modes, by severity:**

1. **[NO-UI]** — backend exists, tested, mounted; **no surface consumes it**. The capability is invisible.
2. **[UI-THIN]** — a surface is mounted and does a live read, but the deep write/compute/generate layer behind the same backend is faked, `onAsk`-deferred to chat, or honest-empty. The capability is *teased* but not operable.
3. **[UI-COMPLETE]** — rich, wired, governed. This is the target state (e.g. CMC Module 3, eTMF, Audit Trail, Insights generate-loop, Precedent Engine board).

---

## 1. Top trapped capabilities (ranked, cross-domain)

These are the highest value-per-build-effort gaps, synthesized across all four audits. Each is a real backend with a clear "file to the agency / sign the record / edit the document" user job that currently has **no button**.

| # | Capability | Backend (real, tested) | Current UI state | Why it matters |
|---|---|---|---|---|
| 1 | **eCTD compile & export** | `ectd-export.ts:324` streams ICH M8 v4.0 ZIP; `ectdExportService.ts:388` writes `index.xml` backbone + us/eu regional XML + DTD bundle + md5; `ectd-compile.ts:100` persists backbone | **COMPILE SLICE DELIVERED** (2026-07-21): new `EctdCompile.tsx` surface (`ectd-compile`) drives the real `/api/ectd-compile` engine — module readiness, region (FDA/EMA) + submission-type pickers, validate findings, compile → per-module status + downloadable eCTD 4.0 backbone XML + errors/warnings, and history. Still trapped: the full ZIP+DTD package stream (`/api/ectd/export/:submissionId`). | The platform's headline deliverable — assembling the actual submission — is now compilable from the UI. |
| 2 | **Editable authoring canvas + Yjs co-authoring** | `authoring.router.ts` section save/history/cite (`:1158/1247/1469`); `realtime-collab.ts` Yjs presence/locks/Part 11 audit | **DRAFT/EDIT SLICE DELIVERED** (2026-07-21): `DocumentAuthoring.tsx` now drives docs→sections→editable content with save (auto-revisioned PATCH), a revision-history rail (+revert), and real comments, all on `/api/authoring`. Still trapped: Yjs real-time co-authoring presence/locks. | Nothing could edit a section; now the core human draft/edit/save/history/comment loop is wired. |
| 3 | **`/api/biostat` statistical continuum** | `biostatPlatform.ts` (1030 lines): governed SAP sign/lock/amendment, ICH E9(R1) estimand engine, external-control synthesis, adaptive/IDMC; `biostat-design-stats.ts` (853 lines): OC/assurance/MMRM/win-ratio/RMST/BOIN/MRMC | `Biostatistics.tsx:178` runs a **client-side normal approximation**; never calls the real engine | Deepest depth-vs-UI gap in the repo. A regulator-grade stats platform replaced by a browser calculator. |
| 4 | **Part 11 compliance console + e-signature chain** | `part11-compliance.ts` (1203 lines): signing-authority `:941`, signature manifest `:602`, chain-integrity `:783`, seal-integrity `:1184`, SOC2 `:1010`; `esignature.ts` password→MFA→`/sign` `:76/108/149` | No surface references `/api/part11`; `esignature/sign` is deliberately **not** called (`BioPathwayPanes.tsx:463`, unmounted) | The single strongest regulatory selling point (defensible signatures) is invisible; e-sign stops before it signs. |
| 5 | **Submission-gateway transmittals** | `mdx-submission-gateway.ts:196` transmit / `:409` status / `:434` ack / `:469` rollback / `:543` findings — multi-region ESG/CESP/PMDA/MHRA/TGA/HC/NMPA | Only UI (`VaultSources.tsx`) is **orphaned** (not in `SURFACE_VIEWS`) | The literal "transmit to the agency" action across every region has no button. |
| 6 | **Sentence-level source click-through** | `sentenceTraceabilityService.ts` via `audit-services.ts:236` `traceability/click-through` — sentence → exact source span + content-hash verify | `EctdCoauthor.tsx:234` provenance hover is **fixture-rendered**; the real service has no consumer | The product's marquee "verify any sentence" promise is unshipped. |
| 7 | **Template extract + render loop** | `c2c/templates.ts`: `/extract:102`, `/from-upload:121`, **`/:id/render:235`** (DOCX/PDF) | `TemplateLibrary.tsx:262` fakes extraction with `setTimeout`; **render buttons have no onClick** (`:490`) | The strongest backend in the platform can list templates but cannot extract or render one. |
| 8 | **Submission Twin** | `submission-twin.ts` (16 DB ops): reviewer-challenge simulation `:194`, evidence-drift `:150`, change-impact `:234`, readiness `:311` | Zero UI | Highest "wow" per build effort — a digital twin of a submission, entirely dark. |
| 9 | **RBM operational write/compute layer** | `mdx-rbm.ts` (~40 endpoints): KRI values `:527/569`, QTL breach, central-monitoring `:845`, site-risk recompute `:824`, patient-profile score `:991`, plan/action approve | `Rbm.tsx` reads only the aggregated `rbm-board`; **no write endpoint wired** | Risk-based monitoring is read-only; the monitors can't act. |
| 10 | **PV cockpit (ICSR/E2B, signals, periodic reports)** | `pharmacovigilance-routes.ts`: `icsr/generate:344`, `signals/screen:503`, `periodic-reports`, `compliance-matrix:627`; ROR/PRR/EBGM engine `biostats-signal-engine/`; `psur-dsur-service.ts` | `Pharmacovigilance` reads **one** board endpoint; log-signal form writes to local state | Safety surveillance — the most time-sensitive regulatory obligation — is a read-only board. |
| 11 | **FDA IND form PDFs + IND lifecycle** | `ind-forms.routes.ts:149` streams real 1571/1572/3674/3454/3455 PDFs; `ind-submissions.routes.ts:407` IND→eCTD transition | `IndLifecycle.tsx` reads a readiness checklist; Export button just `onAsk`s (`:283`) | Fillable FDA form generation and the IND state machine are trapped behind a status chip. |
| 12 | **AI-Actions inline-AI + OCR + template-render (11 of ~19 handlers)** | Registered in `ai-actions/index.ts:37`, blocked by the 8-entry allow-list at `shared-utils.ts:201`: `summarize/explain/rewrite/extract_structured/compare_selection`, `ocr_extract_text`, `render_document_with_template` | No surface fires them | Cheapest fix in the report (add names to an array + an editor toolbar), high daily-use value. |
| 13 | **SSO + SCIM enterprise identity** | `sso.ts` (689 lines) SAML/OIDC; `scim.ts` (849 lines) full Users/Groups CRUD | Only a fixture toggle in `Setup` that **never persists** (`AdminSurfaces.tsx:288`) | 1,538 lines of enterprise-identity backend with no operable console. Blocks enterprise onboarding. |
| 14 | **QMP quality-management CRUD** | `quality-management-api.ts`: plans `:471/581/634`, dashboard `:51`, batch-validate `:183` on `/api/quality` | No v2 consumer (grep = 0) | A full quality-plan lifecycle backend, zero UI. |
| 15 | **Intelligent-reports governance lifecycle** | `intelligent-reports.ts` generate→provenance→seal→attestations→verify→supersede→revoke `:106-465`; report-os bundles/deliveries | `Insights.tsx` ships only the generate→finalize slice | The governance-of-reports loop (seal/attest/supersede) is trapped. |

---

## 2. Per-domain breakdown

### 2.1 Regulatory submissions & eCTD

| Capability | Backend | Class |
|---|---|---|
| eCTD package generation + regional XML export | `ectd-export.ts:324`, `ectdExportService.ts:388`, `ectd-compile.ts:100` | **NO-UI** |
| eCTD leaf documents CRUD (lifecycle new/replace/append/delete) | `ectd-documents.ts:44-376` | **NO-UI** |
| eCTD submission agent (prepare→validate→submit→amend) | `ectd-submission-agent.routes.ts:78-193` | **NO-UI** |
| Submission Orchestrator (M2 QOS/nonclinical/clinical auto-authoring, audited runs) | `submission-orchestrator.ts:280-692` | **NO-UI** |
| Submission Center action workspaces (sequence transitions, eValidator findings, cross-region, dispatch) | `/api/submissions/**` (real) | **UI-THIN** — all 6 deferred to `onAsk` (`SubmissionCenter.tsx:388/425/544`) |
| Governed sign & release (§11 e-signature on submission) | `submission-sign-release.ts:159` | **NO-UI** — dispatch only asks chat |
| Dispatch readiness gate | `/api/submissions/sequences/:seqId/dispatch-readiness` | **UI-COMPLETE** (`DispatchReadiness.tsx:100`) ✅ |
| FDA ESG gateway transmission | `esgSubmissionRoutes.ts:14-133` | **NO-UI** |
| Universal packager | `/api/packager` | **NO-UI** |

### 2.2 IND lifecycle

| Capability | Backend | Class |
|---|---|---|
| IND readiness checklist (312.23, 30-day clock) | `/api/ind-checklist` | **UI-COMPLETE** (`IndLifecycle.tsx:56`) ✅ — but the *only* IND endpoint touched |
| FDA IND form PDFs (1571/1572/3674/3454/3455) | `ind-forms.routes.ts:103-194` | **NO-UI** |
| IND submission state machine + transition-to-eCTD | `ind-submissions.routes.ts:79-407`; `/api/ind-lifecycle`, `-generation`, `-autodraft`, `-sections`, `-kpi` | **NO-UI** |
| Protocol amendments (change list, readiness, status) | `protocol-amendments.ts:96-159` | **NO-UI** |
| IND safety report (312.32) / annual report (312.33) authoring | routed to chat only (`IndLifecycle.tsx:157`) | **NO-UI** |

### 2.3 CMC / Module 3

| Capability | Backend | Class |
|---|---|---|
| Module 3 operating system (board, specs, batch records, governed §11 section approve) | `/api/cmc/module3-*`, `/specifications`, `/batch-records` | **UI-COMPLETE** (`CmcModule.tsx`) ✅ **— the model surface** |
| Stability / Q1E projection, Module-3 compile | `module3Composer.ts`, `cmc-module3-compiler.ts`, `cmc-changes.routes.ts` | **UI-THIN** — stability honest-empty, compiler not wired |

### 2.4 Biostatistics & study design

| Capability | Backend | Class |
|---|---|---|
| `/api/biostat` continuum (SAP lifecycle, estimand engine, external-control, adaptive/IDMC, advanced calculators) | `biostatPlatform.ts` (1030), `biostat-design-stats.ts` (853) | **NO-UI** — surface runs client-side approximation |
| `/api/study-design` generative designer (simulate/sample-size/protocol/SAP/SoA/CRF-shell/persist) | `study-design.ts` (526) | **NO-UI** |
| `/api/statistical-defensibility` (reviewer-risk, consistency, endpoint-quality) | `statistical-defensibility.ts:25-224` | **NO-UI** |

### 2.5 Protocol & study design

| Capability | Backend | Class |
|---|---|---|
| Protocol read (denormalized snapshot) | `/api/protocol-dev` | **UI-THIN** — read-only; governed dialogs are **no-ops** (`ProtocolDev.tsx:456`) |
| Protocol operational registers (SoA, amendments, deviations, consent, budget, risks, milestones, reviews) | `protocol-soa/-amendments/-deviations/-consent/-budget/-risks/-milestones/-reviews.ts` | **NO-UI** — entire editable CRUD trapped |

### 2.6 Risk-based monitoring

| Capability | Backend | Class |
|---|---|---|
| RBM aggregated board | `mdx-rbm-board.ts` `rbm-board/:programId` | **UI-COMPLETE** (read) ✅ |
| RBM write/compute (KRI values, QTL breach, central monitoring, site-risk recompute, patient-profile score, plan/action approve) | `mdx-rbm.ts` (~40 endpoints) | **NO-UI** — entire operational layer |

### 2.7 Pharmacovigilance & safety

| Capability | Backend | Class |
|---|---|---|
| PV board (disproportionality read) | `pharmacovigilance-board.routes.ts:210` | **UI-THIN** — only endpoint wired |
| ICSR/E2B generate, periodic reports (PBRER/PSUR), signal screening | `pharmacovigilance-routes.ts:344/503/…`; ROR/PRR/EBGM `biostats-signal-engine/`; `psur-dsur-service.ts` | **NO-UI** |
| Single-case safety narrative (ICH E3 §16) | `safety-narrative.ts`, `SafetyNarrative.tsx` | **UI-COMPLETE** ✅ |
| Aggregate / benefit-risk / cross-study narrative generators | `safety-narrative.ts:125-294` | **NO-UI** |

### 2.8 Evidence, eTMF, CER/MDR, device/IVD

| Capability | Backend | Class |
|---|---|---|
| eTMF (reference model, completeness, artifacts, inspection package) | `etmf.routes.ts`, `Etmf.tsx` | **UI-COMPLETE** ✅ |
| Evidence sufficiency / fabric / objects graph | `evidence-sufficiency.ts`, `evidence-fabric.ts`, `evidence-objects.ts` | **NO-UI** — `Evidence.tsx` reads only ask threads |
| CER / EU MDR generator (FAERS narrative, `mdr/generate`, `mdr/validate`) | `cer-routes.ts:301-616` | **NO-UI in v2** (delivered via MDX frame only) |
| Device design controls / human factors / IVD completeness | `/api/design-controls`, `/human-factors`, `/ivd-completeness` | **UI-COMPLETE / THIN** ✅ |
| Predicate / substantial-equivalence / classification / 510(k) / cybersecurity-524b / PCCP / companion-Dx | `predicate-intelligence.ts` (716), `substantial-equivalence.ts`, `fda510k-unified.ts`, `cybersecurity-524b.ts`, `pccp.ts`, … | **NO-UI in v2** (MDX-only or trapped) |
| **Orphaned rich device surfaces** (built, never mounted) | `DeviceSubmission.tsx` (CAPA/MDR/inspections/PCCP/cybersecurity), `DeviceIntel.tsx`, `PvSignal.tsx` | **NO-UI** — trapped *UI*, not just backend |

### 2.9 Authoring, templates, traceability, validation, labeling, reporting

| Capability | Backend | Class |
|---|---|---|
| Editable canvas (section save/history/revert/comment/cite) | `authoring.router.ts:1158-1788` | **NO-UI** — no consumer in v2 |
| Real-time co-authoring (Yjs rooms, awareness, locks, conflict resolve) | `realtime-collab.ts:330-590` | **NO-UI** |
| Inline threaded annotations (reply/decide) | `inline-annotations.ts:37-157` | **NO-UI** |
| Version browse / compare / track-changes | `cerv2-versions.ts`, `authoring.router.ts` history | **NO-UI** |
| E-signature (password+TOTP+SHA-256) + approval workflow (start/approve/reject/delegate/queue) | `esignature.ts:76-149`, `approval-workflow.ts:71-335` | **NO-UI** |
| Template extract-from-upload + render-to-DOCX/PDF | `c2c/templates.ts:102/121/235` | **UI-THIN** — list reads; extract faked, render dead |
| Sentence click-through to source span | `sentenceTraceabilityService.ts` via `audit-services.ts:236` | **NO-UI** (in-editor); `SourceTracer.tsx` viewer is **UI-COMPLETE** ✅ |
| Completeness / numeric-reconciliation / verify-against-source validation | `validate-completeness.ts:43`, `confidenceScoringEngine.ts` | **NO-UI** |
| Contradiction scanning | `governed-intelligence-inconsistency-routes.ts`, `Inconsistency.tsx` | **UI-COMPLETE** ✅ |
| Labeling USPI/SmPC + translations + glossary | `mdx-labeling.ts`, `Labeling.tsx`, `TranslationWorkspace.tsx` | **UI-COMPLETE** ✅ |
| Labeling-PI negotiation redline (write) | `labeling-pi.routes.ts` | **UI-THIN** — read-only |
| SPL/FHIR output + label coverage | `spl-fhir.ts`, `mdx-labeling.ts:360` | **NO-UI** |
| Report generate→render→seal | `report-os.ts:1099/1417/1459`, `Insights.tsx` | **UI-COMPLETE** ✅ (core loop) |
| Report bundles/deliveries + intelligent-reports seal/attest/supersede/revoke | `report-os.ts:1619`, `intelligent-reports.ts:230-465` | **NO-UI** |

### 2.10 Platform, ANA, admin, integrations

| Capability | Backend | Class |
|---|---|---|
| Module subscriptions/entitlements, API keys, usage/billing, audit ledger, governed-action modal | `module-subscriptions.ts`, `/api/api-keys`, `billing*.ts`, `audit-trail-routes.ts` | **UI-COMPLETE** ✅ |
| SSO (SAML/OIDC) | `sso.ts` (689) | **UI-THIN → NO-UI** — fixture toggle, never persists |
| SCIM provisioning (Users/Groups CRUD) | `scim.ts` (849) | **NO-UI** |
| Org-profile editor | `/api/setup` | **UI-THIN** — self-declared unwired (`AdminSurfaces.tsx:2138`) |
| Part 11 console (signing authority, manifests, chain/seal integrity, SOC2) | `part11-compliance.ts` (1203) | **NO-UI** |
| QMP quality-management CRUD | `quality-management-api.ts` | **NO-UI** |
| Orchestration run-from-template + pre-submission-gate | `orchestration.ts:90/468` | **UI-THIN** — actuation deferred to chat (`Orchestration.tsx:421`) |
| AI-Actions inline-AI/OCR/template-render (11 handlers) | `ai-actions/index.ts:37`, blocked at `shared-utils.ts:201` | **NO-UI** — dead-reachable |
| Submission gateways (multi-region transmit/ack/rollback) | `mdx-submission-gateway.ts:196-583` | **NO-UI** — only orphan UI |
| Veeva Vault sync, MDX Vault, eValidator run, MedDRA | `veeva-vault/*`, `mdx-vault.ts`, `ectd-structural-validator.ts` | **NO-UI / UI-THIN** |

---

## 3. ANA: the chat-only tool families

ANA's backend has two halves: ~410 advisory/knowledge tools (`AnaToolDefinitions.ts`) reachable only via free-text chat, and ~150 platform-mutation commands (`command-executor.ts:4534`) invoked through `execute_platform_command`. Many families are mirrored by a domain surface (RBM→`rbm`, precedent→`precedent-intelligence`, reports→`report-engine`). The UX gap is the families with **no surface at all** — reachable only if the user knows the exact phrase to type:

| Family | Representative tools (`AnaToolDefinitions.ts`) |
|---|---|
| Regulatory advisory (`advise_*` × 14) | `advise_gcp`, `advise_estimand`, `advise_ctd_structure`, `advise_special_designation`, `advise_data_integrity`, `advise_rwe_design` (`:8721-8737`) |
| Medical-writing QA | `medical_writing_review`, `assess_readability`, `build_abbreviation_list` (`:8738-8741`) |
| External evidence search | `search_chembl_compound`, `screen_compound_liabilities`, `search_preprints`, `lookup_icd10_code` (`:8678-8694`) |
| Regulatory reference lookup | `lookup_fda_guidance`, `lookup_ich_guideline`, `generate_citation`, `validate_cross_references` (`:8758-8762`) |
| Grounding / premortem | `check_grounding`, `run_submission_premortem`, `assemble_briefing_book` (`:8747-8752`) |
| DOCX native authoring | `author_docx_native`, `surgical_docx_xml_edit`, `verify_docx_against_source`, `insert_clause_template` (`:8769-8776`) |
| Schedule-of-events | `generate_schedule_of_events`, `review_schedule_of_events_health` (`:8672-8674`) |

**These are backend-complete but have zero clickable affordance.** A single "capability launcher" (browsable, parameterized catalog over the tool registry) would unlock ~40 tools at once without building 40 surfaces.

---

## 4. What Claude Design should build (tweaks & needs)

This is the section the request specifically asked for: what the design system / Claude Design can help with. Grouped from cheapest-highest-leverage to net-new surfaces.

### 4.1 Design-system components needed (reusable, unlock many surfaces at once)

1. **Editable document canvas primitive** — a governed TipTap/ProseMirror canvas component with section save, version history rail, inline-comment anchors, and citation marks. This is the **single highest-leverage design asset**: it unblocks the entire authoring domain (DocumentAuthoring, EctdCoauthor, CER, labeling redline) which today all show empty/fixture centers. The orphaned `EditorStudio/EditorCanvas/EditorPanes` kit ports (`surfaces/Editor*.tsx`) are a starting point but are dead code — they need to be bound to `authoring.router.ts` and mounted.
2. **§11 e-signature modal** — a reusable password→TOTP→meaning-of-signature→manifest component that calls `esignature.ts` `verify-password`→`verify-mfa`→`sign` and renders the §11.50 manifestation (printed name / UTC datetime / meaning bound to the record hash). Needed by submission sign-release, approvals, HAQ approve, protocol finalize, report seal — currently each defers to chat or stops before signing. (We already built `GovernedActionSignoff`; this extends it to the full password+MFA+manifest chain.)
3. **Capability launcher / command palette** — a browsable catalog over ANA's advisory/reference/premortem/DOCX tool families so ~40 chat-only tools become clickable, parameterized actions instead of tribal-knowledge phrasing.
4. **Inline selection AI toolbar** — a floating toolbar (summarize / explain / rewrite / extract / compare / OCR-on-upload) for the editor canvas, wired to the 11 trapped AI-Actions handlers (after adding them to `VALID_ACTION_TYPES`).
5. **Findings / readiness table pattern** — a standard "gate result" table (blocker list, severity chips, resolve action) reused by eValidator findings, dispatch gates, pre-submission gate, validation panels. Several surfaces re-implement this ad hoc.
6. **Governed-write dialog wiring convention** — `ProtocolDev.tsx`, `SubmissionCenter.tsx`, `Orchestration.tsx` all render governed dialogs whose `onConfirm` is a no-op or `onAsk`. Design should ship a canonical "governed write → POST → refetch → toast hash-chain" pattern (already proven in `CmcModule.tsx`) and retrofit these surfaces.

### 4.2 Net-new surfaces to design (backend is ready today)

| Surface to design | Binds to | Priority |
|---|---|---|
| **Compile & Export eCTD** (submission/sequence picker, backbone preview, US/EU region toggle, package-validation findings, governed download) | `ectd-export.ts`, `ectd-compile.ts`, `ectd-documents.ts` | P0 |
| **Submission Twin** (readiness score → drift alerts → simulated reviewer challenges → change-impact) | `submission-twin.ts` | P0 |
| **Biostat workbench** (SAP versioning/e-sign/lock, estimand builder, external-control synthesis, adaptive/IDMC looks, advanced calculators) | `/api/biostat`, `/api/study-design`, `/api/statistical-defensibility` | P0 |
| **PV cockpit** (ICSR/E2B generate, PBRER/PSUR authoring, ROR/PRR/EBGM signal screening, reporting-deadline/compliance-matrix) | `pharmacovigilance-routes.ts`, `biostats-signal-engine/`, `psur-dsur-service.ts` | P0 |
| **Part 11 compliance console** (signing-authority matrix, per-signature manifest viewer, chain/seal-integrity verifier, SOC2 status) | `part11-compliance.ts` | P1 |
| **Submission gateway / transmittals** (transmit, poll status, view ACK, rollback, findings) | `mdx-submission-gateway.ts` (+ mount `VaultSources.tsx`) | P1 |
| **Module-1 IND forms panel** (build/QC/download 1571/1572/3674 PDFs) + **IND submission workspace** (create → step tracker → transition-to-eCTD) | `ind-forms.routes.ts`, `ind-submissions.routes.ts` | P1 |
| **RBM operations** (KRI value entry & trend, QTL breach, central-monitoring run, site-risk recompute, patient-profile scoring, plan/action approve) | `mdx-rbm.ts` | P1 |
| **SSO/SCIM connection wizard** (IdP metadata upload, test-login, SCIM token issuance, provisioning log) | `sso.ts`, `scim.ts` | P1 |
| **QMP workspace** (plan list + create/edit + dashboard + batch-validate) | `quality-management-api.ts` | P2 |
| **Protocol registers** (editable SoA / amendments / deviations / consent / budget / milestones) | `protocol-*.ts` sub-CRUD | P2 |
| **Q-Sub / HA-interactions workspace** (re-point AgencyMeetings off fixtures onto `ha-interactions.ts` + commitment register; add Q-Sub sections) | `ha-interactions.ts`, `q-sub.ts` | P2 |
| **Submission Orchestrator runs** (start run → live step audit → per-M2 artifact review → hardened validation gate) | `submission-orchestrator.ts` | P2 |
| **Report governance** (bundles, deliveries, seal/attest/supersede/revoke lifecycle) | `intelligent-reports.ts`, `report-os.ts` | P2 |

### 4.3 Small high-leverage wire-ups (tweaks, hours not days)

- **Template render buttons** — `TemplateLibrary.tsx:490` render-to-Word/PDF buttons have no `onClick`; wire to `POST /:id/render`. Replace the `setTimeout` fake extraction (`:262`) with `POST /extract`.
- **AI-Actions allow-list** — add the 11 registered handler names to `VALID_ACTION_TYPES` (`shared-utils.ts:201`) so already-built handlers stop returning HTTP 400.
- **Saved precedent queries** — `PrecedentEngine.tsx` has the query form; add save/pin/reload chips on `saved-precedent-queries.ts`.
- **Dossier per-section readiness** — `Dossier.tsx:30` documents `/api/dossier-readiness/:projectId` in a comment but never calls it; bind it.
- **HAQ review/approve** — `HaqManager.tsx:213` review/approve are local-only because they key on numeric id not display qid; fix the id mapping and wire governed approve.
- **Mount the orphaned device surfaces** — `DeviceSubmission.tsx` is a rich, fully-wired surface (CAPA/MDR/inspections/PCCP/cybersecurity) that is simply not in `SURFACE_VIEWS`. Add the entry.

---

## 5. Reading guide

- **UI-COMPLETE reference surfaces** (copy these patterns): `CmcModule.tsx`, `Etmf.tsx`, `DispatchReadiness.tsx`, `Insights.tsx`, `PrecedentEngine.tsx`, `AuditTrail`, `Inconsistency.tsx`, `SourceTracer.tsx`.
- **The wiring conventions** (honesty envelope, governed-action, ANA per-surface docks) are documented in `docs/UI_KIT_BACKEND_WIRING_AUDIT_2026-07-21.md`.
- **Verification without a DB:** every new wire-up is provable via backend contract tests with a mocked pool (`vi.mock('../../../db')`), the pattern established in `module3OperatingSystemRoutes.test.ts` and `labeling-pi-read.test.ts`. No live DB is required to prove a surface is correctly wired end-to-end at the route contract level.
