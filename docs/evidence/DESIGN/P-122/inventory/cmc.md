# CMC / Module 3: what the UI lost, hid, or never reached

**Investigation date:** 2026-11-10. This was a read-only investigation. Nothing in `/home/user/ClinicalSageAI-2-replit` was edited, committed or pushed.

**HEAD:** `8c7664b35` (local `concept2cure-v2`). `origin/concept2cure-v2` is now at `41d5daf56`, and nothing between the two touches a CMC client file, `server/api/cmc`, `server/routes/cmc-*`, `server/services/cmc`, the stability router or the surface registry. I checked this with `git diff --stat`.

**History source:** the working clone is shallow (`.git/shallow` has 38 cut points, the oldest at 2026-10-05). To see history before that, I made a separate blobless clone outside the repository, at `(session scratch)/full` (19,861 commits). Every hash below exists on `concept2cure-v2`.

**Baselines:**
- **(a) Just before the restructure:** `943b78cb7` (= `94f24dba0^`, 2026-11-01, "D5-0: the one work-area page pattern, in CSS").
- **(b) The richest state of the v2 CMC UI since 2026-09.** The client code only grew, so "richest" is a union of two points:
  - `4b0e3ff1e` (= `e1f3fd425^`, 2026-10-17): the last state with the change simulator and the market matrix.
  - `99acc88dc` (= `c5168933d^`, 2026-10-19): the last state where agency questions were worked inside CMC.
- **Earlier generations, for context:** the "Claude Design" CMC app, deleted 2026-08-04, and the legacy CMC platform, deleted 2026-03-22 to 2026-05-01. The founder's "1,000 features" matches these, not the v2 module.

---

## 0. Findings in brief

1. **The v2 CMC client did not shrink.**
   - The 14 CMC files under `client/src/concept2cure/v2/surfaces/` total 11,029 lines at baseline (a) and 11,509 at HEAD.
   - No CMC client file has been deleted since `2895218b8` (2026-08-04).
   - The three D5 commits (`94f24dba0`, `ff6825ef6`, `97c66423f`) changed layout. They removed **no** API call and **no** register.
2. **D5 did make the module look smaller.**
   - CMC now opens on Overview with only the **Module 3** half's four tabs showing.
   - The **Study records** half is behind a toggle: Substance & product, Specifications, Stability, Batch records and Change control, which hold all 18 registers. A first-time viewer sees no register at all.
   - The "What to do now / Next step" guidance band, the six-door "This work flows into" bar, and each tab's full grid of AnA asks were also removed.
3. **Two real capability removals fall inside the window (since 2026-09):**
   - `e1f3fd425` (2026-10-17) removed the **change impact simulator** and the **filing-path-by-market matrix** (six markets). Their replacement, the server-side SUPAC/EMA classifier, is **hidden whenever launch scope is enforced**, so production shows no change classification at all.
   - `c5168933d` (2026-10-19) **moved** the agency-question workflow out of CMC into Communication. This was a convergence, not a loss, but CMC is now a read-only index with an "Open on its letter" door.
4. **The demo was hurt by things other than deletions:**
   - **(i) The P-28 composition boundary.** Both showcase projects are biologics:
     - LMN-201 is a spirulina-expressed protein.
     - C2C-101 is an IgG1 antibody.
     - On both, Quality by design, the ICH check, the control strategy, the Q1E shelf life, batch poolability, the build board, compile and placement **all answer 409**.
     - Only C2C-201 (a small molecule, `scripts/demo/launch-demo/packs/biotech-work-content.mjs:136-160`) composes.
     - The seed's own comment says "The human-test walk found that the Module 3 build is refused on every demo project", citing `docs/evidence/HUMAN-TEST/J5/README.md`. Line 129 of that README: "Module 3 build refuses this project by name: it records a biologic".
   - **(ii) Thin demo data.** The seed (`scripts/demo/launch-demo/packs/work-areas.mjs:463 ensureCmc`) fills **7 of 18 registers**. The other 11 render "No … yet".
   - **(iii) Two features were broken in the running product until days ago:**
     - Specification edit, approve and history posted to `/NaN` and got a 500, until `a0541f379` (2026-10-26).
     - Batch release posted to `/api/cmc/batch-records/NaN/release` and got a 500, until `3c505e35b` (**2026-11-09**). A deploy older than that cannot release a batch.
   - **(iv) There is no chart anywhere in CMC.** No stability plot, no regression line or confidence band, no control chart, no dissolution overlay. A grep for `<svg`, `polyline` or `recharts` over the CMC surfaces finds none.
5. **The largest unreached server asset is the stability system at `/api/stability`** (`server/src/routes/stability.router.ts`, 3,196 lines, **71 endpoints**).
   - It covers sample management with barcodes and chain of custody, the pull calendar, analyst assignments, OOT rules and surveillance, CAPA, protocol templates, CSV result and excursion import, and P.8 export.
   - Its tables are in `C2C_MIGRATION_FILES`, and it was hardened as recently as 2026-09-23/25.
   - It has had **no screen since 2026-05-01**. No surface claims it, so the launch-scope gate classes it `unmapped`, and **production refuses it**.
   - It is also a **second stability store** beside CMC's own `stability_studies` table.
6. **The legacy CMC platform is what "1,000 features" refers to.**
   - It was `client/src/components/cmc/ComprehensiveCMCPlatformClean.jsx`: **26,825 lines and about 130 tabs**, plus about 65 other CMC components, a stability workbench and Module 3 editor tokens.
   - It was deleted by founder directive on 2026-04-28 (`bb243dfad`) and 2026-05-01 (`7a144fd1e`): *"all old outdated UI can be deleted that did not come from Claude Design. Keep the back end of course."*
   - Most of its backends were retired afterwards (`e073f9a0b`, 2026-10-05) or never worked (`/api/qc` storage is mostly `NOT_IMPLEMENTED`).

---

## 1. Timeline of commits that removed or hid CMC capability in the UI

All hashes are on `concept2cure-v2`. "(server)" marks a backend-only removal that took away something a UI could have reached.

| Date | Commit | What it removed or hid |
|---|---|---|
| 2026-02-21 | `b49e7495f` | `pages/CMCModule.jsx`, `CMCBlueprintPage.jsx`, `ComparabilityStudiesPage.jsx`, `Module32Form.jsx`, `SimpleCMCModule.jsx`, `pages/CMC/*` (8 files; "orphan/duplicate pages"). |
| 2026-03-22 | `602de50cf` | 42 legacy CMC components: `BatchAnalysisPanel`, `BatchRecordGenerator`, `ControlStrategyPanel/Tab`, `DesignSpaceTab`, `ExcipientCompatibilityAnalyzer`, `FormulationDecisionTree/Predictor`, `ICHComplianceChecker`, `MethodValidationGenerator/Simulator`, `PPQCPVTab`, `QualityRiskAssessment`, `RiskFMEATab`, `SpecificationAnalyzer`, `SpecificationsTable`, `SubmissionPreparator`, `SupplyChainPanel`, `CMCCopilot`, `CMCDocumentAuthoring`, … ("dead CMC files, unify module entry point"). |
| 2026-03-30 to 2026-04-04 | `36f997067`, `83fa7f6cf`, `3ea8cc863`, `fc9a7943b` | `Module3Benchling.jsx`, `Module3Manual.jsx`, `Module3QualityPage.jsx`, `Module32Tour`, `DOETab`, `ImpactGraphTab`, `IRStudio`, `GanttChartView`, the stability `AssignmentsPanel` / `DependenciesPanel` / `MethodsPicker`. |
| 2026-04-28 | `bb243dfad` | "Delete every surface not built by Claude Design": `pages/cmc/CMCPage.jsx`, `AnalyticalMethodsStubPage`, `ComparabilityStudiesStubPage`, `CMCBlueprintGenerator`, `RealTimeMonitoringDashboard`, `BatchOpsDashboard`, the stability help and panels. ZenApp's legacy return was collapsed. |
| 2026-05-01 | `7a144fd1e` | **The big one** (founder directive, 339,085 lines across the client). CMC part: `modules/CMCModule.jsx` (934 lines), `components/cmc/ComprehensiveCMCPlatformClean.jsx` (26,825), `ComprehensiveCMCPlatform.jsx` (2,031), `DocumentAuthoringFixed.jsx` (4,846), `ManufacturingProcessPanel.jsx` (3,542), `ProcessTab` (2,206), `MethodDetails` (1,921), `AnalyticalMethodsTab` (1,577), `MbrEditor`, `EbrViewer`, `DeviationCapaBoard`, `TechTransferPanel`, `SiteAndEquipmentPanel`, `MaterialsBOMPanel`, `PackagingSerializationPanel`, `ParameterMatrix`, `ProcessCanvasEditor`, `DigitalTwinCanvas`, `SystemSuitabilityTrending`, `ValidationLifecyclePanel`, `RegulatorViewDrawer`, `regulatory/AutoCheckerPanel`, `regulatory/IRStudio`, `CMCReportsTab`, the editor tokens `BatchAnalysesTable` / `ControlStrategyBlock` / `P8Table` / `PPQSummary` / `SpecsTable`, `routes/stability/SamplingWorkbench.tsx` and `SampleChainPanel.tsx`. Backends were explicitly kept. `App.jsx` at `7a144fd1e^` contains no CMC route, so the platform was probably already unrouted after `bb243dfad` (not proven). |
| 2026-07-30 | `cccb1ad63` | `concept2cure/intelligence/surfaces/Cmc.tsx` (dead Phase-11 cluster). |
| 2026-08-04 | `2895218b8` | The "Claude Design" CMC app `client/src/concept2cure/cmc/*`: Overview 486, Stability 449, Specifications 399, Batch 285, Change 285, Comparability 216, Blueprint 191, DrugSubstance 190, Global 117, Copilot 94; plus `services/cmcService.ts` (1,339) and `hooks/useCMC.ts` (768). It was unreachable at the time ("one shell" refactor). Calls it made to endpoints that no longer exist: change-impact simulator, blueprint generate, global-compliance transform, cmc-copilot, stability Arrhenius projections, impurity thresholds and justification, spec-test justification, batch trends. |
| 2026-08-14 | `71ad5befd` | v2 CMC went from 12 tabs to 9. **Copilot tab deleted** (its prompts moved to AnA). **Global filings tab removed** (the matrix moved inside Change control). Drug substance and Drug product merged. Overview 4-tile KPI strip dropped. Stability 6 tiles became 2. |
| 2026-09-19 to 09-23 (server) | `3d7f3b486`, `917289202` | The CMC playbook fabrication; `/api/cmc/collaboration` (cross-tenant leak; replaced by `/api/tasks/messages`). |
| 2026-10-05 (server) | `e073f9a0b` | Retired the `/api/cmc` routers nothing called: copilot, blueprint-generator, change-impact-simulator, global-compliance, manufacturing-tuner, preclinical-translator, audit-risk-monitor, portfolio, documents, workflows, `module3/auto-draft`, projectRoutes. Replacements are named in `server/bootstrap/register-core-routes.ts:73-125`. The process-tuning advice, scale-up drafts and audit-risk monitor have **no** replacement. |
| 2026-10-15 (server) | `f4a430a3b` | CMC refuse-to-file pattern seeds (`seeds/cmc-rtf-patterns.ts`) are no longer seeded. |
| 2026-10-17 | `e1f3fd425` | **Change impact simulator** removed: change type, description, six markets (FDA, EMA, PMDA, NMPA, Health Canada, MHRA), filing path per market, "Regulatory Change Impact Assessment" sent to the editor, "Refine with AnA". The **"Filing path by market — SUPAC / ICH Q12 / Reg. 1234-2008" matrix** (`CmGlobal`) and the Overview KPI interface were also removed. Replaced by `CmcVariationAssessment.tsx`, which uses the server classifier and covers **FDA and EMA only**. It renders only when `launchScopeEnforced === false` (`CmcModule.tsx:2902-2912`). This was a mixed multi-area "audited remedies" commit. |
| 2026-10-19 | `c5168933d` | **Agency questions leave CMC.** The inline workflow went: Log question, Assign (inline edit), Draft response into editor, Open drafted response, Send for review, Back to drafting, Close (with confirm), Closed-file view, Reopen, Task, Ask AnA. It moved to Communication's letter (`AgencyResponses.tsx`), and CMC keeps a read-only `CmcModule3QuestionIndex` plus `CmcEarlierQuestionFile` (`cmcAgencyQuestions.tsx`). `reg_questions` is made read-only by migration and trigger; `POST`/`PATCH /api/cmc/agency-questions` now answer 410. |
| 2026-10-22 | `ef71545c8`, `f4777978a` | **Composition boundary at every entry point.** QbD, the ICH check, the control strategy, Q1E shelf life, poolability, build state, compile, build-section and placement answer **409** for a biologic or a non-US-IND project. This hides nothing in code, but on a biologic demo project it disables most of the computed CMC. |
| 2026-11-01 | `94f24dba0` (D5-1) | Flat 9-tab bar became **two halves** (only the active half's tabs render). `StageBand` ("what this step is / what to do now / NEXT STEP") deleted; its text survives only as AnA context. `CmConnectBar` (Module 3 dossier, Document editor, Vault, Project, Tasking, Collaborate) deleted. Each tab's `CmHead` with kicker, orange "Ask AnA" and its **full** suggestion grid became one page-level row of **3** starters, the first of them generic. |
| 2026-11-01 | `ff6825ef6` (D5-2) | Register cards became flat sections. Overview's answer banner ("Is my package ready?" plus the primary "Advance the next section") was decomposed into a grey line and two ghost buttons. Module 3 build's 5 and QbD's 6 KPI tiles became one grey line each. Portfolio headers "RPI" and "IR overdue" were renamed. |
| 2026-11-02 | `97c66423f` (D5-2 finished) | Stability (2), Batch (4) and Approvals & audit (4) KPI tiles became grey lines. "Place into submission" went from orange CTA to ghost, and its explanation went into a disclosure. One state vocabulary. |
| 2026-11-02 | `428795100` | `CmBack` replaced by the shared `ProjectBack` (reads "← Project", not the project name). |

The founder's earlier complaints on the same theme are quoted in commit messages:
- `a0541f379` (2026-10-26): "I was very dismayed to see the CMC UI and the lack of features we have built that are not showing".
- `0edd86472` (2026-10-31): "My cmc, biostatistics, tasking, projects is all gone or utter trash now".
- `94f24dba0` (P-78, 2026-10-31): "this looks like Claude built it".

---

## 2. Capability table

The value column assumes a paying US small-molecule IND sponsor's CMC or regulatory team. "Boundary" means `server/services/cmc/composition-scope.ts` (P-28): small-molecule Module 3 for a US IND only. It refuses biologic/ATMP substances, NDA/ANDA/BLA marketing applications, EU CTA, Health Canada CTA and Japan CTN/J-NDA with a 409.

### 2A. In the UI at baseline (a) or (b), and gone or less reachable at HEAD

| # | Capability (a CMC lead's words) | Where it was or is | What the UI has now (HEAD) | Server status | Value | Effort |
|---|---|---|---|---|---|---|
| A1 | "Open CMC and see every work area: substance and product, specs, stability, batches, change control" | `CmcModule.tsx@943b78cb7`: sticky `.cm-sub` bar listing all 9 tabs | `CmHalves` (`CmcModule.tsx:664`). Opens on Overview (`useState('overview')`, line ~3218) showing only Overview / QbD / Module 3 build / Approvals & audit. The five Study-records tabs, and all 18 registers in them, render only after the "Study records" toggle. | n/a | **HIGH**: in a demo the registers are invisible on first view. | **S**: render both halves' tabs in one row, or label the toggle with counts. Don't revert. |
| A2 | "Tell me what this step is and what to do next, then take me to the next step" | `StageBand` (`ProjectStages.tsx`) over `CMC_NAV.blurb/now`, `CmcModule.tsx@943b78cb7` | `now` survives only as `anaContext.facts.whatToDoHere`, read when you click the starter "What do I do on X?" (an AnA round-trip). `blurb` is only a tab tooltip. No Next. | n/a | MED: onboarding and demo legibility. | **S**: print `now` as each tab's `sec-sub` line and add a "Next: …" link. |
| A3 | "Where does this work go? Module 3 dossier, document editor, Vault, project, tasks, discussion" | `CmConnectBar`, `CmcModule.tsx@943b78cb7` | `CmPush` per register (Module 3 doc → project Author step through the `dossier` alias in `registryModel.ts:964`, Vault, Task, Discuss) and the back link. The **Document editor** door is gone from CMC. | n/a | LOW | S |
| A4 | "One-click AnA asks for this tab" | `CmHead` grid of every `CMC_SUGGEST[tab]` entry (4 for Substance & product and Stability), plus orange Ask AnA ×9 | One row of 3: one generic ask plus the first 2 suggestions (`cmStarters`, `CmcModule.tsx:640`). Every suggestion after the 2nd is off screen. For example, Stability's "Show every study trending toward a limit" and "Draft the stability summary for §3.2.S.7" are visible to AnA but have no button. | n/a | LOW | S |
| A5 | "Headline numbers I can scan" (active studies, outside limits, batches, pending release, open deviations, average yield, sections approved, stale, blocked) | `.cm-kpis` / `.reg-kpis` tiles in `CmcModule.tsx`, `CmcModule3Build.tsx`, `CmcQuality.tsx` @943b78cb7 | The same figures as one grey sentence per tab, with tone kept on the figures that block (`97c66423f`, `ff6825ef6`). | n/a | LOW | S |
| A6 | "Is my CMC package ready? Do the next thing." | Overview `AnswerLead` banner with primary "Advance the next section" | `overviewMeta()` line plus two ghost buttons in Section approvals; the ask is the first starter. | `/api/cmc/module3-board`: mounted. Refused for an out-of-boundary project. | LOW-MED | S |
| A7 | "Model a CMC change: which filing (AR / CBE-0 / CBE-30 / PAS; Type IA / IB / II) in each market, and a change-impact memo" | `CmChange` simulator, `CmcModule.tsx@4b0e3ff1e` (browser rules `filingPath()`, 9 change types × 6 markets, memo to editor) | `CmcVariationAssessment.tsx` (server classifier, FDA + EMA, SUPAC tier, BE, rationale, validation requirements, affected sections, memo to editor). **Rendered only when launch scope is NOT enforced.** Production shows "Postapproval variation assessment is outside this release". | `POST /api/cmc/variations/classify` (`routes.ts:2474`, `supac-classifier.ts`): mounted, refuses under launch scope; out of the P-28 boundary (postapproval is not IND). The removed browser version decided filing categories in the client, which RULE 2 forbids, so it must not come back as it was. | MED for an IND customer, who needs IND-amendment (21 CFR 312.31) classification, not PAS/CBE. HIGH for a commercial customer. | S to show (founder boundary decision); M+ for an IND-amendment classifier (new capability, founder). |
| A8 | "Filing path by market for every open change" | `CmGlobal` (`CmcModule.tsx@4b0e3ff1e`; a tab of its own until `71ad5befd`) | Nothing. | Same classifier. Boundary. | MED | M (one classifier call per open change; boundary decision) |
| A9 | "Work FDA's CMC information requests where the Module 3 is: log, assign, draft, review, close, reopen" | `CmPathway` in `CmcModule.tsx@99acc88dc` (calls `/api/cmc/agency-questions` POST/PATCH) | Read-only Module 3 question index, earlier-file history and "Open on its letter" into Communication (`cmcAgencyQuestions.tsx`, `CmCorrNotice`). The whole workflow, now with Part 11 approval, lives on the letter (`AgencyResponses.tsx`). | `GET /api/cmc/agency-questions` live; POST/PATCH 410 by design; `reg_questions` read-only (migration `20261019b`). The letter routes are under `/api/concept2cure/projects/:projectId/agency-questions`. | **HIGH** (IR turnaround is core CMC work). The capability exists; it is one hop out of context. | **M**: embed the letter's response controls in Approvals & audit. Never revert `c5168933d` (migration and trigger, RULE 1). |
| A10 | "CMC Copilot tab" | `CmcModule.tsx@71ad5befd^` | AnA panel on every tab (`ANA_SURFACE_CTX.cmc.suggestions`) | `/api/cmc` copilot router retired (`e073f9a0b`); AnA tools `find_cmc_guidance`, `get_cmc_requirements`, `explain_cmc_topic` | LOW | none |
| A11 | "Edit a batch record I logged" | Never in the v2 UI (only Log and Release) | No Edit on the Batch tab. | `PUT /api/cmc/batch-records/:id` (`batchRecordRoutes.ts:334`): mounted, **no caller**. The reach guard `cmcWorkAreaReach.test.ts` is verb-blind (`isCalled`, about line 413) and reads the `GET /:projectId` call as this route's caller. | MED | S (one row action) plus S (make the sweep verb-aware) |
| A12 | "Edit, approve and see the history of a specification" | `CmSpecs` | Works at HEAD. **Dead (500) in the product until `a0541f379` (2026-10-26)**: uuid ids coerced to NaN. | `specificationRoutes.ts`: mounted, live | HIGH | done; check the demo deploy is at or after `a0541f379` |
| A13 | "Release a batch under signature" | `CmBatch` | Works at HEAD (refusals now reach the user). **Dead (500) until `3c505e35b` (2026-11-09)**: NaN id. | `POST /api/cmc/batch-records/:id/release`: live | HIGH | done; check the deploy is at or after `3c505e35b` |
| A14 | Method library and process validation shown once | Each register mounted once | `CmMethodLibrary` mounts on Specifications (`CmcModule.tsx:1465`) **and** Substance & product (`:2947`). `CmProcessValidation` mounts on Batch (`:2626`) **and** Substance & product (`:2961`). Two local row states per register can desync after a write: the same defect `71ad5befd` fixed for comparability. | n/a | LOW (defect) | S |
| A15 | "Show me the CMC module working on our programme" | — | On LMN-201 and C2C-101 (both biologics) the board, QbD, ICH check, control strategy, Q1E, poolability, compile, build-section and placement answer 409 with the boundary's reason (`ef71545c8`). Only C2C-201 composes. | Boundary, by design (P-28) | **HIGH** for the demo | **S**: demo on C2C-201, or a founder decision to widen the boundary (L) |
| A16 | "Populated registers" | — | The seed fills DS, DP, methods, specs, stability with results, batches and QC results (7 of 18). Empty: reference standards, impurities, dissolution, characterisation, manufacturing process, process validation, formulation, materials, container closure, change control, comparability. | Routes live | **HIGH** for the demo | **S**: extend `ensureCmc` in `scripts/demo/launch-demo/packs/work-areas.mjs:463` |

### 2B. Capabilities a CMC lead expects whose engine exists server-side, but no CMC screen shows it

| # | Capability | Where it is | What the UI has now | Server status | Value | Effort |
|---|---|---|---|---|---|---|
| B1 | **Stability trend chart**: results vs time per attribute and condition, regression line, one-sided 95% confidence bound, spec limit, projected crossing | Engines `services/cmc/shelf-life.ts` (`ShelfLifeResult.regression{slope,intercept,r2,residualSd,n,df}`, `confidence`) and `stability-trending.ts` | Tables and text only. No `<svg>` or chart in any CMC file. The legacy platform had control charts and trending. | `POST /api/cmc/stability-studies/:id/shelf-life` and `/trending`: live, called. Refused for an out-of-boundary study. | **HIGH** | M (the server should also return the band points, so the figure comes from the engine, RULE 2) |
| B2 | **Stability operations**: pull calendar and due list, multiple storage conditions per study, samples with barcode labels, chain of custody, analyst assignments, second-person result review, CSV result import, temperature/RH excursion import, configurable OOT rules, OOT surveillance across studies, CAPA from OOT, protocol templates and apply-protocol, in-use studies, P.8 push and export (PDF/zip), audit | `/api/stability` (`server/src/routes/stability.router.ts`, 71 endpoints). Legacy UI: `routes/stability/SamplingWorkbench.tsx`, `SampleChainPanel.tsx`, the stability tabs of `ComprehensiveCMCPlatformClean.jsx` (deleted `7a144fd1e`) | CMC Stability tab: register study (one condition, pull points, parameters), record result, Q1E estimate, trend, close-out shelf life under signature, poolability, history (`/api/cmc/stability-studies`) | Mounted (`register-inline-routes.ts:236`). Tables deployed (`022/024/026/030_stability*`, `20260728_stability_*` in `migration-set.mjs:668-794`). Uses the same Q1E and trend engines. **No surface claims `/api/stability`**, so the launch-scope gate (`server/services/entitlements/launch-scope-api.ts`) classes it `unmapped` and **production refuses it**. Five handlers are 501/410 (PUT and PATCH study, label, request-signoff, chain upload). **Second stability store** (`stab_*` beside `stability_studies`). | **HIGH** (daily work of a stability coordinator) | **L**: converge onto the CMC study (zero duplication). Claiming the prefix alone would ship two stability records. |
| B3 | **Dissolution f2 similarity** between two recorded profiles | `services/cmc/dissolution-comparison.ts` (`compareDissolutionProfiles`); AnA tools `compare_recorded_dissolution`, `assess_dissolution_similarity` | The register's empty-state hint says "an f2 comparison is computed from the recorded profiles" (`cmcRegisters.tsx:1690`), but no control shows one. Chat only. | No HTTP route. Engine imported only by `AnaToolExecutor.ts:17853` and `bioequivalence-knowledge.ts`. | HIGH-MED | S-M (a route plus a "Compare" row action) |
| B4 | **ICH M7 class and control option per impurity** | `services/cmc/impurity-assessment.ts`, `mutagenic-impurity-knowledge.ts`; AnA `classify_mutagenic_impurity`, `control_mutagenic_impurity`, `classify_impurity` | The impurity register records the M7 inputs and shows a "required for M7" chip (`cmcRegisters.tsx:1619-1629`). The verdict appears in the composed §3.2.S.3.2 and in chat. | Engine live (used in compose and write-through) | MED | S-M |
| B5 | **ICH Q3A/B/C/D thresholds, residual-solvent classes, elemental PDEs, Q6A/Q6B test sets, Q1A zones, PV stages**, shown beside the impurity and spec registers | `/api/global-ri/impurities/*` (6), `/cmc/*` (2), `/stability/*` (4), `/process-validation/*` (2) | Not in CMC. The generic Global RI browser (`GlobalRiBrowser.tsx:74`) runs only the **last** route of each capability, so 4 of 14 are reachable there and 10 not at all. Impurities has **no** AnA tool. | Mounted, deterministic, claimed by the `global-ri` surface | MED | S |
| B6 | **Upload a CMC source document and have it extracted into a §3.2 section** | AnA `module3_classify_source` (`services/ana-ri/module3-command-handlers.ts`). HTTP route `/module3-os/classify-artifact` deleted 2026-10-05 | The build board's own state hints say "upload a source document" (`CmcModule3Build.tsx:170`), but there is no upload control. Vault-document linking exists (`CmcSectionEvidence.tsx`). | AnA only | MED | M |
| B7 | **Guided CMC interview** (question flow that writes the registers) | `services/cmc/interview-sessions.ts`, `interview-commit.ts`, `interview-composition-scope.ts`; table `cmc_interview_sessions` (`20260906_cmc_interview_sessions.sql`); flows `intelligence-questions/flows/cmc-specification*.ts`, `stability-study.ts` | Chat only | AnA only | MED | M |
| B8 | Open a compiled §3.2 section in the document editor to edit its narrative | — (never in v2) | Read-only preview (`CmcSectionReview`) and approve. "Open in editor" exists only for the control strategy (`CmcQuality.tsx:221`). | Compose is deterministic; the `draft_artifact_created` state exists | MED | M |
| B9 | Re-compose one section | `POST /api/cmc/module3-os/sections/:pid/:key/refresh` | Covered by "Build" (`POST /build-section`) and AnA `module3_refresh_stale` | Mounted, uncalled by design (`REACHED_ELSEWHERE` in `cmcWorkAreaReach.test.ts:309`) | none | none |
| B10 | Propose a CMC change in the lifecycle store | `POST /api/cmc-changes` (`server/routes/cmc-changes.routes.ts:78`, `cmc_change_controls`) | GET is read by `BiopharmaSpecialty.tsx:784` (LCM, outside CMC). No create. A **second change store** beside `/api/cmc/change-control`. | Mounted | LOW (duplication to converge) | M |
| B11 | QC operations: OOS investigations (timeline, root cause, CAPA), QC batch release (review, CoA, genealogy, criteria), micro tests and EM schedule, reference standard usage, expiry and disposal, spec versions | `/api/qc` (`server/routes/qc.routes.ts`, 38 endpoints). Legacy QC tabs of `ComprehensiveCMCPlatformClean.jsx`. | None | Mounted. Storage **mostly stubs** (26 `NOT_IMPLEMENTED` in `server/storage.ts`, mapped to 501). Unmapped, so refused in production. Overlaps CMC's reference-standard, batch and spec registers. | MED (OOS is high value but QMS-adjacent) | L |
| B12 | Manufacturing execution: equipment, batches, deviations, test results, AI review, batch-release check | `/api/manufacturing` (`server/routes/manufacturing-routes.ts`, 13) | None | Mounted; claimed by an MDX/IVD surface (`ui-surface-registry.ts:951`); no client caller; outside the launch catalog | LOW for an IND | L (founder decision) |
| B13 | Biologic comparability, analytical similarity, immunogenicity, biosimilar pathway | `/api/biopharma/bla` (7, called by `BlaAssessmentWorkbench.tsx` inside `NdaCockpit`, not CMC, not a launch surface); `/api/biologics` (6, no caller) | None in CMC. The CMC comparability register (ICH Q5E record plus signed approve) exists. | Mounted; **outside the boundary** (biologics) | HIGH for biologic clients, but a founder decision | L |
| B14 | Dead code | `services/cmc/aiInsights.ts` (0 importers); `services/cmc/readiness.ts` (MCP tools only) | — | — | — | delete or ignore |

### 2C. Legacy-only capabilities (deleted 2026-03 to 2026-08, backend retired or stubbed). Listed so nobody rebuilds them blind

Source: `client/src/components/cmc/ComprehensiveCMCPlatformClean.jsx@7a144fd1e^`, 26,825 lines. A copy for reading is at `(session scratch)/legacy_ComprehensiveClean.jsx`.

| Tab group | Its tabs |
|---|---|
| Top level | analytical, process, stability, quality, regulatory, manufacturing, supply chain, risk, document authoring, intelligence, risk management, audit docs |
| Stability | protocol, test parameters, timepoints, timepoint grid, data entry, results grid, workflow, CAPA, OOT monitor, detection rules, investigations, predictions, templates, strategy, workbench, tasks, P.8 export, audit trail, AI assistant |
| QC | batch release, control charts, trending, investigations, specifications, e-signatures, lab capacity, SST testing and templates, dissolution, genealogy, microbiology, QC coach, flow health, data lineage, what-if sim, ERP import, daily digest, auto release, ML predictions, compliance, gatekeeper, decisions, knowledge graph, deviations, reference standards |
| Regulatory | overview, compliance, calendar, correspondence, intelligence, change control, commitments, portfolio, gatekeeper, M3 builder, eCTD packager |

Backends it called that **no longer exist**: `/api/supply-chain/*`, `/api/strategy/*` (CQA, controls, gaps, P.3.4 draft), `/api/analytical/methods*`, `/api/reg/*`, `/api/cmc/{risks,tasks,stage-gates,batch/genealogy,batch/lineage,facility/environmental-conditions,dashboard/summary,ai/insights,audit/trail,compliance/check-rules,validation/issues,supply/materials}`.

Backends that **still exist**: `/api/stability/*` (B2), `/api/qc/*` (B11, stubbed), `/api/cmc/process-validation`.

Every one of these would be a new capability under RULE 2 unless it maps onto a catalog item. Most map to Stability (B2), QC/OOS (B11, QMS) or the manufacturing twin (excluded by RULE 2).

---

## 3. Endpoint count

Counts come from a script that extracts routes from each router file (including multi-line declarations), resolved against their mounts in `server/bootstrap/register-*-routes.ts`. Callers come from greps over non-test `client/src`, confirmed by hand, including bases held in variables (`CmcRegisterLinks`, `CmcSectionEvidence`) and register configs (`cmcRegisters.tsx`, which uses PUT for edits through `RegisterCard`).

| Router (mount) | Endpoints | With a client caller | Without |
|---|---|---|---|
| `/api/cmc` (`routes.ts`, 66) | 66 | 66 (`/variations/classify` only when launch scope is off) | 0 |
| `/api/cmc/specifications` | 5 | 5 | 0 |
| `/api/cmc/batch-records` | 4 | 3 | 1 (PUT `/:id`) |
| `/api/cmc/module3-os` (4 routers) | 20 | 19 | 1 (POST `…/refresh`, reached by build-section and AnA) |
| `/api/cmc/module3-board` | 1 | 1 | 0 |
| `/api/cmc/agency-questions` | 3 | 1 (GET) | 2 (POST/PATCH answer 410 by design) |
| **`/api/cmc/*` subtotal** | **99** | **95** | **4** |
| `/api/cmc-changes` | 2 | 1 (GET, from LCM `BiopharmaSpecialty.tsx`, not CMC) | 1 (POST) |
| **CMC routers total** | **101** | **96** | **5** |
| `/api/stability` | 71 | 0 | 71 (refused in prod: unmapped) |
| `/api/qc` | 38 | 0 | 38 (mostly 501 stubs; unmapped) |
| `/api/manufacturing` | 13 | 0 | 13 |
| `/api/global-ri` CMC (cmc, stability, impurities, PV) | 14 | 4 (generic Global RI browser, not CMC) | 10 |
| `/api/biologics` | 6 | 0 | 6 |
| `/api/biopharma/bla` | 7 | 7 (`BlaAssessmentWorkbench` in `NdaCockpit`, not CMC) | 0 |
| **Adjacent CMC-domain total** | **149** | **11** | **138** |
| **Grand total** | **250** | **107** (95 from the CMC work area itself) | **143** |

Of the 5 uncalled CMC-router endpoints, only **2 are real gaps**: batch edit and the `cmc-changes` create. The other three are deliberate.

---

## 4. Recommendation: what to restore or reach first

The order is how a paying CMC/regulatory team would rank it.

**Reverting whole commits is not recommended for any commit in the window.** Reasons are in §5. Every item below re-adds or reaches.

1. **Make what exists visible before the next demo** (S, days, no new capability):
   - (a) Show all nine tabs at once. Change `CmHalves` (`CmcModule.tsx:664`) to render both halves' tabs in one grouped row, or label "Study records · 18 registers". This alone answers "where are the features".
   - (b) Demo CMC on **C2C-201**. On LMN-201 or C2C-101 the module's computed features are refused by P-28. Widening the boundary to biologics is the founder's decision (L: ICH Q6B, Q5A(R2), Q5C, cell bank, `shared/constants/launch-scope.ts`).
   - (c) Extend the demo seed (`work-areas.mjs:463 ensureCmc`) to the 11 empty registers, and run one compile so the Module 3 build shows composed sections.
   - (d) Confirm the deployed build includes `a0541f379` (spec edit, approve and history) and `3c505e35b` (batch release). Without them, both 500.
   - (e) Put each tab's `now` sentence back as its sub-line, with a "Next" link (A2), and restore all of each tab's suggestions (A4).
2. **Stability that looks like stability** (M): an engine-returned trend chart on each study (B1). Then plan the convergence of `/api/stability` operations onto the CMC study record (B2, L). Do **not** simply claim `/api/stability` in the surface registry: that ships two stability stores (working agreement: zero duplication).
3. **Answer FDA's CMC questions in context** (M, A9): render the letter's response controls (record, write, draft with AnA, approve under Part 11, close) inside Approvals & audit, from the components `c5168933d` moved them to (`AgencyResponses.tsx`).
4. **Reach the AnA-only engines on their registers** (S-M each), as "reach X", not "build":
   - f2 on Dissolution (B3);
   - M7 class and control on Impurities (B4);
   - ICH Q3/Q6/Q1A/PV reference beside the impurity, spec and stability registers from `/api/global-ri` (B5);
   - source-document upload into a §3.2 section (B6);
   - the CMC interview (B7);
   - open a compiled section in the editor (B8).
5. **Batch edit** (S, A11). Make `cmcWorkAreaReach.test.ts`'s `isCalled` verb-aware so a GET can no longer stand in for a PUT; show it failing first on `PUT /batch-records/:id`. Remove the duplicate register mounts (A14).
6. **Change classification** (A7/A8): a founder decision. For a US IND, the right engine is IND-amendment classification (new capability). Showing the existing PAS/CBE/Type IA-II classifier in production needs the boundary widened. Do not bring back the browser `filingPath()` rules.
7. **Legacy-only items (§2C):** QC/OOS, EBR/MBR, supply chain, tech transfer, DOE, design space, FMEA, digital twin. These are outside the launch catalog (RULE 2), and their backends are retired or stubbed. Treat them as a founder product decision, not restoration work.

---

## 5. Commits that mix removals with fixes that must be kept

- **`94f24dba0`, `ff6825ef6`, `97c66423f`, `428795100` (D5).** At least ten later commits depend on the new structure:
  - `4d0ebe8c0` (P-111 `WorkProjectTasks` mount);
  - `be25f5605` (refusal shown, not "failed read");
  - `8e7db40f6`, `34406add3` and `bd092bbaa` (P-110 signed suitability);
  - `fcdc92bf1` (a limit approved only with a fit method);
  - `3c505e35b` (batch release NaN);
  - `10e643a0e`, `31e8de243` (D0-16 page frame) and `c1a96e709`.

  The D5 commits also carry keepers:
  - `ff6825ef6` fixed the `.tone-idle` override that tinted all 579 empty states app-wide, the doubled "· ·" scope note and the wrong `lowSub` wording.
  - `97c66423f` added `cmcStateWord`, so raw tokens such as `COMPLETED` and `capable` no longer reach the screen.
  - `94f24dba0` gave QbD and Module 3 build their AnA suggestion lists and fixed the vacuous test parser.
  - `428795100` fixed the starter row's accessible name.

  Re-add A1-A4 instead.
- **`e1f3fd425`.** A multi-area "audited service, governance, and UI integration remedies" commit; only 296 of its deletions are in CMC. The removed simulator computed regulatory filing categories in the browser, which RULE 2 forbids. Not revertable.
- **`c5168933d`.** Ships migrations (`20261019b_reg_questions_read_only`, `20261018b` amended in place) and changes to Communication. Reverting would leave a read-only table under a client that writes to it, and it would bring back an unsigned "close". RULE 1 forbids a DROP-style undo. Re-embed instead (item 3).
- **`7a144fd1e` / `bb243dfad`.** Founder-directed deletions of the pre-Claude-Design UI (hundreds of thousands of lines, the old component system). Mine them for requirements only.

---

## What already exists (RULE 3): searches run

- **Client, HEAD.**
  - Every file in `client/src/concept2cure/v2/surfaces/` matching `Cmc*` or `cmc*`, plus `BiopharmaSpecialty.tsx`, `ChangeAssessment.tsx`, `NdaCockpit.tsx`, `BlaAssessmentWorkbench.tsx` and `GlobalRiBrowser.tsx`.
  - Greps for `/api/cmc`, `/api/cmc-changes`, `/api/stability`, `/api/qc`, `/api/manufacturing`, `/api/biologics`, `/api/biopharma/bla`, `/api/global-ri`, `shelf-life`, `trending`, `poolability`, `process-capability`, `refresh`, `<svg|polyline|recharts`, `launchScopeEnforced`, `M7|mutagen`, `f2`, `interview`.
  - `BatchDraft.tsx` is not CMC: it is batch **document** drafting through `POST /api/claude/batch`.
- **Client, history.**
  - `git log --diff-filter=D --name-only -- client` over the full history (3,281 deleted client paths), filtered for `cmc|stabil|module-?3|batch|specif|impur|comparab|manufact|qbd|control-?strat|process-?valid|formulat`. That gives 201 CMC files across 12 commits; the list is in §1.
  - `git log` of each v2 CMC file back to 2026-07-13 (`a32a0067c`, where the v2 module was 681 lines of fixtures).
- **Server.**
  - All of `server/api/cmc/*`, `server/routes/cmc-*`, `server/routes/global-ri/{cmc,stability,impurities,process-validation}.routes.ts`, `server/src/routes/stability.router.ts`, `server/routes/qc.routes.ts`, `manufacturing-routes.ts`, `biologics-routes.ts` and `biopharma/bla-workbench.ts`.
  - The mounts in `server/bootstrap/register-{core,inline,regulatory,document,clinical-intel}-routes.ts`.
  - The surface API claims in `shared/constants/ui-surface-registry.ts:559-622` and the launch scope in `shared/constants/launch-scope.ts` and `server/services/entitlements/launch-scope-api.ts`.
  - An importer map for every `server/services/cmc/*.ts`, and the AnA tool names matching CMC terms in `server/services/ana*`.
  - The retired-router notes at `register-core-routes.ts:73-200`.
- **Data.** `scripts/demo/launch-demo/packs/work-areas.mjs`, `biotech-work-content.mjs`, `lumen-content.mjs`, and `scripts/db/migration-set.mjs` for the stability and CMC tables.
- **The repo's own reach guard.** `client/src/concept2cure/v2/__tests__/cmcWorkAreaReach.test.ts`, with its `REACHED_ELSEWHERE`, `RETIRED_AND_REFUSED` and `CALLER_NOT_VISIBLE_TO_THIS_SWEEP` lists. It sweeps only `/api/cmc`, not `/api/stability`, `/api/cmc-changes` or `/api/global-ri`, and its matcher ignores the HTTP verb.
